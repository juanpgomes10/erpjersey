import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ClipboardList, X, Trash2, UserPlus, UserCheck, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { modelShortLabel } from "./estoque";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/use-profile";

type SizeOpt = "P" | "M" | "G" | "GG" | "XGG";
type OrderStatus = "pendente" | "pago" | "enviado" | "entregue" | "cancelado";

const STATUS_TABS: { value: OrderStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "pago", label: "Pagos" },
  { value: "enviado", label: "Enviados" },
  { value: "entregue", label: "Entregues" },
  { value: "cancelado", label: "Cancelados" },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string }> = {
  pendente: { bg: "#D9770615", fg: "#D97706" },
  pago: { bg: "#16A34A15", fg: "#16A34A" },
  enviado: { bg: "#2563EB15", fg: "#2563EB" },
  entregue: { bg: "#16A34A15", fg: "#16A34A" },
  cancelado: { bg: "#DC262615", fg: "#DC2626" },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const orderNum = (n: number | null | undefined) => `#${String(n ?? 0).padStart(4, "0")}`;

type OrderRow = {
  id: string;
  order_number: number | null;
  status: OrderStatus;
  total_value: number | string;
  discount: number | string;
  payment_method: string;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  source: string | null;
  customer: { id: string; name: string; phone: string | null; instagram: string | null } | null;
  items: Array<{
    id: string;
    size: string | null;
    quantity: number;
    unit_price: number | string;
    product_name: string | null;
    product: { id: string; name: string; team: string | null; season: string | null; model: string | null; image_url: string | null } | null;
  }>;
};

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — ERPJersey" }] }),
  component: PedidosPage,
});

function PedidosPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<OrderStatus | "todos">("todos");
  const [period, setPeriod] = useState<"todos" | "hoje" | "semana" | "mes" | "3meses" | "6meses" | "12meses">("todos");
  const [openNew, setOpenNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_value, discount, payment_method, notes, created_at, paid_at, shipped_at, delivered_at, cancelled_at, source, customer:customers(id, name, phone, instagram), items:order_items(id, size, quantity, unit_price, product_name, product:products(id, name, team, season, model, image_url))",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: 0, pendente: 0, pago: 0, enviado: 0, entregue: 0, cancelado: 0 };
    (orders ?? []).forEach((o) => {
      c.todos++;
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [orders]);

  const startOf = (kind: typeof period) => {
    if (kind === "todos") return null;
    const d = new Date();
    if (kind === "hoje") {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (kind === "semana") {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (kind === "mes") {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const monthsMap = { "3meses": 3, "6meses": 6, "12meses": 12 } as const;
    const months = monthsMap[kind as keyof typeof monthsMap];
    d.setMonth(d.getMonth() - months);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const filtered = useMemo(() => {
    const start = startOf(period);
    const q = search.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (tab !== "todos" && o.status !== tab) return false;
      if (start && new Date(o.created_at) < start) return false;
      if (q) {
        const num = orderNum(o.order_number).toLowerCase();
        const cName = (o.customer?.name ?? "").toLowerCase();
        if (!num.includes(q) && !cName.includes(q)) return false;
      }
      return true;
    });
  }, [orders, tab, period, search]);

  const detail = useMemo(() => (orders ?? []).find((o) => o.id === detailId) ?? null, [orders, detailId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Gerencie pedidos do início ao fim</p>
        </div>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo pedido
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as OrderStatus | "todos")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {STATUS_TABS.map((t) => {
            const active = tab === t.value;
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="data-[state=active]:bg-[color:#2563EB15] data-[state=active]:text-[color:#2563EB] data-[state=active]:shadow-none rounded-md border border-transparent px-3 py-1.5"
              >
                {t.label}
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-[color:#2563EB] text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {counts[t.value] ?? 0}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nº do pedido ou cliente..."
                className="pl-9"
              />
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo o período</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="3meses">Últimos 3 meses</SelectItem>
                <SelectItem value="6meses">Últimos 6 meses</SelectItem>
                <SelectItem value="12meses">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-sora text-lg font-semibold">Nenhum pedido encontrado</h3>
              <p className="mt-1 text-sm text-muted-foreground">Clique em "Novo pedido" para começar.</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="mt-4 hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium">Nº</th>
                      <th className="px-3 py-2 text-left font-medium">Cliente</th>
                      <th className="px-3 py-2 text-left font-medium">Produtos</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => {
                      const total = Number(o.total_value) - Number(o.discount || 0);
                      const firstItem = o.items[0];
                      const productSummary = firstItem
                        ? `${firstItem.product?.team ?? firstItem.product?.name ?? firstItem.product_name ?? "Produto"}${o.items.length > 1 ? ` + ${o.items.length - 1} ${o.items.length - 1 === 1 ? "item" : "itens"}` : ""}`
                        : "—";
                      return (
                        <tr
                          key={o.id}
                          onClick={() => setDetailId(o.id)}
                          className="cursor-pointer border-b border-border last:border-none hover:bg-accent/40"
                        >
                          <td className="px-3 py-3 font-medium tabular">
                            <div className="flex items-center gap-2">
                              <span>{orderNum(o.order_number)}</span>
                              {o.source === "shopify" && (
                                <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Shopify</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">{o.customer?.name ?? "—"}</td>
                          <td className="px-3 py-3 text-muted-foreground truncate max-w-[220px]">{productSummary}</td>
                          <td className="px-3 py-3 text-right tabular font-medium">{fmtBRL(total)}</td>
                          <td className="px-3 py-3 text-muted-foreground">{paymentMethodLabel[o.payment_method] ?? o.payment_method}</td>
                          <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                          <td className="px-3 py-3 text-muted-foreground">{fmtDate(o.created_at)}</td>
                          <td className="px-3 py-3 text-right text-muted-foreground"><ChevronRight className="ml-auto h-4 w-4" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="mt-4 space-y-2 md:hidden">
                {filtered.map((o) => {
                  const total = Number(o.total_value) - Number(o.discount || 0);
                  return (
                    <button
                      key={o.id}
                      onClick={() => setDetailId(o.id)}
                      className="w-full rounded-md border border-border bg-card p-3 text-left hover:bg-accent/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium tabular">{orderNum(o.order_number)}</span>
                          {o.source === "shopify" && (
                            <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Shopify</span>
                          )}
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 text-sm font-medium truncate">{o.customer?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.items.length} item(ns) · {paymentMethodLabel[o.payment_method] ?? o.payment_method}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</span>
                        <span className="text-sm font-semibold tabular">{fmtBRL(total)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <OrderDetailDrawer order={detail} onClose={() => setDetailId(null)} />
      <NewOrderDialog open={openNew} onOpenChange={setOpenNew} />
    </div>
  );
}

/* ---------------- Detail Drawer ---------------- */

function OrderDetailDrawer({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changeStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      if (!order) return;
      const { error } = await supabase.from("orders").update({ status } as never).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!order) return;
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido excluído");
      qc.invalidateQueries({ queryKey: ["orders"] });
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const open = !!order;
  if (!order) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

  const subtotal = order.items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  const discount = Number(order.discount || 0);
  const total = Number(order.total_value) - discount;

  const history: { label: string; at: string }[] = [
    { label: "Criado", at: order.created_at },
    ...(order.paid_at ? [{ label: "Pago", at: order.paid_at }] : []),
    ...(order.shipped_at ? [{ label: "Enviado", at: order.shipped_at }] : []),
    ...(order.delivered_at ? [{ label: "Entregue", at: order.delivered_at }] : []),
    ...(order.cancelled_at ? [{ label: "Cancelado", at: order.cancelled_at }] : []),
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-sora">
              Pedido {orderNum(order.order_number)}
              <StatusBadge status={order.status} />
            </SheetTitle>
            <p className="text-xs text-muted-foreground">{fmtDateTime(order.created_at)}</p>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Cliente */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Cliente</h4>
              <p className="text-sm font-medium">{order.customer?.name ?? "—"}</p>
              {order.customer?.phone && <p className="text-xs text-muted-foreground">WhatsApp: {order.customer.phone}</p>}
              {order.customer?.instagram && <p className="text-xs text-muted-foreground">Instagram: {order.customer.instagram}</p>}
            </section>

            {/* Itens */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Produtos</h4>
              <div className="space-y-2">
                {order.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {it.product?.image_url && (
                        <img src={it.product.image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{it.product?.name ?? "Produto"}</p>
                      <p className="text-xs text-muted-foreground">Tam {it.size} · Qtd {it.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular">{fmtBRL(Number(it.unit_price))}</p>
                      <p className="text-xs text-muted-foreground tabular">{fmtBRL(Number(it.unit_price) * it.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Totais */}
            <section className="rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{fmtBRL(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular text-[color:#DC2626]">- {fmtBRL(discount)}</span></div>
              )}
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span className="tabular">{fmtBRL(total)}</span></div>
              <div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">Pagamento</span><span>{paymentMethodLabel[order.payment_method] ?? order.payment_method}</span></div>
            </section>

            {order.notes && (
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Observações</h4>
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </section>
            )}

            {/* Histórico */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between"><span>{h.label}</span><span>{fmtDateTime(h.at)}</span></li>
                ))}
              </ul>
            </section>

            {/* Ações */}
            <section className="space-y-2">
              <Label>Alterar status</Label>
              <Select value={order.status} onValueChange={(v) => changeStatus.mutate(v as OrderStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="destructive" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir pedido
              </Button>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O pedido {orderNum(order.order_number)} será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---------------- New Order Wizard ---------------- */

type CartItem = {
  productId: string;
  productName: string;
  team: string | null;
  size: SizeOpt;
  quantity: number;
  unitPrice: number;
  stock: number;
};

function NewOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [productSearch, setProductSearch] = useState("");
  const productSearchRef = useRef<HTMLInputElement>(null);
  type ProductLite = {
    id: string;
    name: string;
    team: string | null;
    season: string | null;
    model: string | null;
    sale_price: number | string;
    product_sizes?: Array<{ size: string; quantity: number }>;
  };
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [cfgSize, setCfgSize] = useState<SizeOpt | null>(null);
  const [cfgQty, setCfgQty] = useState(1);
  const [cfgPriceStr, setCfgPriceStr] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Step 2
  const [customerMode, setCustomerMode] = useState<"cadastrado" | "novo">("cadastrado");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [initialStatus, setInitialStatus] = useState<"pendente" | "pago">("pendente");
  const todayStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [orderDate, setOrderDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setProductSearch("");
      setSelected(null);
      setCfgSize(null);
      setCfgQty(1);
      setCfgPriceStr("");
      setCart([]);
      setCustomerMode("cadastrado");
      setCustomerId(null);
      setCustomerSearch("");
      setNewCustomerName("");
      setNewCustomerPhone("");
      setPaymentMethod("pix");
      setInitialStatus("pendente");
      setOrderDate(todayStr());
      setNotes("");
    }
  }, [open]);

  const { data: products } = useQuery({
    queryKey: ["products-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, model, team, season, sale_price, product_sizes(size, quantity)")
        .limit(300);
      return (data ?? []) as ProductLite[];
    },
    enabled: open,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-search"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, phone").order("name").limit(300);
      return data ?? [];
    },
    enabled: open,
  });

  const filteredProducts = (products ?? []).filter((p) => {
    if (!productSearch) return false;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.team ?? "").toLowerCase().includes(q) ||
      (p.season ?? "").toLowerCase().includes(q) ||
      (p.model ?? "").toLowerCase().includes(q)
    );
  });

  const filteredCustomers = (customers ?? []).filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  const selectProduct = (p: ProductLite) => {
    setSelected(p);
    setCfgSize(null);
    setCfgQty(1);
    setCfgPriceStr(Number(p.sale_price) > 0 ? String(p.sale_price) : "");
  };

  const addToCart = () => {
    if (!selected) return;
    if (!cfgSize) { toast.error("Selecione o tamanho"); return; }
    if (cfgQty < 1) { toast.error("Quantidade inválida"); return; }
    const price = Number(cfgPriceStr) || 0;
    if (price <= 0) { toast.error("Informe o preço"); return; }
    const label = `${selected.team ?? selected.name}${selected.model ? ` ${modelShortLabel(selected.model)}` : ""}${selected.season ? ` ${selected.season}` : ""}`;
    setCart((prev) => [...prev, {
      productId: selected.id,
      productName: label,
      team: selected.team,
      size: cfgSize,
      quantity: cfgQty,
      unitPrice: price,
      stock: 0,
    }]);

    setSelected(null);
    setCfgSize(null);
    setCfgQty(1);
    setCfgPriceStr("");
    setProductSearch("");
    setTimeout(() => productSearchRef.current?.focus(), 0);
  };

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const customerValid = customerMode === "cadastrado" ? !!customerId : newCustomerName.trim().length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error("Sem loja vinculada");
      if (cart.length === 0) throw new Error("Adicione ao menos um produto");
      if (!customerValid) throw new Error("Selecione ou cadastre um cliente");

      let finalCustomerId = customerId;
      if (customerMode === "novo") {
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({
            store_id: profile.store_id,
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || null,
          })
          .select()
          .single();
        if (cErr) throw cErr;
        finalCustomerId = created.id;
      }

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          store_id: profile.store_id,
          customer_id: finalCustomerId,
          user_id: profile.id,
          total_value: subtotal,
          status: initialStatus,
          payment_method: paymentMethod,
          notes: notes || null,
          ...(orderDate && orderDate !== todayStr()
            ? { created_at: new Date(`${orderDate}T12:00:00`).toISOString() }
            : {}),
        } as never)
        .select()
        .single();
      if (error) throw error;

      const { error: itemsErr } = await supabase.from("order_items").insert(
        cart.map((c) => ({
          order_id: order.id,
          product_id: c.productId,
          size: c.size,
          quantity: c.quantity,
          unit_price: c.unitPrice,
        })),
      );
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      toast.success("Pedido criado!");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const canNext1 = cart.length > 0;
  const canNext2 = customerValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sora">Novo pedido — Etapa {step} de 3</DialogTitle>
        </DialogHeader>

        {/* Stepper indicator */}
        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex-1 h-1 rounded ${step >= n ? "bg-[color:#2563EB]" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Buscar produto</Label>
              <Input
                ref={productSearchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Time, modelo ou temporada..."
              />
              {productSearch && !selected && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border">
                  {filteredProducts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className="flex w-full items-center justify-between gap-3 border-b border-border p-3 text-left last:border-none hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {[p.team, p.model ? modelShortLabel(p.model) : null, p.season].filter(Boolean).join(" · ") || p.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{fmtBRL(Number(p.sale_price))}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">Selecionar →</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selected && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">
                    {[selected.team, selected.model ? modelShortLabel(selected.model) : null, selected.season].filter(Boolean).join(" · ") || selected.name}
                  </p>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
                </div>
                <div>
                  <Label className="mb-1.5 block">Tamanho*</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["P", "M", "G", "GG", "XGG"] as SizeOpt[]).map((sz) => {
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setCfgSize(sz)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${cfgSize === sz ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" min={1} value={cfgQty} onChange={(e) => setCfgQty(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div>
                    <Label>Preço unit. (R$)</Label>
                    <Input type="number" step="0.01" value={cfgPriceStr} onChange={(e) => setCfgPriceStr(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                  <Button onClick={addToCart}>Adicionar ao pedido</Button>
                </div>
              </div>
            )}

            {cart.length > 0 && (
              <div className="rounded-md border border-border">
                {cart.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-border p-3 last:border-none">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.productName}</p>
                      <p className="text-xs text-muted-foreground">Tam {c.size} · Qtd {c.quantity}</p>
                    </div>
                    <span className="text-sm font-medium tabular">{fmtBRL(c.unitPrice * c.quantity)}</span>
                    <Button variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((_, idx) => idx !== i))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex justify-between bg-muted/40 p-3 text-sm font-semibold">
                  <span>Subtotal</span><span className="tabular">{fmtBRL(subtotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <section>
              <Label className="mb-2 block">Cliente</Label>
              <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as "cadastrado" | "novo")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="cadastrado"><UserCheck className="mr-2 h-4 w-4" /> Cadastrado</TabsTrigger>
                  <TabsTrigger value="novo"><UserPlus className="mr-2 h-4 w-4" /> Novo</TabsTrigger>
                </TabsList>
              </Tabs>
              {customerMode === "cadastrado" ? (
                <div className="mt-3 space-y-2">
                  <Input placeholder="Buscar..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {filteredCustomers.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Nenhum cliente.</p>
                    ) : filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCustomerId(c.id)}
                        className={`flex w-full items-center justify-between border-b border-border p-3 text-left last:border-none hover:bg-accent ${customerId === c.id ? "bg-accent" : ""}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone ?? "sem telefone"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nome*</Label>
                    <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                  </div>
                </div>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentMethodLabel).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status inicial</Label>
                <Select value={initialStatus} onValueChange={(v) => setInitialStatus(v as "pendente" | "pago")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago (baixa o estoque)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do pedido</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <section className="rounded-md border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Resumo</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{customerMode === "cadastrado" ? (customers?.find((c) => c.id === customerId)?.name ?? "—") : newCustomerName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagamento</span><span>{paymentMethodLabel[paymentMethod]}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{STATUS_LABEL[initialStatus]}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{orderDate}</span></div>
              </div>
            </section>
            <section className="rounded-md border border-border">
              {cart.map((c, i) => (
                <div key={i} className="flex justify-between border-b border-border p-3 last:border-none text-sm">
                  <span>{c.productName} · {c.size} · {c.quantity}x</span>
                  <span className="tabular">{fmtBRL(c.unitPrice * c.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between bg-muted/40 p-3 font-semibold">
                <span>Total</span><span className="tabular">{fmtBRL(subtotal)}</span>
              </div>
            </section>
            {initialStatus === "pago" && (
              <p className="text-xs text-muted-foreground">Ao confirmar, o estoque será baixado e uma entrada financeira será registrada automaticamente.</p>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
                <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < 3 ? (
              <Button
                disabled={step === 1 ? !canNext1 : !canNext2}
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              >
                Avançar <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando..." : "Confirmar pedido"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
