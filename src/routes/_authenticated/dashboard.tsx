import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  AlertTriangle,
  Users,
  Package,
  Plane,
  ArrowUp,
  ArrowDown,
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

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ERPJersey" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [salesMonth, salesToday, salesWeek, products, customers, orders, imports] = await Promise.all([
        supabase.from("sales").select("total_value, profit, payment_method").gte("created_at", startOfMonth).eq("status", "concluida"),
        supabase.from("sales").select("total_value").gte("created_at", startOfDay).eq("status", "concluida"),
        supabase.from("sales").select("total_value, created_at").gte("created_at", sevenDaysAgo).eq("status", "concluida"),
        supabase.from("products").select("id, name, min_stock, sale_price, product_sizes(quantity, size)"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("imports").select("id", { count: "exact", head: true }).not("status", "in", "(entregue,cancelado)"),
      ]);

      const month = salesMonth.data ?? [];
      const today = salesToday.data ?? [];
      const week = salesWeek.data ?? [];
      const prods = products.data ?? [];

      const faturamentoMes = month.reduce((s, v) => s + Number(v.total_value), 0);
      const lucroMes = month.reduce((s, v) => s + Number(v.profit), 0);
      const faturamentoHoje = today.reduce((s, v) => s + Number(v.total_value), 0);

      // Vendas por dia (últimos 7)
      const days: { label: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
        const ds = d.toISOString().slice(0, 10);
        const total = week
          .filter((s) => s.created_at.slice(0, 10) === ds)
          .reduce((sum, v) => sum + Number(v.total_value), 0);
        days.push({ label, total });
      }

      // Pagamento por método
      const byMethod = new Map<string, number>();
      month.forEach((s) => {
        byMethod.set(s.payment_method, (byMethod.get(s.payment_method) ?? 0) + 1);
      });
      const methodData = Array.from(byMethod, ([k, v]) => ({ name: paymentMethodLabel[k] ?? k, value: v }));

      // Estoque baixo
      const lowStock = prods.filter((p) => {
        const qty = (p.product_sizes ?? []).reduce((s, ps) => s + ps.quantity, 0);
        return qty <= (p.min_stock ?? 0);
      });

      // Top 5 produtos vendidos (no mês)
      const { data: topItems } = await supabase
        .from("sale_items")
        .select("quantity, unit_price, product:products(name)")
        .limit(200);
      const topMap = new Map<string, { qty: number; total: number }>();
      (topItems ?? []).forEach((it) => {
        const name = (it.product as { name: string } | null)?.name ?? "—";
        const c = topMap.get(name) ?? { qty: 0, total: 0 };
        c.qty += it.quantity;
        c.total += Number(it.unit_price) * it.quantity;
        topMap.set(name, c);
      });
      const top5 = Array.from(topMap, ([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      // Últimas 5 vendas
      const { data: lastSales } = await supabase
        .from("sales")
        .select("id, total_value, payment_method, created_at, customer_name_snapshot, customer:customers(name)")
        .order("created_at", { ascending: false })
        .limit(5);

      return {
        faturamentoHoje,
        faturamentoMes,
        lucroMes,
        vendasMes: month.length,
        pedidosPendentes: orders.count ?? 0,
        clientes: customers.count ?? 0,
        importacoesAndamento: imports.count ?? 0,
        estoqueBaixo: lowStock.length,
        chartDays: days,
        chartMethods: methodData,
        top5,
        lastSales: lastSales ?? [],
        lowStockList: lowStock.slice(0, 5),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sora text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do seu negócio</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Faturamento hoje" value={fmtBRL(data?.faturamentoHoje)} loading={isLoading} icon={DollarSign} />
        <Kpi label="Faturamento do mês" value={fmtBRL(data?.faturamentoMes)} loading={isLoading} icon={TrendingUp} delta="+12%" deltaPositive />
        <Kpi label="Lucro do mês" value={fmtBRL(data?.lucroMes)} loading={isLoading} icon={BarChart3} delta="+8%" deltaPositive />
        <Kpi label="Vendas no mês" value={String(data?.vendasMes ?? 0)} loading={isLoading} icon={ShoppingBag} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pedidos pendentes" value={String(data?.pedidosPendentes ?? 0)} loading={isLoading} icon={AlertTriangle} variant="warning" />
        <Kpi label="Alertas de estoque" value={String(data?.estoqueBaixo ?? 0)} loading={isLoading} icon={Package} variant="warning" />
        <Kpi label="Clientes" value={String(data?.clientes ?? 0)} loading={isLoading} icon={Users} />
        <Kpi label="Importações em curso" value={String(data?.importacoesAndamento ?? 0)} loading={isLoading} icon={Plane} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas dos últimos 7 dias</CardTitle>
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
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #1E293B", borderRadius: 8 }}
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
              <EmptyChart label="Sem vendas ainda" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data!.chartMethods} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {data!.chartMethods.map((_, i) => (
                      <Cell key={i} fill={["#2563EB", "#16A34A", "#D97706", "#0284C7", "#93BFFF"][i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1E293B", borderRadius: 8 }} />
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
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
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
              <p className="text-sm text-muted-foreground">Nenhuma venda ainda.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {data!.lastSales.map((s) => {
                  const name = (s.customer as { name: string } | null)?.name ?? s.customer_name_snapshot ?? "—";
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</p>
                      </div>
                      <span className="tabular text-[color:#16A34A]">{fmtBRL(Number(s.total_value))}</span>
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
  delta,
  deltaPositive,
  variant,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  loading?: boolean;
  delta?: string;
  deltaPositive?: boolean;
  variant?: "warning";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <Icon className={`h-4 w-4 ${variant === "warning" ? "text-[color:#D97706]" : "text-muted-foreground"}`} />
        </div>
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p className="font-sora text-2xl font-semibold tabular">{value}</p>
          )}
        </div>
        {delta && !loading && (
          <p className={`mt-1 flex items-center gap-1 text-xs tabular ${deltaPositive ? "text-[color:#16A34A]" : "text-[color:#DC2626]"}`}>
            {deltaPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {delta} vs mês passado
          </p>
        )}
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
