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
  LineChart,
  Line,
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
      const now = new Date();

      const [ordersRange, products, customers, pendingOrders, importsAll, lastOrders] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, total_value, discount, shipping_cost, status, payment_method, created_at, order_items(quantity, unit_price, product:products(name, cost_price)), sale:sales(net_value, profit, sale_items(quantity, unit_cost))",
            )
            .gte("created_at", startIso)
            .lt("created_at", endIso)
            .neq("status", "cancelado"),
          supabase
            .from("products")
            .select("id, name, sale_price, product_sizes(quantity, size)"),
          supabase.from("customers").select("id", { count: "exact", head: true }),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendente"),
          supabase
            .from("imports")
            .select("id, status, supplier, country, total_value, customs_fee, created_at, updated_at"),
          supabase
            .from("orders")
            .select(
              "id, order_number, total_value, discount, payment_method, created_at, customer:customers(name)",
            )
            .gte("created_at", startIso)
            .lt("created_at", endIso)
            .neq("status", "cancelado")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      const orders = (ordersRange.data ?? []) as Array<{
        id: string;
        total_value: number | string;
        discount: number | string;
        shipping_cost: number | string | null;
        status: string;
        payment_method: string;
        created_at: string;
        order_items: Array<{
          quantity: number;
          unit_price: number | string;
          product: { name: string; cost_price: number | string | null } | null;
        }> | null;
        sale: { net_value: number | string | null; profit: number | string | null; sale_items: Array<{ quantity: number; unit_cost: number | string }> | null } | Array<{ net_value: number | string | null; profit: number | string | null; sale_items: Array<{ quantity: number; unit_cost: number | string }> | null }> | null;
      }>;
      const prods = products.data ?? [];

      const receitaDeOrder = (o: typeof orders[number]) => {
        const sale = Array.isArray(o.sale) ? o.sale[0] : o.sale;
        if (sale && sale.net_value != null) return Number(sale.net_value);
        return Number(o.total_value) - Number(o.discount || 0);
      };
      const custoDeOrder = (o: typeof orders[number]) => {
        const sale = Array.isArray(o.sale) ? o.sale[0] : o.sale;
        const items = sale?.sale_items;
        if (items && items.length > 0) {
          return items.reduce((s, it) => s + Number(it.unit_cost ?? 0) * Number(it.quantity ?? 0), 0);
        }
        return (o.order_items ?? []).reduce(
          (cs, it) => cs + Number(it.product?.cost_price ?? 0) * Number(it.quantity),
          0,
        );
      };
      const freteDeOrder = (o: typeof orders[number]) => Number(o.shipping_cost ?? 0);

      const faturamento = orders.reduce((s, o) => s + receitaDeOrder(o), 0);
      const lucro = orders.reduce((s, o) => {
        const sale = Array.isArray(o.sale) ? o.sale[0] : o.sale;
        if (sale && sale.profit != null) return s + Number(sale.profit);
        return s + (receitaDeOrder(o) - custoDeOrder(o) - freteDeOrder(o));
      }, 0);

      // Buckets do gráfico — diário se <= 31 dias, senão mensal
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      const chartDays: { label: string; total: number }[] = [];
      const orderTotal = (o: typeof orders[number]) => receitaDeOrder(o);
      if (diffDays <= 31) {
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const ds = d.toISOString().slice(0, 10);
          const total = orders
            .filter((o) => o.created_at.slice(0, 10) === ds)
            .reduce((sum, o) => sum + orderTotal(o), 0);
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
        orders.forEach((o) => {
          const d = new Date(o.created_at);
          const k = `${d.getFullYear()}-${d.getMonth()}`;
          if (months.has(k)) months.set(k, months.get(k)! + orderTotal(o));
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
      orders.forEach((o) => {
        byMethod.set(o.payment_method, (byMethod.get(o.payment_method) ?? 0) + 1);
      });
      const chartMethods = Array.from(byMethod, ([k, v]) => ({
        name: paymentMethodLabel[k] ?? k,
        value: v,
      }));

      const topMap = new Map<string, { qty: number; total: number }>();
      orders.forEach((o) => {
        (o.order_items ?? []).forEach((it) => {
          const name = it.product?.name ?? "—";
          const c = topMap.get(name) ?? { qty: 0, total: 0 };
          c.qty += Number(it.quantity);
          c.total += Number(it.unit_price) * Number(it.quantity);
          topMap.set(name, c);
        });
      });
      const top5 = Array.from(topMap, ([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      // ===== Importações =====
      const importsList = importsAll.data ?? [];
      const ACTIVE_STATUSES = ["comprado", "enviado", "em_transito", "chegou_brasil", "aguardando_taxa", "saiu_entrega"];
      const importacoesAndamento = importsList.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
      const importsInRange = importsList.filter((i) => {
        const t = new Date(i.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
      const deliveredInRange = importsInRange.filter((i) => i.status === "entregue");
      // tempo médio de entrega: created_at → updated_at (atualizado quando vira "entregue")
      const avgDeliveryDays = deliveredInRange.length
        ? Math.round(
            deliveredInRange.reduce(
              (s, i) => s + (new Date(i.updated_at).getTime() - new Date(i.created_at).getTime()),
              0,
            ) / deliveredInRange.length / 86400000,
          )
        : 0;
      const importsGastoBRL = importsInRange.reduce((s, i) => s + Number(i.total_value ?? 0), 0);
      const tributosPendentes = importsList
        .filter((i) => i.status === "aguardando_taxa")
        .reduce((s, i) => s + Number(i.customs_fee ?? 0), 0);
      // Distribuição por status
      const STATUS_LABEL: Record<string, string> = {
        comprado: "Comprado",
        enviado: "Enviado",
        em_transito: "Em trânsito",
        chegou_brasil: "Chegou ao BR",
        aguardando_taxa: "Aguard. tributos",
        barrado_alfandega: "Barrado",
        saiu_entrega: "Saiu p/ entrega",
        entregue: "Entregue",
        cancelado: "Cancelado",
      };
      const statusMap = new Map<string, number>();
      importsList.forEach((i) => statusMap.set(i.status, (statusMap.get(i.status) ?? 0) + 1));
      const importsByStatus = Array.from(statusMap, ([k, v]) => ({ name: STATUS_LABEL[k] ?? k, value: v, key: k }));
      // Importações por mês (últimos 6 meses)
      const importsMonthly: { label: string; novas: number; entregues: number; gasto: number }[] = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const monthList = importsList.filter((i) => {
          const t = new Date(i.created_at).getTime();
          return t >= d.getTime() && t < next.getTime();
        });
        importsMonthly.push({
          label: d.toLocaleDateString("pt-BR", { month: "short" }),
          novas: monthList.length,
          entregues: monthList.filter((i) => i.status === "entregue").length,
          gasto: monthList.reduce((s, i) => s + Number(i.total_value ?? 0), 0),
        });
      }
      // Tempo de entrega por mês (entregas concluídas naquele mês via updated_at)
      const deliveryTimeMonthly: { label: string; days: number }[] = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const delivered = importsList.filter((i) => {
          const t = new Date(i.updated_at).getTime();
          return i.status === "entregue" && t >= d.getTime() && t < next.getTime();
        });
        const avg = delivered.length
          ? Math.round(
              delivered.reduce(
                (s, i) => s + (new Date(i.updated_at).getTime() - new Date(i.created_at).getTime()),
                0,
              ) / delivered.length / 86400000,
            )
          : 0;
        deliveryTimeMonthly.push({
          label: d.toLocaleDateString("pt-BR", { month: "short" }),
          days: avg,
        });
      }
      // Top fornecedores no período
      const supplierMap = new Map<string, { count: number; total: number }>();
      importsInRange.forEach((i) => {
        const k = i.supplier ?? "—";
        const c = supplierMap.get(k) ?? { count: 0, total: 0 };
        c.count += 1;
        c.total += Number(i.total_value ?? 0);
        supplierMap.set(k, c);
      });
      const topSuppliers = Array.from(supplierMap, ([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        faturamento,
        lucro,
        vendas: orders.length,
        pedidosPendentes: pendingOrders.count ?? 0,
        clientes: customers.count ?? 0,
        importacoesAndamento,
        avgDeliveryDays,
        importsGastoBRL,
        tributosPendentes,
        importsByStatus,
        importsMonthly,
        deliveryTimeMonthly,
        topSuppliers,
        deliveredCount: deliveredInRange.length,
        chartDays,
        chartMethods,
        top5,
        lastSales: (lastOrders.data ?? []) as Array<{
          id: string;
          order_number: number | null;
          total_value: number | string;
          discount: number | string;
          payment_method: string;
          created_at: string;
          customer: { name: string } | null;
        }>,

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
        <Kpi label="LUCRO BRUTO" value={fmtBRL(data?.lucro)} loading={isLoading} icon={TrendingUp} />
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
        <Kpi label="Clientes" value={String(data?.clientes ?? 0)} loading={isLoading} icon={Users} />
        <Kpi
          label="IMPORTAÇÕES EM ANDAMENTO"
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
      <div className="grid gap-4 lg:grid-cols-2">

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
                  const name = s.customer?.name ?? "—";
                  const total = Number(s.total_value) - Number(s.discount || 0);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</p>
                      </div>
                      <span className="tabular text-[color:#16A34A]">
                        {fmtBRL(total)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Importações */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-[#2563EB]" />
          <h2 className="font-sora text-lg font-semibold">Importações</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="TEMPO MÉDIO DE ENTREGA"
            value={data?.avgDeliveryDays ? `${data.avgDeliveryDays} dias` : "—"}
            loading={isLoading}
            icon={Plane}
          />
          <Kpi
            label="ENTREGUES NO PERÍODO"
            value={String(data?.deliveredCount ?? 0)}
            loading={isLoading}
            icon={Package}
          />
          <Kpi
            label="GASTO COM IMPORTAÇÕES"
            value={fmtBRL(data?.importsGastoBRL)}
            loading={isLoading}
            icon={DollarSign}
          />
          <Kpi
            label="TRIBUTOS PENDENTES"
            value={fmtBRL(data?.tributosPendentes)}
            loading={isLoading}
            icon={AlertTriangle}
            variant="warning"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Tempo médio de entrega (últimos 6 meses)</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (data?.deliveryTimeMonthly?.every((d) => d.days === 0) ?? true) ? (
                <EmptyChart label="Sem entregas concluídas ainda" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.deliveryTimeMonthly ?? []}>
                    <CartesianGrid stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={12} />
                    <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${v}d`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #1E293B", borderRadius: 8 }}
                      formatter={(v: number) => `${v} dias`}
                    />
                    <Line type="monotone" dataKey="days" stroke="#2563EB" strokeWidth={2} dot={{ fill: "#2563EB", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por status</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (data?.importsByStatus?.length ?? 0) === 0 ? (
                <EmptyChart label="Sem importações" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data!.importsByStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {data!.importsByStatus.map((s, i) => {
                        const colors: Record<string, string> = {
                          comprado: "#94A3B8",
                          enviado: "#60A5FA",
                          em_transito: "#3B82F6",
                          chegou_brasil: "#A855F7",
                          aguardando_taxa: "#F59E0B",
                          barrado_alfandega: "#EF4444",
                          saiu_entrega: "#06B6D4",
                          entregue: "#22C55E",
                          cancelado: "#64748B",
                        };
                        return <Cell key={i} fill={colors[s.key] ?? "#2563EB"} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #1E293B", borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Importações por mês (novas vs entregues)</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.importsMonthly ?? []}>
                    <CartesianGrid stroke="#1E293B" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={12} />
                    <YAxis stroke="#64748B" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #1E293B", borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="novas" name="Novas" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entregues" name="Entregues" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top fornecedores</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (data?.topSuppliers?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Sem importações no período.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {data!.topSuppliers.map((s, i) => (
                    <li key={s.name} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-[color:#1E293B] text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-muted-foreground">{s.count}x</div>
                        <div className="text-[10px] text-muted-foreground">{fmtBRL(s.total)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
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
