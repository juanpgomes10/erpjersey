import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  AlertTriangle,
  Users,
  Package,
  Plane,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, paymentMethodLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ERPJersey" }] }),
  component: DashboardPage,
});

type RangeKey =
  | "hoje"
  | "ontem"
  | "ultimos_7"
  | "mes_atual"
  | "ultimos_3_meses"
  | "ano_atual"
  | "ano_passado";

const RANGE_LABELS: Record<RangeKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  ultimos_7: "Últimos 7 dias",
  mes_atual: "Mês atual",
  ultimos_3_meses: "Últimos 3 meses",
  ano_atual: "Ano atual",
  ano_passado: "Ano passado",
};

function getRange(key: RangeKey): { start: Date; end: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (key) {
    case "hoje":
      return { start: startOfToday, end: endOfToday };
    case "ontem": {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 1);
      return { start: s, end: startOfToday };
    }
    case "ultimos_7": {
      const s = new Date(startOfToday);
      s.setDate(s.getDate() - 6);
      return { start: s, end: endOfToday };
    }
    case "mes_atual":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "ultimos_3_meses":
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "ano_atual":
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear() + 1, 0, 1),
      };
    case "ano_passado":
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear(), 0, 1),
      };
  }
}

function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("mes_atual");
  const { start, end } = useMemo(() => getRange(range), [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: async () => {
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const [salesRange, products, customers, orders, imports, saleItems, lastSales] =
        await Promise.all([
          supabase
            .from("sales")
            .select("id, total_value, profit, payment_method, created_at")
            .gte("created_at", startIso)
            .lt("created_at", endIso)
            .eq("status", "concluida"),
          supabase
            .from("products")
            .select("id, name, min_stock, sale_price, product_sizes(quantity, size)"),
          supabase.from("customers").select("id", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendente"),
          supabase
            .from("imports")
            .select("id", { count: "exact", head: true })
            .not("status", "in", "(entregue,cancelado)"),
          supabase
            .from("sale_items")
            .select("quantity, unit_price, created_at, product:products(name)")
            .gte("created_at", startIso)
            .lt("created_at", endIso),
          supabase
            .from("sales")
            .select(
              "id, total_value, payment_method, created_at, customer_name_snapshot, customer:customers(name)",
            )
            .gte("created_at", startIso)
            .lt("created_at", endIso)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      const sales = salesRange.data ?? [];
      const prods = products.data ?? [];

      const faturamento = sales.reduce((s, v) => s + Number(v.total_value), 0);
      const lucro = sales.reduce((s, v) => s + Number(v.profit), 0);

      // Buckets do gráfico — diário se <= 31 dias, senão mensal
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      const chartDays: { label: string; total: number }[] = [];
      if (diffDays <= 31) {
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const ds = d.toISOString().slice(0, 10);
          const total = sales
            .filter((s) => s.created_at.slice(0, 10) === ds)
            .reduce((sum, v) => sum + Number(v.total_value), 0);
          chartDays.push({
            label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            total,
          });
        }
      } else {
        const months = new Map<string, number>();
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor < end) {
          months.set(`${cursor.getFullYear()}-${cursor.getMonth()}`, 0);
          cursor.setMonth(cursor.getMonth() + 1);
        }
        sales.forEach((s) => {
          const d = new Date(s.created_at);
          const k = `${d.getFullYear()}-${d.getMonth()}`;
          if (months.has(k)) months.set(k, months.get(k)! + Number(s.total_value));
        });
        months.forEach((total, k) => {
          const [y, m] = k.split("-").map(Number);
          const d = new Date(y, m, 1);
          chartDays.push({
            label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
            total,
          });
        });
      }

      const byMethod = new Map<string, number>();
      sales.forEach((s) => {
        byMethod.set(s.payment_method, (byMethod.get(s.payment_method) ?? 0) + 1);
      });
      const chartMethods = Array.from(byMethod, ([k, v]) => ({
        name: paymentMethodLabel[k] ?? k,
        value: v,
      }));

      const lowStock = prods.filter((p) => {
        const qty = (p.product_sizes ?? []).reduce((s, ps) => s + ps.quantity, 0);
        return qty <= (p.min_stock ?? 0);
      });

      const topMap = new Map<string, { qty: number; total: number }>();
      (saleItems.data ?? []).forEach((it) => {
        const name = (it.product as { name: string } | null)?.name ?? "—";
        const c = topMap.get(name) ?? { qty: 0, total: 0 };
        c.qty += it.quantity;
        c.total += Number(it.unit_price) * it.quantity;
        topMap.set(name, c);
      });
      const top5 = Array.from(topMap, ([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        faturamento,
        lucro,
        vendas: sales.length,
        pedidosPendentes: orders.count ?? 0,
        clientes: customers.count ?? 0,
        importacoesAndamento: imports.count ?? 0,
        estoqueBaixo: lowStock.length,
        chartDays,
        chartMethods,
        top5,
        lastSales: lastSales.data ?? [],
        lowStockList: lowStock.slice(0, 5),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do seu negócio · {RANGE_LABELS[range]}
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {RANGE_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Faturamento" value={fmtBRL(data?.faturamento)} loading={isLoading} icon={DollarSign} />
        <Kpi label="Lucro" value={fmtBRL(data?.lucro)} loading={isLoading} icon={TrendingUp} />
        <Kpi label="Vendas" value={String(data?.vendas ?? 0)} loading={isLoading} icon={ShoppingBag} />
        <Kpi
          label="Ticket médio"
          value={fmtBRL(data && data.vendas ? data.faturamento / data.vendas : 0)}
          loading={isLoading}
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Pedidos pendentes"
          value={String(data?.pedidosPendentes ?? 0)}
          loading={isLoading}
          icon={AlertTriangle}
          variant="warning"
        />
        <Kpi
          label="Alertas de estoque"
          value={String(data?.estoqueBaixo ?? 0)}
          loading={isLoading}
          icon={Package}
          variant="warning"
        />
        <Kpi label="Clientes" value={String(data?.clientes ?? 0)} loading={isLoading} icon={Users} />
        <Kpi
          label="Importações em curso"
          value={String(data?.importacoesAndamento ?? 0)}
          loading={isLoading}
          icon={Plane}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas — {RANGE_LABELS[range]}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.chartDays ?? []}>
                  <CartesianGrid stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #1E293B",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => fmtBRL(v)}
                  />
                  <Bar dataKey="total" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formas de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (data?.chartMethods?.length ?? 0) === 0 ? (
              <EmptyChart label="Sem vendas no período" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data!.chartMethods}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data!.chartMethods.map((_, i) => (
                      <Cell
                        key={i}
                        fill={["#2563EB", "#16A34A", "#D97706", "#0284C7", "#93BFFF"][i % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #1E293B",
                      borderRadius: 8,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 produtos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.top5?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data!.top5.map((t, i) => (
                  <li key={t.name} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[color:#1E293B] text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span className="tabular text-muted-foreground">{t.qty}x</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas vendas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.lastSales?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data!.lastSales.map((s) => {
                  const name =
                    (s.customer as { name: string } | null)?.name ??
                    s.customer_name_snapshot ??
                    "—";
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</p>
                      </div>
                      <span className="tabular text-[color:#16A34A]">
                        {fmtBRL(Number(s.total_value))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estoque baixo</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (data?.lowStockList?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Tudo certo no estoque.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data!.lowStockList.map((p) => {
                  const qty = (p.product_sizes ?? []).reduce((s, ps) => s + ps.quantity, 0);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular text-[color:#D97706]">{qty} un</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  loading,
  variant,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  loading?: boolean;
  variant?: "warning";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon
            className={`h-4 w-4 ${variant === "warning" ? "text-[color:#D97706]" : "text-muted-foreground"}`}
          />
        </div>
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p className="font-sora text-2xl font-semibold tabular">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
