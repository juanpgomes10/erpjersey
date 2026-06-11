import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Package,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Truck,
  DollarSign,
  Ban,
  Copy,
  Calendar as CalendarIcon,
  ChevronDown,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { refreshTracking, refreshAllTrackings, registerTracking } from "@/lib/tracking.functions";
import { detectCarrier, COUNTRY_FLAG, COUNTRY_LABEL } from "@/lib/carrier";
import { fmtDate, fmtDateTime, fmtBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportProgressBar } from "@/components/imports/progress-bar";
import { ImportsEmptyState } from "@/components/imports/empty-state";
import { OrderLinkCombobox } from "@/components/imports/order-link-combobox";

export const Route = createFileRoute("/_authenticated/importacoes")({
  component: ImportacoesPage,
});

const USD_BRL = 5.8;

type ImportRow = {
  id: string;
  tracking_code: string | null;
  supplier: string | null;
  carrier: string | null;
  carrier_code: string | null;
  country: string | null;
  status:
    | "comprado"
    | "enviado"
    | "em_transito"
    | "chegou_brasil"
    | "aguardando_taxa"
    | "barrado_alfandega"
    | "saiu_entrega"
    | "entregue"
    | "cancelado";
  expected_delivery: string | null;
  customs_fee: number | null;
  total_value: number;
  value_usd: number | null;
  notes: string | null;
  photos: string[];
  order_numbers: number[];
  linked_order_ids: string[];
  tracking_events: Array<{
    time: string;
    description: string;
    location?: string;
    stage?: string;
  }>;
  last_tracking_update: string | null;
  tracking_status_raw: string | null;
  created_at: string;
};

const STATUS_META: Record<
  ImportRow["status"],
  { label: string; color: string; bg: string }
> = {
  comprado: { label: "Comprado", color: "#94A3B8", bg: "rgba(148,163,184,0.15)" },
  enviado: { label: "Enviado", color: "#60A5FA", bg: "rgba(96,165,250,0.15)" },
  em_transito: { label: "Em trânsito", color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  chegou_brasil: { label: "Chegou ao Brasil", color: "#A855F7", bg: "rgba(168,85,247,0.15)" },
  aguardando_taxa: { label: "Aguardando pagamento de tributos", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  barrado_alfandega: { label: "Barrado na alfândega", color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  saiu_entrega: { label: "Saiu para entrega", color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  entregue: { label: "Entregue", color: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  cancelado: { label: "Cancelado", color: "#64748B", bg: "rgba(100,116,139,0.15)" },
};

const TABS: Array<{ key: string; label: string; statuses: ImportRow["status"][]; icon: typeof Package }> = [
  { key: "andamento", label: "Em andamento", icon: Truck, statuses: ["comprado", "enviado", "em_transito", "chegou_brasil", "saiu_entrega"] },
  { key: "taxa", label: "Aguardando pagamento de tributos", icon: DollarSign, statuses: ["aguardando_taxa"] },
  { key: "barrado", label: "Barrado", icon: Ban, statuses: ["barrado_alfandega"] },
  { key: "entregue", label: "Entregues", icon: CheckCircle2, statuses: ["entregue"] },
  { key: "todas", label: "Todas", icon: Package, statuses: [] },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

type DateRangeKey = "todos" | "hoje" | "ultimos_7" | "ultimos_30" | "mes_atual" | "ultimos_3_meses" | "ano_atual";
const DATE_RANGE_LABELS: Record<DateRangeKey, string> = {
  todos: "Todo período",
  hoje: "Hoje",
  ultimos_7: "Últimos 7 dias",
  ultimos_30: "Últimos 30 dias",
  mes_atual: "Mês atual",
  ultimos_3_meses: "Últimos 3 meses",
  ano_atual: "Ano atual",
};
function getDateRange(k: DateRangeKey): { start: Date | null; end: Date | null } {
  const now = new Date();
  const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eToday = new Date(sToday); eToday.setDate(eToday.getDate() + 1);
  switch (k) {
    case "todos": return { start: null, end: null };
    case "hoje": return { start: sToday, end: eToday };
    case "ultimos_7": { const s = new Date(sToday); s.setDate(s.getDate() - 6); return { start: s, end: eToday }; }
    case "ultimos_30": { const s = new Date(sToday); s.setDate(s.getDate() - 29); return { start: s, end: eToday }; }
    case "mes_atual": return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "ultimos_3_meses": return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "ano_atual": return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  }
}

function ImportacoesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("andamento");
  const [dateRange, setDateRange] = useState<DateRangeKey>("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [lastBulkRefresh, setLastBulkRefresh] = useState<string | null>(null);

  const { data: allImports = [], isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ImportRow[];
    },
  });

  // Aplica filtro de data primeiro
  const imports = useMemo(() => {
    const { start, end } = getDateRange(dateRange);
    if (!start || !end) return allImports;
    const s = start.getTime(), e = end.getTime();
    return allImports.filter((i) => {
      const t = new Date(i.created_at).getTime();
      return t >= s && t < e;
    });
  }, [allImports, dateRange]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) {
      c[t.key] = t.statuses.length === 0 ? imports.length : imports.filter((i) => t.statuses.includes(i.status)).length;
    }
    return c;
  }, [imports]);

  const filtered = useMemo(() => {
    const t = TABS.find((x) => x.key === tab);
    if (!t || t.statuses.length === 0) return imports;
    return imports.filter((i) => t.statuses.includes(i.status));
  }, [imports, tab]);

  const detail = detailId ? imports.find((i) => i.id === detailId) ?? null : null;

  const refreshFn = useServerFn(refreshTracking);
  const refreshAllFn = useServerFn(refreshAllTrackings);

  const refreshMut = useMutation({
    mutationFn: (importId: string) => refreshFn({ data: { importId } }),
    onSuccess: (_d, importId) => {
      toast.success("Rastreamento atualizado");
      const before = imports.find((i) => i.id === importId);
      qc.invalidateQueries({ queryKey: ["imports"] });
      // confete se mudou para entregue
      setTimeout(async () => {
        const { data } = await supabase.from("imports").select("status").eq("id", importId).maybeSingle();
        if (data?.status === "entregue" && before?.status !== "entregue") {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 } });
        }
      }, 400);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshAllMut = useMutation({
    mutationFn: () => refreshAllFn({}),
    onSuccess: (r) => {
      setLastBulkRefresh(new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["imports"] });
      if (r.updated > 0) toast.success(`${r.updated} importações atualizadas`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // auto-refresh ao abrir (1x por sessão)
  useEffect(() => {
    const key = "imports:last-bulk-refresh";
    const last = sessionStorage.getItem(key);
    const stale = !last || Date.now() - new Date(last).getTime() > 5 * 60 * 1000;
    if (stale && imports.length > 0) {
      sessionStorage.setItem(key, new Date().toISOString());
      refreshAllMut.mutate();
    }
    setLastBulkRefresh(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imports.length > 0]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Importação removida");
      qc.invalidateQueries({ queryKey: ["imports"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // KPIs avançados
  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const andamento = imports.filter((i) =>
      ["comprado", "enviado", "em_transito", "chegou_brasil", "saiu_entrega"].includes(i.status),
    );
    const avgDays = andamento.length
      ? Math.round(
          andamento.reduce((s, i) => s + (Date.now() - new Date(i.created_at).getTime()), 0) /
            andamento.length /
            (1000 * 60 * 60 * 24),
        )
      : 0;
    const taxa = imports.filter((i) => i.status === "aguardando_taxa");
    const taxaTotal = taxa.reduce((s, i) => s + Number(i.customs_fee ?? 0), 0);
    const barrado = imports.filter((i) => i.status === "barrado_alfandega");
    const entreguesMes = imports.filter(
      (i) => i.status === "entregue" && new Date(i.created_at).getTime() >= monthStart,
    );
    // Tempo médio de entrega no período (created_at → last event Delivered / updated)
    const entregues = imports.filter((i) => i.status === "entregue");
    const deliveryDaysList = entregues.map((i) => {
      const last = i.tracking_events?.[i.tracking_events.length - 1]?.time;
      const end = last ? new Date(last).getTime() : new Date(i.last_tracking_update ?? i.created_at).getTime();
      return Math.max(0, Math.round((end - new Date(i.created_at).getTime()) / 86400000));
    });
    const avgDelivery = deliveryDaysList.length
      ? Math.round(deliveryDaysList.reduce((s, d) => s + d, 0) / deliveryDaysList.length)
      : 0;
    return {
      andamento: andamento.length,
      avgDays,
      taxa: taxa.length,
      taxaTotal,
      barrado: barrado.length,
      entreguesMes: entreguesMes.length,
      avgDelivery,
      entregues: entregues.length,
      deliveryDaysList,
    };
  }, [imports]);

  // Gráfico de tempo médio de entrega por mês de compra (created_at)
  const deliveryByMonth = useMemo(() => {
    const entregues = imports.filter((i) => i.status === "entregue");
    if (entregues.length === 0) return [] as Array<{ label: string; days: number; count: number }>;
    const map = new Map<string, { sum: number; count: number; date: Date }>();
    for (const i of entregues) {
      const created = new Date(i.created_at);
      const key = `${created.getFullYear()}-${created.getMonth()}`;
      const last = i.tracking_events?.[i.tracking_events.length - 1]?.time;
      const end = last ? new Date(last).getTime() : new Date(i.last_tracking_update ?? i.created_at).getTime();
      const days = Math.max(0, (end - created.getTime()) / 86400000);
      const c = map.get(key) ?? { sum: 0, count: 0, date: new Date(created.getFullYear(), created.getMonth(), 1) };
      c.sum += days;
      c.count += 1;
      map.set(key, c);
    }
    return Array.from(map.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((v) => ({
        label: v.date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        days: Math.round(v.sum / v.count),
        count: v.count,
      }));
  }, [imports]);

  // Histograma: dias até entrega por pedido (entregues no período)
  const deliveryHistogram = useMemo(() => {
    return kpis.deliveryDaysList
      .map((d, idx) => ({ idx: idx + 1, dias: d }))
      .sort((a, b) => a.dias - b.dias);
  }, [kpis.deliveryDaysList]);

  return (
    <div className="space-y-5">
      {/* Header — mobile-first */}
      <div className="space-y-3">
        <div>
          <h1 className="font-sora text-xl font-semibold sm:text-2xl">Importações</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Acompanhe todas as encomendas (China, Correios e outros) em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setCreateOpen(true)}
            className="flex-1 bg-[#2563EB] text-white hover:bg-[#1D4ED8] sm:flex-none"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nova importação
          </Button>
          <Button
            variant="outline"
            onClick={() => refreshAllMut.mutate()}
            disabled={refreshAllMut.isPending}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", refreshAllMut.isPending && "animate-spin")} />
            <span className="sm:inline">Atualizar</span>
          </Button>
          <span className="w-full text-[10px] text-muted-foreground sm:w-auto sm:text-xs">
            Última atualização: {timeAgo(lastBulkRefresh)}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <KpiCard
          icon={Truck}
          label="Em andamento"
          value={kpis.andamento}
          hint={kpis.andamento > 0 ? `${kpis.avgDays}d em média` : undefined}
        />
        <KpiCard
          icon={DollarSign}
          label="Aguard. tributos"
          value={kpis.taxa}
          hint={kpis.taxaTotal > 0 ? fmtBRL(kpis.taxaTotal) : undefined}
        />
        <KpiCard
          icon={Ban}
          label="Barrado"
          value={kpis.barrado}
          pulse={kpis.barrado > 0}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Entregues no mês"
          value={kpis.entreguesMes}
          hint={kpis.avgDelivery > 0 ? `~${kpis.avgDelivery}d p/ entregar` : undefined}
        />
      </div>

      {/* Tempo médio de entrega */}
      <DeliveryTimeCharts
        avgDays={kpis.avgDelivery}
        sampleSize={kpis.entregues}
        byMonth={deliveryByMonth}
        histogram={deliveryHistogram}
        rangeLabel={DATE_RANGE_LABELS[dateRange]}
      />


      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="inline-flex w-max">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap">
                  {t.label}
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular">
                    {counts[t.key]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_RANGE_LABELS) as DateRangeKey[]).map((k) => (
                <SelectItem key={k} value={k}>{DATE_RANGE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>



        <TabsContent value={tab} className="mt-4 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : imports.length === 0 ? (
            <ImportsEmptyState onCreate={() => setCreateOpen(true)} />
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Package className="h-8 w-8" />
                <p>Nenhuma importação nesta categoria.</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((imp) => (
              <ImportCard
                key={imp.id}
                imp={imp}
                onOpen={() => setDetailId(imp.id)}
                onRefresh={() => refreshMut.mutate(imp.id)}
                refreshing={refreshMut.isPending && refreshMut.variables === imp.id}
                onDelete={() => setDeleteId(imp.id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <NewImportDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ImportDetailSheet
        importRow={detail}
        onOpenChange={(o) => !o && setDetailId(null)}
        onRefresh={() => detail && refreshMut.mutate(detail.id)}
        refreshing={refreshMut.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover importação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  pulse,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  hint?: string;
  pulse?: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md",
            pulse && "animate-pulse",
          )}
          style={{
            backgroundColor: pulse ? "rgba(239,68,68,0.15)" : "rgba(37,99,235,0.12)",
          }}
        >
          <Icon className={cn("h-5 w-5", pulse ? "text-[#EF4444]" : "text-[#2563EB]")} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular">{value}</div>
          {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ImportCard({
  imp,
  onOpen,
  onRefresh,
  refreshing,
  onDelete,
}: {
  imp: ImportRow;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onDelete: () => void;
}) {
  const meta = STATUS_META[imp.status];
  const flag = COUNTRY_FLAG[imp.country ?? "other"] ?? "🌐";
  const lastEvent = imp.tracking_events?.[imp.tracking_events.length - 1];

  function copyCode(e: React.MouseEvent) {
    e.stopPropagation();
    if (!imp.tracking_code) return;
    navigator.clipboard.writeText(imp.tracking_code);
    toast.success("Código copiado");
  }

  return (
    <Card className="border-border/60 transition-colors hover:border-border">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base">{flag}</span>
              <span className="font-medium">{imp.supplier ?? "Fornecedor não informado"}</span>
              {(imp as any).source === "shopify" && (
                <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">Shopify</span>
              )}
              {imp.carrier && (
                <span className="text-xs text-muted-foreground">· {imp.carrier}</span>
              )}
              <Badge
                style={{ backgroundColor: meta.bg, color: meta.color, borderColor: "transparent" }}
              >
                {meta.label}
              </Badge>
              {imp.status === "barrado_alfandega" && (
                <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono tabular">
                📦 {imp.tracking_code ?? "—"}
                {imp.tracking_code && (
                  <button onClick={copyCode} className="hover:text-foreground" title="Copiar">
                    <Copy className="h-3 w-3" />
                  </button>
                )}
              </span>
              {imp.order_numbers.length > 0 && (
                <span>
                  · Pedidos: {imp.order_numbers.map((n) => `#${String(n).padStart(4, "0")}`).join(", ")}
                </span>
              )}
              {imp.photos.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  · <ImageIcon className="h-3 w-3" /> {imp.photos.length}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={refreshing || !imp.tracking_code}
              title="Atualizar rastreamento"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} title="Remover">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <ImportProgressBar status={imp.status} />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="min-w-0 flex-1 truncate">
            {lastEvent ? (
              <>
                <span className="font-medium text-foreground/80">{lastEvent.description}</span>
                {lastEvent.time && <span> · {fmtDateTime(lastEvent.time)}</span>}
              </>
            ) : (
              <span>Sem eventos ainda</span>
            )}
          </div>
          <button
            onClick={onOpen}
            className="shrink-0 text-[#2563EB] hover:underline"
          >
            Ver detalhes →
          </button>
        </div>

        {imp.last_tracking_update && (
          <div className="text-[10px] text-muted-foreground">
            Atualizado {timeAgo(imp.last_tracking_update)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportDetailSheet({
  importRow,
  onOpenChange,
  onRefresh,
  refreshing,
}: {
  importRow: ImportRow | null;
  onOpenChange: (o: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const qc = useQueryClient();
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [editedNotes, setEditedNotes] = useState("");

  useEffect(() => {
    setEditedNotes(importRow?.notes ?? "");
    if (!importRow || importRow.photos.length === 0) {
      setSignedUrls({});
      return;
    }
    (async () => {
      const map: Record<string, string> = {};
      for (const path of importRow.photos) {
        const { data } = await supabase.storage.from("import-photos").createSignedUrl(path, 3600);
        if (data?.signedUrl) map[path] = data.signedUrl;
      }
      setSignedUrls(map);
    })();
  }, [importRow?.id]);

  const saveNotes = useMutation({
    mutationFn: async () => {
      if (!importRow) return;
      const { error } = await supabase
        .from("imports")
        .update({ notes: editedNotes } as never)
        .eq("id", importRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Observações salvas");
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markDelivered = useMutation({
    mutationFn: async () => {
      if (!importRow) return;
      const { error } = await supabase
        .from("imports")
        .update({ status: "entregue" } as never)
        .eq("id", importRow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marcada como entregue");
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 } });
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!importRow) return null;
  const meta = STATUS_META[importRow.status];
  const flag = COUNTRY_FLAG[importRow.country ?? "other"] ?? "🌐";

  return (
    <Sheet open={!!importRow} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{flag}</span>
            {importRow.supplier ?? "Importação"}
            <Badge style={{ backgroundColor: meta.bg, color: meta.color, borderColor: "transparent" }}>
              {meta.label}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="rounded-md border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Código de rastreamento</div>
                <div className="font-mono tabular truncate">{importRow.tracking_code ?? "—"}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                {importRow.tracking_code && (
                  <a
                    href={`https://t.17track.net/pt-br#nums=${importRow.tracking_code}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                  >
                    17TRACK <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
                  Atualizar
                </Button>
              </div>
            </div>
            {importRow.last_tracking_update && (
              <div className="mt-2 text-xs text-muted-foreground">
                Última atualização: {fmtDateTime(importRow.last_tracking_update)}
              </div>
            )}
          </div>

          <ImportProgressBar status={importRow.status} />

          {importRow.order_numbers.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Pedidos vinculados
              </div>
              <div className="flex flex-wrap gap-1">
                {importRow.order_numbers.map((n) => (
                  <Badge key={n} variant="outline">#{String(n).padStart(4, "0")}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase text-muted-foreground">
              <span>Observações</span>
              {editedNotes !== (importRow.notes ?? "") && (
                <button
                  className="text-[10px] text-[#2563EB] hover:underline"
                  onClick={() => saveNotes.mutate()}
                  disabled={saveNotes.isPending}
                >
                  Salvar
                </button>
              )}
            </div>
            <Textarea
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              rows={3}
              placeholder="Sem observações"
            />
          </div>

          {importRow.photos.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Fotos do fornecedor
              </div>
              <div className="grid grid-cols-3 gap-2">
                {importRow.photos.map((p) => (
                  <a key={p} href={signedUrls[p]} target="_blank" rel="noreferrer">
                    <img
                      src={signedUrls[p]}
                      alt="foto importação"
                      className="aspect-square w-full rounded-md border border-border object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Histórico completo
            </div>
            {importRow.tracking_events.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum evento ainda. Clique em "Atualizar" para buscar.
              </p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {[...importRow.tracking_events].reverse().map((e, idx) => (
                  <li key={idx} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
                    <div className="text-sm">{e.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.time ? fmtDateTime(e.time) : ""}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {importRow.status !== "entregue" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => markDelivered.mutate()}
              disabled={markDelivered.isPending}
            >
              <Check className="mr-1.5 h-4 w-4" /> Marcar como entregue manualmente
            </Button>
          )}

          <div className="text-xs text-muted-foreground">
            Criado em {fmtDate(importRow.created_at)}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const registerFn = useServerFn(registerTracking);

  const [trackingCode, setTrackingCode] = useState("");
  const [supplier, setSupplier] = useState("");
  const [country, setCountry] = useState<"cn" | "br" | "us" | "other">("cn");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [linkedOrderIds, setLinkedOrderIds] = useState<string[]>([]);
  const [valueUsd, setValueUsd] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState<Date | undefined>();
  const [registering, setRegistering] = useState(false);
  const [carrierGuess, setCarrierGuess] = useState<ReturnType<typeof detectCarrier>>(null);

  function reset() {
    setTrackingCode("");
    setSupplier("");
    setCountry("cn");
    setNotes("");
    setFiles([]);
    setLinkedOrderIds([]);
    setValueUsd("");
    setExpectedDelivery(undefined);
    setCarrierGuess(null);
    setShowAdvanced(false);
  }

  async function handleCodeBlur() {
    const code = trackingCode.trim();
    if (code.length < 8) return;
    setCarrierGuess(detectCarrier(code));
    setRegistering(true);
    try {
      await registerFn({ data: { trackingCode: code } });
    } catch {
      // silencioso — usuário ainda pode salvar
    } finally {
      setRegistering(false);
    }
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (!trackingCode.trim() || trackingCode.trim().length < 8) {
        throw new Error("Código de rastreio com pelo menos 8 caracteres");
      }
      if (!supplier.trim()) throw new Error("Fornecedor é obrigatório");

      // store id
      const { data: prof } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", (await supabase.auth.getUser()).data.user!.id)
        .single();
      const storeId = prof?.store_id as string;
      if (!storeId) throw new Error("Loja não encontrada");

      // upload photos com validação
      setUploading(true);
      const paths: string[] = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) throw new Error(`Foto ${f.name} excede 5MB`);
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
          throw new Error(`Formato inválido em ${f.name}`);
        }
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("import-photos").upload(path, f, {
          upsert: false,
          contentType: f.type,
        });
        if (error) throw new Error(`Falha no upload: ${error.message}`);
        paths.push(path);
      }
      setUploading(false);

      const usd = Number(valueUsd.replace(",", ".")) || 0;

      const { error } = await supabase.from("imports").insert({
        store_id: storeId,
        tracking_code: trackingCode.trim(),
        supplier: supplier.trim(),
        carrier: carrierGuess?.name ?? null,
        country,
        notes: notes.trim() || null,
        photos: paths,
        linked_order_ids: linkedOrderIds,
        value_usd: usd,
        total_value: usd * USD_BRL,
        expected_delivery: expectedDelivery ? format(expectedDelivery, "yyyy-MM-dd") : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Importação cadastrada");
      qc.invalidateQueries({ queryKey: ["imports"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const brlPreview = useMemo(() => {
    const n = Number(valueUsd.replace(",", ".")) || 0;
    return n > 0 ? fmtBRL(n * USD_BRL) : null;
  }, [valueUsd]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova importação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Código de rastreio *</Label>
            <div className="relative">
              <Input
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                onBlur={handleCodeBlur}
                placeholder="Ex: LP00123456789CN"
              />
              {registering && (
                <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {carrierGuess && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-[rgba(34,197,94,0.15)] px-2 py-0.5 text-[11px] text-[#22C55E]">
                <Check className="h-3 w-3" />
                Transportadora detectada: {carrierGuess.flag} {carrierGuess.name}
              </div>
            )}
            {!carrierGuess && trackingCode.length >= 8 && !registering && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-[rgba(245,158,11,0.15)] px-2 py-0.5 text-[11px] text-[#F59E0B]">
                <AlertTriangle className="h-3 w-3" /> Transportadora não detectada — será identificada após primeira atualização
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <Label>Fornecedor *</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
            <div>
              <Label>País</Label>
              <Select value={country} onValueChange={(v) => setCountry(v as typeof country)}>
                <SelectTrigger className="w-full md:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["cn", "br", "us", "other"] as const).map((c) => (
                    <SelectItem key={c} value={c}>
                      {COUNTRY_FLAG[c]} {COUNTRY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
            onClick={() => setShowAdvanced((x) => !x)}
          >
            <span className="font-medium">Informações adicionais</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
          </button>

          {showAdvanced && (
            <div className="space-y-4">
              <div>
                <Label>Vincular pedidos</Label>
                <OrderLinkCombobox value={linkedOrderIds} onChange={setLinkedOrderIds} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (USD)</Label>
                  <Input
                    value={valueUsd}
                    onChange={(e) => setValueUsd(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                  {brlPreview && (
                    <p className="mt-1 text-[10px] text-muted-foreground">≈ {brlPreview}</p>
                  )}
                </div>
                <div>
                  <Label>Previsão de entrega</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal">
                        <CalendarIcon className="mr-1.5 h-4 w-4" />
                        {expectedDelivery ? format(expectedDelivery, "dd/MM/yyyy") : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={expectedDelivery}
                        onSelect={setExpectedDelivery}
                        initialFocus
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: 2x Cruzeiro I, 1x Flamengo III..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Fotos (máx 5MB cada · JPG/PNG/WEBP)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="mr-1.5 h-4 w-4" /> Selecionar fotos
                  </Button>
                  {files.map((f, i) => (
                    <Badge key={i} variant="outline" className="gap-1">
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || uploading}
            className="bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
          >
            {createMut.isPending || uploading ? "Salvando..." : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryTimeCharts({
  avgDays,
  sampleSize,
  byMonth,
  histogram,
  rangeLabel,
}: {
  avgDays: number;
  sampleSize: number;
  byMonth: Array<{ label: string; days: number; count: number }>;
  histogram: Array<{ idx: number; dias: number }>;
  rangeLabel: string;
}) {
  if (sampleSize === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Tempo médio de entrega — {rangeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma importação entregue neste período ainda. Quando houver entregas, você verá aqui
          a média de dias por mês de compra.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium">
            Tempo médio de entrega — {rangeLabel}
          </CardTitle>
          <div className="flex items-baseline gap-1">
            <span className="font-sora text-2xl font-semibold text-[#2563EB] tabular">
              {avgDays}
            </span>
            <span className="text-xs text-muted-foreground">
              dias · {sampleSize} entrega{sampleSize > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {byMonth.length > 1 ? (
          <div className="h-48 w-full">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Por mês de compra
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" vertical={false} />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}d`} />
                <RTooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #1E293B",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, p) => [
                    `${v} dias`,
                    `Média (${p.payload.count} entrega${p.payload.count > 1 ? "s" : ""})`,
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="days"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ fill: "#2563EB", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <div className="h-40 w-full">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Dias por importação (ordenado)
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" vertical={false} />
              <XAxis dataKey="idx" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}d`} />
              <RTooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #1E293B",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v} dias`, "Tempo"]}
                labelFormatter={(l) => `Importação #${l}`}
              />
              <Bar dataKey="dias" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

