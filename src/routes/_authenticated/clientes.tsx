import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users, ShoppingBag, Repeat, Calendar, Plus, Check, ChevronsUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "@/hooks/use-profile";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  size: string;
  product_id: string | null;
  products: { name: string; team: string | null; image_url: string | null } | null;
};

type Order = {
  id: string;
  order_number: number | null;
  status: string;
  total_value: number;
  discount: number;
  payment_method: string;
  created_at: string;
  customer_id: string | null;
  order_items: OrderItem[];
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
};

type CustomerAgg = Customer & {
  totalSpent: number;
  ordersCount: number;
  lastOrderAt: string | null;
  teams: Set<string>;
  orders: Order[];
};

function ClientesPage() {
  const { data: profile } = useProfile();
  const storeId = profile?.store?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"top" | "recent" | "name" | "orders">("top");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [teamOpen, setTeamOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);


  const { data: customers, isLoading: lc } = useQuery({
    queryKey: ["customers", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("store_id", storeId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const { data: orders, isLoading: lo } = useQuery({
    queryKey: ["customers-orders", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_value, discount, payment_method, created_at, customer_id, order_items(id, quantity, unit_price, size, product_id, products(name, team, image_url))",
        )
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  // Aggregate per customer
  const aggregated = useMemo<CustomerAgg[]>(() => {
    if (!customers) return [];
    const byId = new Map<string, CustomerAgg>();
    customers.forEach((c) =>
      byId.set(c.id, { ...c, totalSpent: 0, ordersCount: 0, lastOrderAt: null, teams: new Set(), orders: [] }),
    );
    (orders ?? []).forEach((o) => {
      if (!o.customer_id) return;
      const agg = byId.get(o.customer_id);
      if (!agg) return;
      agg.orders.push(o);
      if (o.status !== "cancelado") {
        agg.totalSpent += Number(o.total_value ?? 0) - Number(o.discount ?? 0);
        agg.ordersCount += 1;
      }
      if (!agg.lastOrderAt || new Date(o.created_at) > new Date(agg.lastOrderAt)) {
        agg.lastOrderAt = o.created_at;
      }
      o.order_items?.forEach((it) => {
        if (it.products?.team) agg.teams.add(it.products.team);
      });
    });
    return Array.from(byId.values());
  }, [customers, orders]);

  const allTeams = useMemo(() => {
    const s = new Set<string>();
    aggregated.forEach((c) => c.teams.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [aggregated]);

  const filtered = useMemo(() => {
    let list = aggregated;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.instagram ?? "").toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q),
      );
    }
    if (teamFilter !== "all") list = list.filter((c) => c.teams.has(teamFilter));
    if (statusFilter === "com-pedidos") list = list.filter((c) => c.ordersCount > 0);
    if (statusFilter === "sem-pedidos") list = list.filter((c) => c.ordersCount === 0);
    if (statusFilter === "inativos") {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      list = list.filter((c) => c.lastOrderAt && new Date(c.lastOrderAt).getTime() < cutoff);
    }

    const sorted = [...list];
    if (sort === "top") sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (sort === "orders") sorted.sort((a, b) => b.ordersCount - a.ordersCount);
    else if (sort === "recent")
      sorted.sort((a, b) => (new Date(b.lastOrderAt ?? 0).getTime()) - (new Date(a.lastOrderAt ?? 0).getTime()));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [aggregated, search, sort, teamFilter, statusFilter]);

  const totals = useMemo(() => {
    const revenue = aggregated.reduce((s, c) => s + c.totalSpent, 0);
    const active = aggregated.filter((c) => c.ordersCount > 0).length;
    const recurring = aggregated.filter((c) => c.ordersCount >= 2).length;
    const recurrenceRate = active > 0 ? (recurring / active) * 100 : 0;
    return { revenue, active, total: aggregated.length, recurring, recurrenceRate };
  }, [aggregated]);

  const selected = selectedId ? aggregated.find((c) => c.id === selectedId) ?? null : null;
  const loading = lc || lo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Histórico, ticket médio e comportamento de compra</p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="bg-[color:#2563EB] hover:bg-[color:#1D4ED8]">
          <Plus className="mr-2 h-4 w-4" /> Novo cliente
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Clientes" value={String(totals.total)} color="#2563EB" />
        <KpiCard icon={<ShoppingBag className="h-4 w-4" />} label="Ativos (com pedidos)" value={String(totals.active)} color="#16A34A" />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Taxa de recorrência"
          value={`${totals.recurrenceRate.toFixed(0)}%`}
          sub={`${totals.recurring} de ${totals.active} compraram 2x+`}
          color="#D97706"
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Ticket médio"
          value={fmtBRL(totals.active > 0 ? totals.revenue / totals.active : 0)}
          color="#7C3AED"
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="relative md:col-span-5">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="md:col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Maiores compradores</SelectItem>
                <SelectItem value="orders">Mais pedidos</SelectItem>
                <SelectItem value="recent">Compra mais recente</SelectItem>
                <SelectItem value="name">Nome (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            <Popover open={teamOpen} onOpenChange={setTeamOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="md:col-span-2 w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {teamFilter === "all" ? "Todos os times" : teamFilter}
                  </span>
                  {teamFilter !== "all" ? (
                    <X
                      className="ml-2 h-4 w-4 opacity-60 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setTeamFilter("all"); }}
                    />
                  ) : (
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar time..." />
                  <CommandList>
                    <CommandEmpty>Nenhum time encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => { setTeamFilter("all"); setTeamOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", teamFilter === "all" ? "opacity-100" : "opacity-0")} />
                        Todos os times
                      </CommandItem>
                      {allTeams.map((t) => (
                        <CommandItem key={t} value={t} onSelect={() => { setTeamFilter(t); setTeamOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", teamFilter === t ? "opacity-100" : "opacity-0")} />
                          {t}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="com-pedidos">Com pedidos</SelectItem>

                <SelectItem value="sem-pedidos">Sem pedidos</SelectItem>
                <SelectItem value="inativos">Inativos (90+ dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="text-left transition-colors"
            >
              <Card className="hover:border-[color:#2563EB]/40">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:#2563EB]/15 text-sm font-semibold text-[color:#2563EB]">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[c.phone, c.instagram, c.city].filter(Boolean).join(" • ") || "Sem contato"}
                      </div>
                      {c.teams.size > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Array.from(c.teams).slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                          {c.teams.size > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{c.teams.size - 3}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right sm:gap-6">
                    <Stat label="Total gasto" value={fmtBRL(c.totalSpent)} accent="#16A34A" />
                    <Stat label="Pedidos" value={String(c.ordersCount)} />
                    <Stat label="Último" value={c.lastOrderAt ? fmtDate(c.lastOrderAt) : "—"} />
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl">{selected.name}</SheetTitle>
                <div className="text-xs text-muted-foreground">
                  {[selected.phone, selected.instagram, selected.city].filter(Boolean).join(" • ") || "Sem contato"}
                </div>
              </SheetHeader>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat label="Gasto" value={fmtBRL(selected.totalSpent)} />
                <MiniStat label="Pedidos" value={String(selected.ordersCount)} />
                <MiniStat label="Ticket" value={fmtBRL(selected.ordersCount > 0 ? selected.totalSpent / selected.ordersCount : 0)} />
              </div>

              {selected.notes && (
                <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <div className="mb-1 font-medium">Observações</div>
                  <div className="text-muted-foreground">{selected.notes}</div>
                </div>
              )}

              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold">Histórico de pedidos</h3>
                {selected.orders.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Esse cliente ainda não tem pedidos.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selected.orders.map((o) => (
                      <Card key={o.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">
                                Pedido #{String(o.order_number ?? "").padStart(4, "0")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {fmtDateTime(o.created_at)} • {paymentMethodLabel[o.payment_method] ?? o.payment_method}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{fmtBRL(Number(o.total_value) - Number(o.discount))}</div>
                              <Badge variant="outline" className="mt-1 text-[10px] uppercase">{o.status}</Badge>
                            </div>
                          </div>
                          {o.order_items.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-border pt-2">
                              {o.order_items.map((it) => (
                                <div key={it.id} className="flex items-center justify-between text-xs">
                                  <span className="truncate text-muted-foreground">
                                    {it.quantity}× {it.products?.name ?? "Produto removido"}
                                    {it.products?.team ? ` • ${it.products.team}` : ""}
                                    {` • ${it.size}`}
                                  </span>
                                  <span>{fmtBRL(Number(it.unit_price) * Number(it.quantity))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color }}>{icon}</span>
          {label}
        </div>
        <div className="mt-2 font-sora text-xl font-semibold" style={{ color }}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
