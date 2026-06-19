import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Package, DollarSign, Repeat, Banknote, ExternalLink } from "lucide-react";
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
  const [detail, setDetail] = useState<null | {
    title: string;
    description?: string;
    items: Transaction[];
    total: number;
    link?: { to: string; label: string };
    emptyLabel?: string;
  }>(null);

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

  // Cálculos — fonte única é a tabela `transactions`.
  // Toda venda/pedido pago gera automaticamente os lançamentos via triggers:
  //   - 'order_revenue'  (entrada — receita líquida do pedido)
  //   - 'order_cost'     (saída — mercadoria do fornecedor)
  //   - 'order_shipping' (saída — frete do pedido)
  const entradas = (txs ?? []).filter((t) => t.type === "entrada").reduce((s, t) => s + Number(t.value), 0);
  const saidas = (txs ?? []).filter((t) => t.type === "saida").reduce((s, t) => s + Number(t.value), 0);
  const despesasVariaveis = (txs ?? []).filter((t) => t.type === "saida" && !t.recurring).reduce((s, t) => s + Number(t.value), 0);
  const saquesTotal = (txs ?? [])
    .filter((t) => t.type === "saida" && t.description.startsWith("Saque do proprietário"))
    .reduce((s, t) => s + Number(t.value), 0);

  const recurringMonthly = (recurring ?? [])
    .filter((t) => t.type === "saida")
    .reduce((s, t) => s + Number(t.value), 0);

  // Receita / custo / frete derivados das transações automáticas dos pedidos
  const lucroPedidos = useMemo(() => {
    const sumBySource = (src: string) =>
      (txs ?? [])
        .filter((t) => (t as unknown as { source?: string | null }).source === src)
        .reduce((s, t) => s + Number(t.value), 0);
    const receita = sumBySource("order_revenue");
    const custo = sumBySource("order_cost");
    const frete = sumBySource("order_shipping");
    const receitasManuais = entradas - receita;
    const despesasManuais = saidas - custo - frete;
    return { receita, custo, frete, lucro: receita - custo, receitasManuais, despesasManuais };
  }, [txs, entradas, saidas]);

  const freteCost = lucroPedidos.frete;

  // ====== Totais consolidados ======
  // Fonte única: tabela transactions. Receitas = todas entradas, Despesas = todas saídas.
  const totalReceitas = entradas;
  const totalDespesas = saidas;
  const saldoConsolidado = totalReceitas - totalDespesas;

  const custosFuturos = useMemo(() => {
    const despesasAPagar = (txs ?? [])
      .filter((t) => t.type === "saida" && !t.paid)
      .reduce((s, t) => s + Number(t.value), 0);
    return {
      despesasAPagar,
      fixas: recurringMonthly,
      total: despesasAPagar + recurringMonthly,
    };
  }, [txs, recurringMonthly]);

  const saldoProjetado = saldoConsolidado - custosFuturos.total;
  const lucroLiquido = saldoConsolidado - recurringMonthly;



  // Série temporal: receitas (pedidos + entradas manuais) vs despesas (custo pedidos + frete + saídas manuais)
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
          value={fmtBRL(totalReceitas)}
          sub={`Vendas ${fmtBRL(lucroPedidos.receita)} • Outras entradas ${fmtBRL(lucroPedidos.receitasManuais)}`}
          color="#16A34A"
          loading={loadingTx}
          onClick={() => {
            const items = (txs ?? []).filter((t) => t.type === "entrada");
            setDetail({
              title: "Receitas do período",
              description: `Vendas (pedidos): ${fmtBRL(lucroPedidos.receita)} • Outras entradas: ${fmtBRL(lucroPedidos.receitasManuais)}`,
              items,
              total: totalReceitas,
              link: { to: "/vendas", label: "Ver vendas" },
              emptyLabel: "Sem outras entradas manuais. As vendas estão em /vendas.",
            });
          }}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Despesas"
          value={fmtBRL(totalDespesas)}
          sub={`Custo pedidos ${fmtBRL(lucroPedidos.custo)} • Frete ${fmtBRL(lucroPedidos.frete)} • Outras ${fmtBRL(lucroPedidos.despesasManuais)}`}
          color="#DC2626"
          loading={loadingTx}
          onClick={() => {
            const items = (txs ?? []).filter((t) => t.type === "saida");
            setDetail({
              title: "Despesas do período",
              description: `Custo pedidos: ${fmtBRL(lucroPedidos.custo)} • Frete: ${fmtBRL(lucroPedidos.frete)} • Lançamentos manuais: ${fmtBRL(lucroPedidos.despesasManuais)}`,
              items,
              total: totalDespesas,
              link: { to: "/pedidos", label: "Ver pedidos" },
              emptyLabel: "Sem despesas manuais no período",
            });
          }}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo do período"
          value={fmtBRL(saldoConsolidado)}
          sub="Receitas − Despesas"
          color={saldoConsolidado >= 0 ? "#2563EB" : "#DC2626"}
          loading={loadingTx}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo projetado"
          value={fmtBRL(saldoProjetado)}
          sub={`Custos futuros ${fmtBRL(custosFuturos.total)} • A pagar ${fmtBRL(custosFuturos.despesasAPagar)} • Fixas ${fmtBRL(custosFuturos.fixas)}`}
          color={saldoProjetado >= 0 ? "#16A34A" : "#DC2626"}
          loading={loadingTx || !recurring}
        />

        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Lucro dos pedidos"
          value={fmtBRL(lucroPedidos.lucro)}
          sub={`Receita ${fmtBRL(lucroPedidos.receita)} • Custo ${fmtBRL(lucroPedidos.custo)}`}
          color="#16A34A"
          loading={loadingTx}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Custo dos pedidos"
          value={fmtBRL(lucroPedidos.custo)}
          sub="Custo de mercadoria vendida no período"
          color="#DC2626"
          loading={loadingTx}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Custo de frete dos pedidos"
          value={fmtBRL(freteCost)}
          sub="Soma do custo de frete informado em cada pedido"
          color="#DC2626"
          loading={loadingTx}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Despesas variáveis (manuais)"
          value={fmtBRL(despesasVariaveis)}
          sub="Lançamentos manuais (marketing, fornecedor, etc.)"
          color="#DC2626"
          loading={loadingTx}
          onClick={() => {
            const items = (txs ?? []).filter((t) => t.type === "saida" && !t.recurring);
            setDetail({
              title: "Despesas variáveis",
              description: "Lançamentos manuais marcados como variáveis no período",
              items,
              total: despesasVariaveis,
              emptyLabel: "Nenhuma despesa variável no período",
            });
          }}
        />

        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Despesas fixas / mês"
          value={fmtBRL(recurringMonthly)}
          sub={`${(recurring ?? []).filter((t) => t.type === "saida").length} lançamentos`}
          color="#7C3AED"
          loading={!recurring}
          onClick={() => {
            const items = (recurring ?? []).filter((t) => t.type === "saida");
            setDetail({
              title: "Despesas fixas",
              description: "Lançamentos recorrentes mensais",
              items,
              total: recurringMonthly,
              emptyLabel: "Nenhuma despesa fixa cadastrada",
            });
          }}
        />
        <KpiCard
          icon={<Banknote className="h-4 w-4" />}
          label="Saques/Retiradas"
          value={fmtBRL(saquesTotal)}
          color="#D97706"
          loading={loadingTx}
          onClick={() => {
            const items = (txs ?? []).filter(
              (t) => t.type === "saida" && t.description.startsWith("Saque do proprietário"),
            );
            setDetail({
              title: "Saques / Retiradas",
              description: "Retiradas do proprietário no período",
              items,
              total: saquesTotal,
              emptyLabel: "Nenhum saque no período",
            });
          }}
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
          icon={<TrendingUp className="h-4 w-4" />}
          label="Lucro líquido projetado"
          value={fmtBRL(lucroLiquido)}
          sub="Saldo do período − fixas mensais"
          color={lucroLiquido >= 0 ? "#16A34A" : "#DC2626"}
          loading={loadingTx || !recurring}
        />
      </div>


      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            <TabsTrigger value="visao">Visão geral</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="despesas">Despesas e custos</TabsTrigger>
            <TabsTrigger value="fixas">Despesas fixas</TabsTrigger>
          </TabsList>
        </div>

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

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            {detail?.description && (
              <p className="text-xs text-muted-foreground">{detail.description}</p>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {detail?.items.length ?? 0} lançamento(s) manuais
              </span>
              <span className="font-sora font-semibold">Total: {fmtBRL(detail?.total ?? 0)}</span>
            </div>
            {detail?.link && (
              <Link
                to={detail.link.to}
                onClick={() => setDetail(null)}
                className="inline-flex items-center gap-1 text-xs text-[color:#2563EB] hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> {detail.link.label}
              </Link>
            )}
            <TxTable
              items={detail?.items ?? []}
              loading={false}
              onDelete={(t) => setToDelete(t)}
              emptyLabel={detail?.emptyLabel ?? "Sem registros"}
            />
          </div>
        </DialogContent>
      </Dialog>

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
  icon, label, value, sub, color, loading, onClick,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string; loading?: boolean; onClick?: () => void }) {
  const clickable = !!onClick && !loading;
  return (
    <Card
      onClick={clickable ? onClick : undefined}
      className={clickable ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
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

type Kind = "despesa" | "receita" | "saque";

const EXPENSE_CATEGORIES = [
  { v: "marketing", l: "Marketing", db: "marketing" as TxCategory },
  { v: "logistica", l: "Logística", db: "frete" as TxCategory },
  { v: "impostos", l: "Impostos", db: "outros" as TxCategory },
  { v: "embalagens", l: "Embalagens", db: "outros" as TxCategory },
  { v: "plataformas", l: "Plataformas e sistemas", db: "outros" as TxCategory },
  { v: "operacional", l: "Custos operacionais", db: "outros" as TxCategory },
  { v: "salario", l: "Salário de colaboradores", db: "outros" as TxCategory },
  { v: "outra", l: "Outra (personalizada)", db: "outros" as TxCategory },
];

const INCOME_CATEGORIES = [
  { v: "venda", l: "Venda", db: "venda" as TxCategory },
  { v: "outra", l: "Outra (personalizada)", db: "outros" as TxCategory },
];

function NewTransactionDialog({
  open, onOpenChange, storeId, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; storeId: string | undefined; onCreated: () => void }) {
  const [kind, setKind] = useState<Kind>("despesa");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [payment, setPayment] = useState<PayMethod>("pix");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [categoryKey, setCategoryKey] = useState<string>("marketing");
  const [categoryCustom, setCategoryCustom] = useState("");
  const [saqueMotivo, setSaqueMotivo] = useState("");
  const [expenseNature, setExpenseNature] = useState<"variavel" | "fixa">("variavel");
  const [saving, setSaving] = useState(false);

  function reset() {
    setKind("despesa");
    setDescription(""); setValue(""); setPayment("pix");
    setDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setCategoryKey("marketing"); setCategoryCustom("");
    setSaqueMotivo("");
    setExpenseNature("variavel");
  }

  function changeKind(k: Kind) {
    setKind(k);
    if (k === "receita") setCategoryKey("venda");
    if (k === "despesa") setCategoryKey("marketing");
  }

  async function submit() {
    if (!storeId) return;
    const val = Number(value.replace(",", "."));
    if (!val || val <= 0) { toast.error("Informe um valor válido"); return; }

    let txType: TxType;
    let dbCategory: TxCategory;
    let finalDescription = "";
    let finalNotes = notes.trim();
    let recurring = false;

    if (kind === "saque") {
      if (!saqueMotivo.trim()) { toast.error("Informe o motivo do saque"); return; }
      txType = "saida";
      dbCategory = "outros";
      finalDescription = `Saque do proprietário — ${saqueMotivo.trim()}`;
    } else {
      if (!description.trim()) { toast.error("Informe a descrição"); return; }
      const list = kind === "despesa" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
      const cat = list.find((c) => c.v === categoryKey) ?? list[0];
      const label = categoryKey === "outra" ? (categoryCustom.trim() || "Outra") : cat.l;
      txType = kind === "despesa" ? "saida" : "entrada";
      dbCategory = cat.db;
      finalDescription = `[${label}] ${description.trim()}`;
      recurring = kind === "despesa" && expenseNature === "fixa";
    }

    const createdAt = new Date(`${date}T12:00:00`).toISOString();

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      store_id: storeId,
      type: txType,
      description: finalDescription,
      category: dbCategory,
      value: val,
      payment_method: payment,
      paid: true,
      recurring,
      notes: finalNotes || null,
      created_at: createdAt,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      kind === "saque" ? "Saque registrado" : kind === "receita" ? "Receita registrada" : "Despesa registrada",
    );
    onCreated();
    reset();
    onOpenChange(false);
  }

  const activeCategories = kind === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs">Tipo de lançamento</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={kind === "despesa" ? "default" : "outline"}
                onClick={() => changeKind("despesa")}
                className={kind === "despesa" ? "bg-[color:#DC2626] hover:bg-[color:#B91C1C]" : ""}
              >
                <TrendingDown className="mr-1 h-4 w-4" /> Despesa
              </Button>
              <Button
                type="button"
                variant={kind === "receita" ? "default" : "outline"}
                onClick={() => changeKind("receita")}
                className={kind === "receita" ? "bg-[color:#16A34A] hover:bg-[color:#15803D]" : ""}
              >
                <TrendingUp className="mr-1 h-4 w-4" /> Receita
              </Button>
              <Button
                type="button"
                variant={kind === "saque" ? "default" : "outline"}
                onClick={() => changeKind("saque")}
                className={kind === "saque" ? "bg-[color:#D97706] hover:bg-[color:#B45309]" : ""}
              >
                <Wallet className="mr-1 h-4 w-4" /> Saque
              </Button>
            </div>
          </div>

          {kind === "saque" ? (
            <>
              <div>
                <Label className="text-xs">Valor total do saque (R$)</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Motivo do saque</Label>
                <Textarea
                  value={saqueMotivo}
                  onChange={(e) => setSaqueMotivo(e.target.value)}
                  rows={3}
                  placeholder="Ex: Pró-labore, retirada para uso pessoal..."
                />
              </div>
              <div>
                <Label className="text-xs">Forma</Label>
                <Select value={payment} onValueChange={(v) => setPayment(v as PayMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(paymentMethodLabel) as PayMethod[]).map((p) => (
                      <SelectItem key={p} value={p}>{paymentMethodLabel[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={kind === "despesa" ? "Ex: Anúncio Instagram, conta de luz..." : "Ex: Venda avulsa, reembolso..."}
                />
              </div>

              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={categoryKey} onValueChange={setCategoryKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeCategories.map((c) => (
                      <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryKey === "outra" && (
                  <Input
                    className="mt-2"
                    value={categoryCustom}
                    onChange={(e) => setCategoryCustom(e.target.value)}
                    placeholder="Escreva o nome da categoria"
                  />
                )}
              </div>

              {kind === "despesa" && (
                <div>
                  <Label className="mb-2 block text-xs">Tipo de despesa</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={expenseNature === "variavel" ? "default" : "outline"}
                      onClick={() => setExpenseNature("variavel")}
                      size="sm"
                    >
                      Variável
                    </Button>
                    <Button
                      type="button"
                      variant={expenseNature === "fixa" ? "default" : "outline"}
                      onClick={() => setExpenseNature("fixa")}
                      size="sm"
                    >
                      Fixa (recorrente)
                    </Button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {expenseNature === "fixa"
                      ? "Será contabilizada como despesa fixa mensal."
                      : "Despesa pontual / variável do período."}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-xs">Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

              <div>
                <Label className="text-xs">Observações (opcional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
          <Button
            onClick={submit}
            disabled={saving}
            className={`w-full sm:w-auto ${
              kind === "despesa"
                ? "bg-[color:#DC2626] hover:bg-[color:#B91C1C]"
                : kind === "receita"
                ? "bg-[color:#16A34A] hover:bg-[color:#15803D]"
                : "bg-[color:#D97706] hover:bg-[color:#B45309]"
            }`}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
