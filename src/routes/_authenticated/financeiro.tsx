import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Package, DollarSign, Repeat } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, paymentMethodLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

type TxType = "entrada" | "saida";
type TxCategory = "venda" | "fornecedor" | "taxa_importacao" | "frete" | "aluguel" | "marketing" | "outros";
type PayMethod = "pix" | "dinheiro" | "cartao_credito" | "cartao_debito" | "fiado" | "transferencia" | "outro";

type Transaction = {
  id: string;
  type: TxType;
  description: string;
  category: TxCategory;
  value: number;
  payment_method: PayMethod | null;
  due_date: string | null;
  paid: boolean;
  recurring: boolean;
  notes: string | null;
  created_at: string;
  source?: string | null;
  external_id?: string | null;
};

const CATEGORY_LABEL: Record<TxCategory, string> = {
  venda: "Venda",
  fornecedor: "Fornecedor",
  taxa_importacao: "Taxa de importação",
  frete: "Frete",
  aluguel: "Aluguel",
  marketing: "Marketing",
  outros: "Outros",
};

const PERIODS = [
  { v: "30", l: "Últimos 30 dias" },
  { v: "90", l: "Últimos 3 meses" },
  { v: "180", l: "Últimos 6 meses" },
  { v: "365", l: "Últimos 12 meses" },
] as const;

function FinanceiroPage() {
  const { data: profile } = useProfile();
  const storeId = profile?.store?.id;
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"30" | "90" | "180" | "365">("30");
  const [tab, setTab] = useState("visao");
  const [openNew, setOpenNew] = useState(false);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [expenseSort, setExpenseSort] = useState<"recent" | "oldest" | "high" | "low">("recent");

  const sinceISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Number(period));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [period]);

  // Transações no período
  const { data: txs, isLoading: loadingTx } = useQuery({
    queryKey: ["fin-tx", storeId, period],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("store_id", storeId!)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Transaction[];
    },
  });

  // Despesas recorrentes (sempre exibidas)
  const { data: recurring } = useQuery({
    queryKey: ["fin-recurring", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("store_id", storeId!)
        .eq("recurring", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Transaction[];
    },
  });

  // Estoque parado (custo total dos produtos com qtd > 0)
  const { data: stockValue } = useQuery({
    queryKey: ["fin-stock", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data: prods, error } = await supabase
        .from("products")
        .select("id, cost_price, sale_price, name, product_sizes(quantity)")
        .eq("store_id", storeId!);
      if (error) throw error;
      let cost = 0;
      let potentialRevenue = 0;
      let units = 0;
      (prods ?? []).forEach((p: any) => {
        const qty = (p.product_sizes ?? []).reduce((s: number, x: any) => s + (x.quantity ?? 0), 0);
        units += qty;
        cost += qty * Number(p.cost_price ?? 0);
        potentialRevenue += qty * Number(p.sale_price ?? 0);
      });
      return { cost, potentialRevenue, units };
    },
  });

  // Pedidos no período (para lucro)
  const { data: orders } = useQuery({
    queryKey: ["fin-orders", storeId, period],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_value, discount, created_at, paid_at, order_items(quantity, unit_price, product_id, products(cost_price))")
        .eq("store_id", storeId!)
        .gte("created_at", sinceISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Cálculos
  const entradas = (txs ?? []).filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.value), 0);
  const saidas = (txs ?? []).filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.value), 0);
  const saldo = entradas - saidas;
  const recurringMonthly = (recurring ?? [])
    .filter((t) => t.type === "saida")
    .reduce((s, t) => s + Number(t.value), 0);

  // Lucro por pedido (receita - custo dos itens)
  const lucroPedidos = useMemo(() => {
    let receita = 0;
    let custo = 0;
    (orders ?? []).forEach((o: any) => {
      if (o.status === "cancelado") return;
      receita += Number(o.total_value ?? 0) - Number(o.discount ?? 0);
      (o.order_items ?? []).forEach((it: any) => {
        const c = Number(it.products?.cost_price ?? 0);
        custo += c * Number(it.quantity ?? 0);
      });
    });
    return { receita, custo, lucro: receita - custo };
  }, [orders]);

  // Série temporal: entradas vs saídas por dia
  const seriesDaily = useMemo(() => {
    const map = new Map<string, { date: string; entradas: number; saidas: number }>();
    const days = Number(period);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, entradas: 0, saidas: 0 });
    }
    (txs ?? []).forEach((t) => {
      const key = t.created_at.slice(0, 10);
      const row = map.get(key);
      if (row) {
        if (t.type === "entrada") row.entradas += Number(t.value);
        else row.saidas += Number(t.value);
      }
    });
    return Array.from(map.values()).map((r) => ({
      ...r,
      label: new Date(r.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      lucro: r.entradas - r.saidas,
    }));
  }, [txs, period]);

  // Despesas por categoria
  const byCategory = useMemo(() => {
    const map = new Map<TxCategory, number>();
    (txs ?? []).filter((t) => t.type === "saida").forEach((t) => {
      map.set(t.category, (map.get(t.category) ?? 0) + Number(t.value));
    });
    return Array.from(map.entries()).map(([cat, value]) => ({
      name: CATEGORY_LABEL[cat],
      value,
    }));
  }, [txs]);

  const PIE_COLORS = ["#2563EB", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#64748B"];

  const delMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento excluído");
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-recurring"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao excluir"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de receitas, despesas e lucratividade</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (<SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenNew(true)} className="bg-[color:#2563EB] hover:bg-[color:#1D4ED8]">
            <Plus className="mr-2 h-4 w-4" /> Novo lançamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receitas"
          value={fmtBRL(entradas)}
          color="#16A34A"
          loading={loadingTx}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Despesas"
          value={fmtBRL(saidas)}
          color="#DC2626"
          loading={loadingTx}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo do período"
          value={fmtBRL(saldo)}
          color={saldo >= 0 ? "#2563EB" : "#DC2626"}
          loading={loadingTx}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Lucro dos pedidos"
          value={fmtBRL(lucroPedidos.lucro)}
          sub={`Receita ${fmtBRL(lucroPedidos.receita)} • Custo ${fmtBRL(lucroPedidos.custo)}`}
          color="#16A34A"
          loading={!orders}
        />
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Capital em estoque"
          value={fmtBRL(stockValue?.cost ?? 0)}
          sub={`${stockValue?.units ?? 0} unid. • potencial ${fmtBRL(stockValue?.potentialRevenue ?? 0)}`}
          color="#D97706"
          loading={!stockValue}
        />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Despesas fixas / mês"
          value={fmtBRL(recurringMonthly)}
          sub={`${(recurring ?? []).filter((t) => t.type === "saida").length} lançamentos`}
          color="#7C3AED"
          loading={!recurring}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Lucro líquido projetado"
          value={fmtBRL(lucroPedidos.lucro - recurringMonthly)}
          sub="Pedidos − fixas mensais"
          color={lucroPedidos.lucro - recurringMonthly >= 0 ? "#16A34A" : "#DC2626"}
          loading={!orders || !recurring}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Patrimônio (saldo + estoque)"
          value={fmtBRL(saldo + (stockValue?.cost ?? 0))}
          color="#2563EB"
          loading={loadingTx || !stockValue}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="despesas">Despesas e custos</TabsTrigger>
          <TabsTrigger value="fixas">Despesas fixas</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Receitas vs Despesas</h3>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesDaily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748B" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8 }}
                      formatter={(v: number) => fmtBRL(v)}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="entradas" name="Receitas" stroke="#16A34A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="saidas" name="Despesas" stroke="#DC2626" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="lucro" name="Saldo" stroke="#2563EB" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Despesas por categoria</h3>
                <div className="h-64">
                  {byCategory.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Sem despesas no período
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90} label>
                          {byCategory.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold">Lucro diário (receitas − despesas)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={seriesDaily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748B" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v) => `R$${v}`} />
                      <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 8 }} />
                      <Bar dataKey="lucro" name="Saldo">
                        {seriesDaily.map((d, i) => (
                          <Cell key={i} fill={d.lucro >= 0 ? "#16A34A" : "#DC2626"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lancamentos">
          <TxTable
            items={txs ?? []}
            loading={loadingTx}
            onDelete={(t) => setToDelete(t)}
            emptyLabel="Nenhum lançamento no período"
          />
        </TabsContent>

        <TabsContent value="despesas" className="space-y-3">
          {(() => {
            const expenses = (txs ?? []).filter((t) => t.type === "saida");
            const sorted = [...expenses].sort((a, b) => {
              if (expenseSort === "recent") return +new Date(b.created_at) - +new Date(a.created_at);
              if (expenseSort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
              if (expenseSort === "high") return Number(b.value) - Number(a.value);
              return Number(a.value) - Number(b.value);
            });
            const total = expenses.reduce((s, t) => s + Number(t.value), 0);
            return (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {expenses.length} lançamento(s) • Total <span className="font-semibold text-foreground">{fmtBRL(total)}</span>
                  </div>
                  <Select value={expenseSort} onValueChange={(v) => setExpenseSort(v as typeof expenseSort)}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Mais recentes</SelectItem>
                      <SelectItem value="oldest">Mais antigas</SelectItem>
                      <SelectItem value="high">Mais caras</SelectItem>
                      <SelectItem value="low">Mais baratas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <TxTable
                  items={sorted}
                  loading={loadingTx}
                  onDelete={(t) => setToDelete(t)}
                  emptyLabel="Nenhuma despesa no período"
                />
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="fixas">
          <TxTable
            items={recurring ?? []}
            loading={!recurring}
            onDelete={(t) => setToDelete(t)}
            emptyLabel="Nenhuma despesa fixa cadastrada"
          />
        </TabsContent>
      </Tabs>

      <NewTransactionDialog
        open={openNew}
        onOpenChange={setOpenNew}
        storeId={storeId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["fin-tx"] });
          qc.invalidateQueries({ queryKey: ["fin-recurring"] });
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && delMutation.mutate(toDelete.id)}
              className="bg-[color:#DC2626] hover:bg-[color:#B91C1C]"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, color, loading,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span style={{ color }}>{icon}</span>
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-28" />
        ) : (
          <div className="mt-1 font-sora text-xl font-semibold" style={{ color }}>{value}</div>
        )}
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function TxTable({
  items, loading, onDelete, emptyLabel,
}: { items: Transaction[]; loading: boolean; onDelete: (t: Transaction) => void; emptyLabel: string }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">{emptyLabel}</CardContent></Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {items.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: t.type === "entrada" ? "#16A34A15" : "#DC262615",
                      color: t.type === "entrada" ? "#16A34A" : "#DC2626",
                    }}
                  >
                    {t.type === "entrada" ? "Receita" : "Despesa"}
                  </span>
                  {t.recurring && (
                    <span className="rounded bg-[color:#7C3AED15] px-1.5 py-0.5 text-[10px] font-medium text-[color:#7C3AED]">
                      <Repeat className="mr-0.5 inline h-2.5 w-2.5" /> Fixa
                    </span>
                  )}
                  <span className="truncate text-sm font-medium">{t.description}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {CATEGORY_LABEL[t.category]}
                  {t.payment_method && ` • ${paymentMethodLabel[t.payment_method]}`}
                  {` • ${fmtDate(t.created_at)}`}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-sora font-semibold"
                  style={{ color: t.type === "entrada" ? "#16A34A" : "#DC2626" }}
                >
                  {t.type === "entrada" ? "+" : "−"} {fmtBRL(Number(t.value))}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onDelete(t)} className="text-muted-foreground hover:text-[color:#DC2626]">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NewTransactionDialog({
  open, onOpenChange, storeId, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; storeId: string | undefined; onCreated: () => void }) {
  const [type, setType] = useState<TxType>("saida");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TxCategory>("outros");
  const [value, setValue] = useState("");
  const [payment, setPayment] = useState<PayMethod>("pix");
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setType("saida"); setDescription(""); setCategory("outros");
    setValue(""); setPayment("pix"); setRecurring(false); setNotes("");
  }

  async function submit() {
    if (!storeId) return;
    const val = Number(value.replace(",", "."));
    if (!description.trim() || !val || val <= 0) {
      toast.error("Preencha descrição e valor");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      store_id: storeId,
      type,
      description: description.trim(),
      category,
      value: val,
      payment_method: payment,
      paid: true,
      recurring,
      notes: notes.trim() || null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lançamento registrado");
    onCreated();
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "entrada" ? "default" : "outline"}
              onClick={() => setType("entrada")}
              className={type === "entrada" ? "bg-[color:#16A34A] hover:bg-[color:#15803D]" : ""}
            >
              <TrendingUp className="mr-2 h-4 w-4" /> Receita
            </Button>
            <Button
              type="button"
              variant={type === "saida" ? "default" : "outline"}
              onClick={() => setType("saida")}
              className={type === "saida" ? "bg-[color:#DC2626] hover:bg-[color:#B91C1C]" : ""}
            >
              <TrendingDown className="mr-2 h-4 w-4" /> Despesa
            </Button>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel, Frete DHL..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TxCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as TxCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={payment} onValueChange={(v) => setPayment(v as PayMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(paymentMethodLabel) as PayMethod[]).map((p) => (
                  <SelectItem key={p} value={p}>{paymentMethodLabel[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Despesa/Receita fixa mensal</div>
              <div className="text-xs text-muted-foreground">Marcar como recorrente</div>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-[color:#2563EB] hover:bg-[color:#1D4ED8]">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
