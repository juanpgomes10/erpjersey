import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ClipboardList, X, Trash2, UserPlus, UserCheck, ChevronRight, ChevronLeft, Pencil, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadXlsx, todayStr } from "@/lib/export-xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { detectCarrier } from "@/lib/carrier";
import { Textarea } from "@/components/ui/textarea";
import { ProductCascade, emptyCascadeValue, type ProductCascadeValue } from "@/components/product/product-cascade";
import { buildProductLabel } from "@/lib/teams";
import type { Database } from "@/integrations/supabase/types";
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

type SizeOpt = Database["public"]["Enums"]["product_size"];
type OrderStatus = "pendente" | "pago" | "enviado" | "entregue" | "cancelado";
type DisplayStatus = OrderStatus | "envio_pendente";

const FINANCE_TABS: { value: DisplayStatus; label: string }[] = [
  { value: "pago", label: "Pago" },
  { value: "pendente", label: "Pagamento pendente" },
  { value: "cancelado", label: "Cancelado" },
];

const LOGISTICS_TABS: { value: DisplayStatus; label: string }[] = [
  { value: "envio_pendente", label: "Envio pendente" },
  { value: "enviado", label: "Enviado" },
  { value: "entregue", label: "Entregue" },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  envio_pendente: "Envio pendente",
};

const STATUS_STYLE: Record<DisplayStatus, { bg: string; fg: string }> = {
  pendente: { bg: "#D9770615", fg: "#D97706" },
  pago: { bg: "#16A34A15", fg: "#16A34A" },
  enviado: { bg: "#2563EB15", fg: "#2563EB" },
  entregue: { bg: "#16A34A15", fg: "#16A34A" },
  cancelado: { bg: "#DC262615", fg: "#DC2626" },
  envio_pendente: { bg: "#9333EA15", fg: "#9333EA" },
};

type FulfillmentStatus =
  | "aguardando_fornecedor"
  | "aguardando_envio_fornecedor"
  | "enviado"
  | "aguardando_retirada"
  | "entregue";

type OrderLike = {
  status: OrderStatus;
  tracking_code: string | null;
  supplier_name: string | null;
  fulfillment_status?: string | null;
};

function financeStatusOf(o: OrderLike): "pago" | "pendente" | "cancelado" {
  if (o.status === "cancelado") return "cancelado";
  const f = o.fulfillment_status as FulfillmentStatus | null | undefined;
  if (f) {
    if (f === "aguardando_fornecedor") return "pendente";
    return "pago"; // demais estágios já implicam pagamento confirmado
  }
  if (o.status === "pago" || o.status === "enviado" || o.status === "entregue") return "pago";
  return "pendente";
}

function logisticsStatusOf(o: OrderLike): "envio_pendente" | "enviado" | "entregue" | null {
  if (o.status === "cancelado") return null;
  const f = o.fulfillment_status as FulfillmentStatus | null | undefined;
  if (f) {
    if (f === "entregue") return "entregue";
    if (f === "enviado" || f === "aguardando_retirada") return "enviado";
    return "envio_pendente"; // aguardando_fornecedor / aguardando_envio_fornecedor
  }
  if (o.status === "entregue") return "entregue";
  if (o.status === "enviado") return "enviado";
  return "envio_pendente";
}

function displayStatusOf(o: OrderLike): DisplayStatus {
  // mantido para compat (filtro único): combina ambos
  const log = logisticsStatusOf(o);
  if (log && log !== "envio_pendente") return log;
  return financeStatusOf(o);
}

function StatusBadge({ status }: { status: DisplayStatus }) {
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

function OrderStatusBadges({ o }: { o: OrderLike }) {
  const fin = financeStatusOf(o);
  const log = logisticsStatusOf(o);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={fin} />
      {log && <StatusBadge status={log} />}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  activeTab,
  counts,
  onChange,
}: {
  label: string;
  options: { value: DisplayStatus; label: string }[];
  activeTab: DisplayStatus | "todos";
  counts: Record<string, number>;
  onChange: (v: DisplayStatus | "todos") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((t) => {
          const active = activeTab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-[color:#2563EB] bg-[color:#2563EB15] text-[color:#2563EB]"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-[color:#2563EB] text-white" : "bg-muted"}`}
              >
                {counts[t.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
  supplier_name: string | null;
  tracking_code: string | null;
  store_id: string;
  fulfillment_status: string | null;
  delivery_method: string | null;
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DisplayStatus | "todos">("todos");
  const [period, setPeriod] = useState<"todos" | "hoje" | "semana" | "mes" | "3meses" | "6meses" | "12meses">("todos");
  const [openNew, setOpenNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("__keep__");
  const [bulkFulfillment, setBulkFulfillment] = useState<string>("__keep__");
  const [bulkPayment, setBulkPayment] = useState<string>("__keep__");

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSelection = () => setSelected(new Set());

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, total_value, discount, payment_method, notes, created_at, paid_at, shipped_at, delivered_at, cancelled_at, source, supplier_name, tracking_code, store_id, fulfillment_status, delivery_method, customer:customers(id, name, phone, instagram), items:order_items(id, size, quantity, unit_price, product_name, product:products(id, name, team, season, model, image_url))",
        )

        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: 0, pendente: 0, pago: 0, enviado: 0, entregue: 0, cancelado: 0, envio_pendente: 0 };
    (orders ?? []).forEach((o) => {
      c.todos++;
      c[financeStatusOf(o)] = (c[financeStatusOf(o)] ?? 0) + 1;
      const log = logisticsStatusOf(o);
      if (log) c[log] = (c[log] ?? 0) + 1;
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
      if (tab !== "todos" && financeStatusOf(o) !== tab && logisticsStatusOf(o) !== tab) return false;
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

  const filteredIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = filteredIds.some((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((prev) => {
      if (allSelected) {
        const n = new Set(prev);
        filteredIds.forEach((id) => n.delete(id));
        return n;
      }
      const n = new Set(prev);
      filteredIds.forEach((id) => n.add(id));
      return n;
    });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["fin-tx"] });
    qc.invalidateQueries({ queryKey: ["fin-orders"] });
  };

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const patch: Record<string, string> = {};
      if (bulkStatus !== "__keep__") patch.status = bulkStatus;
      if (bulkFulfillment !== "__keep__") patch.fulfillment_status = bulkFulfillment;
      if (bulkPayment !== "__keep__") patch.payment_method = bulkPayment;
      if (Object.keys(patch).length === 0) throw new Error("Nada para alterar");
      const { error } = await supabase.from("orders").update(patch as never).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedidos atualizados");
      invalidateAll();
      setBulkEditOpen(false);
      setBulkStatus("__keep__");
      setBulkFulfillment("__keep__");
      setBulkPayment("__keep__");
      clearSelection();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (ids.length === 0) return;
      const { error } = await supabase.from("orders").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedidos excluídos");
      invalidateAll();
      setBulkDeleteOpen(false);
      clearSelection();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const exportSelected = () => {
    const ids = selected;
    const rows = (orders ?? [])
      .filter((o) => ids.has(o.id))
      .map((o) => {
        const total = Number(o.total_value) - Number(o.discount || 0);
        return {
          "Nº": orderNum(o.order_number),
          Cliente: o.customer?.name ?? "",
          Telefone: o.customer?.phone ?? "",
          Produtos: o.items
            .map((i) => `${i.product?.name ?? i.product_name ?? "Produto"}${i.size ? ` (${i.size})` : ""} x${i.quantity}`)
            .join(", "),
          Total: total.toFixed(2),
          "Forma de pagamento": paymentMethodLabel[o.payment_method] ?? o.payment_method,
          Status: STATUS_LABEL[financeStatusOf(o)],
          Logística: (() => {
            const l = logisticsStatusOf(o);
            return l ? STATUS_LABEL[l] : "";
          })(),
          Data: fmtDateTime(o.created_at),
          Fornecedor: o.supplier_name ?? "",
          Rastreio: o.tracking_code ?? "",
        };
      });
    if (rows.length === 0) {
      toast.error("Nenhum pedido selecionado");
      return;
    }
    downloadXlsx(`pedidos-${todayStr()}.xlsx`, { Pedidos: rows });
    toast.success(`${rows.length} pedido(s) exportado(s)`);
  };

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

      <div className="space-y-3">
        <FilterGroup
          label="Financeiro"
          options={FINANCE_TABS}
          activeTab={tab}
          counts={counts}
          onChange={setTab}
        />
        <FilterGroup
          label="Logística"
          options={LOGISTICS_TABS}
          activeTab={tab}
          counts={counts}
          onChange={setTab}
        />
        <div>
          <button
            type="button"
            onClick={() => setTab("todos")}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "todos"
                ? "border-[color:#2563EB] bg-[color:#2563EB15] text-[color:#2563EB]"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            Todos <span className="ml-1 opacity-70">({counts.todos ?? 0})</span>
          </button>
        </div>
      </div>


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

          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[color:#2563EB] bg-[color:#2563EB10] px-3 py-2">
              <span className="text-sm font-medium text-[color:#2563EB]">
                {selected.size} selecionado(s)
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Editar em massa
                </Button>
                <Button size="sm" variant="outline" onClick={exportSelected}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Exportar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar
                </Button>
              </div>
            </div>
          )}

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
                      <th className="px-3 py-2 w-8">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={toggleAll}
                          aria-label="Selecionar todos"
                        />
                      </th>
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
                        data-state={selected.has(o.id) ? "selected" : undefined}
                        className="group border-b border-border last:border-none hover:bg-accent/40 data-[state=selected]:bg-accent/60"
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(o.id)}
                            onCheckedChange={() => toggleOne(o.id)}
                            aria-label={`Selecionar ${orderNum(o.order_number)}`}
                          />
                        </td>
                        <td className="px-3 py-3 font-medium tabular" onClick={() => setDetailId(o.id)}>
                          <div className="flex items-center gap-2 cursor-pointer">
                            <span>{orderNum(o.order_number)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => setDetailId(o.id)}>{o.customer?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground truncate max-w-[220px] cursor-pointer" onClick={() => setDetailId(o.id)}>{productSummary}</td>
                        <td className="px-3 py-3 text-right tabular font-medium cursor-pointer" onClick={() => setDetailId(o.id)}>{fmtBRL(total)}</td>
                        <td className="px-3 py-3 text-muted-foreground cursor-pointer" onClick={() => setDetailId(o.id)}>{paymentMethodLabel[o.payment_method] ?? o.payment_method}</td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => setDetailId(o.id)}><OrderStatusBadges o={o} /></td>
                        <td className="px-3 py-3 text-muted-foreground cursor-pointer" onClick={() => setDetailId(o.id)}>{fmtDate(o.created_at)}</td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => setDetailId(o.id)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </td>
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
                          </div>
                        <OrderStatusBadges o={o} />
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

type SourceKey = "estoque" | "fornecedor_china" | "revendedor_br";
const ORDER_SOURCE_TABS: { value: SourceKey; label: string }[] = [
  { value: "estoque", label: "Estoque da loja" },
  { value: "fornecedor_china", label: "Fornecedor China" },
  { value: "revendedor_br", label: "Revendedor BR" },
];

type EditItem = {
  id: string;            // existing order_items id, or "new-<n>"
  product_id: string | null;
  product_name: string;
  size: SizeOpt | null;
  quantity: number;
  unit_price: number;
  removed?: boolean;
};

function OrderDetailDrawer({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Customer
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custInstagram, setCustInstagram] = useState("");

  // Items
  const [items, setItems] = useState<EditItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newCascade, setNewCascade] = useState<ProductCascadeValue>(emptyCascadeValue());
  const [newQty, setNewQty] = useState(1);
  const [newPriceStr, setNewPriceStr] = useState("");

  // Finance
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [discountStr, setDiscountStr] = useState("");
  const [notes, setNotes] = useState("");

  // Logistics / status
  const [src, setSrc] = useState<SourceKey>("estoque");
  const [supplier, setSupplier] = useState("");
  const [tracking, setTracking] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [uiStatus, setUiStatus] = useState<string>("aguardando_fornecedor");

  useEffect(() => {
    if (!order) return;
    setCustName(order.customer?.name ?? "");
    setCustPhone(order.customer?.phone ?? "");
    setCustInstagram(order.customer?.instagram ?? "");

    setItems(
      order.items.map((it) => ({
        id: it.id,
        product_id: it.product?.id ?? null,
        product_name: it.product?.name ?? it.product_name ?? "Produto",
        size: (it.size as SizeOpt) ?? null,
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
      })),
    );
    setShowAdd(false);
    setNewCascade(emptyCascadeValue());
    setNewQty(1);
    setNewPriceStr("");

    setPaymentMethod(order.payment_method ?? "pix");
    setDiscountStr(order.discount ? String(order.discount) : "");
    setNotes(order.notes ?? "");

    const s = (order.source ?? "estoque") as string;
    const normalized: SourceKey =
      s === "drop" ? "fornecedor_china" :
      s === "loja_parceira" ? "revendedor_br" :
      (["estoque", "fornecedor_china", "revendedor_br"].includes(s) ? (s as SourceKey) : "estoque");
    setSrc(normalized);
    setSupplier(order.supplier_name ?? "");
    setTracking(order.tracking_code ?? "");
    setCreatedAt(order.created_at ? String(order.created_at).slice(0, 10) : "");

    const fStatus = order.fulfillment_status;
    if (fStatus) {
      setUiStatus(fStatus);
    } else {
      const stored = typeof window !== "undefined" ? localStorage.getItem(`order_ui_status:${order.id}`) : null;
      if (stored === "aguardando_retirada" && order.status === "enviado") {
        setUiStatus("aguardando_retirada");
      } else if (order.status === "pendente") {
        setUiStatus("aguardando_fornecedor");
      } else if (order.status === "pago") {
        setUiStatus("aguardando_envio_fornecedor");
      } else {
        setUiStatus(order.status);
      }
    }
  }, [order]);

  const visibleItems = items.filter((i) => !i.removed);
  const subtotalCalc = visibleItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountNum = Number(discountStr) || 0;
  const totalCalc = Math.max(subtotalCalc - discountNum, 0);

  function fulfillmentToDb(v: string): { status: OrderStatus; fulfillment_status: string | null } {
    const map: Record<string, OrderStatus> = {
      aguardando_fornecedor: "pendente",
      aguardando_envio_fornecedor: "pago",
      enviado: "enviado",
      aguardando_retirada: "enviado",
      entregue: "entregue",
      pendente: "pendente",
      pago: "pago",
      cancelado: "cancelado",
    };
    const fulfillmentSet = ["aguardando_fornecedor","aguardando_envio_fornecedor","enviado","aguardando_retirada","entregue"];
    return {
      status: map[v] ?? "pendente",
      fulfillment_status: fulfillmentSet.includes(v) ? v : null,
    };
  }

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!order) return;
      if (!custName.trim()) throw new Error("Nome do cliente é obrigatório");
      if (visibleItems.length === 0) throw new Error("O pedido precisa ter ao menos um item");

      // 1. Cliente
      if (order.customer?.id) {
        const { error: cErr } = await supabase
          .from("customers")
          .update({
            name: custName.trim(),
            phone: custPhone.trim() || null,
            instagram: custInstagram.trim() || null,
          } as never)
          .eq("id", order.customer.id);
        if (cErr) throw cErr;
      }

      // 2. Itens — update/delete/insert
      for (const it of items) {
        if (it.removed && !it.id.startsWith("new-")) {
          await supabase.from("order_items").delete().eq("id", it.id);
        } else if (it.id.startsWith("new-") && !it.removed) {
          await supabase.from("order_items").insert({
            order_id: order.id,
            product_id: it.product_id,
            product_name: it.product_name,
            size: it.size,
            quantity: it.quantity,
            unit_price: it.unit_price,
          } as never);
        } else if (!it.removed) {
          await supabase
            .from("order_items")
            .update({
              product_name: it.product_name,
              size: it.size,
              quantity: it.quantity,
              unit_price: it.unit_price,
            } as never)
            .eq("id", it.id);
        }
      }

      // 3. Pedido
      const { status: dbStatus, fulfillment_status } = fulfillmentToDb(uiStatus);
      const createdAtIso = createdAt ? new Date(`${createdAt}T12:00:00`).toISOString() : null;
      const trackingTrim = tracking.trim();
      const supplierTrim = supplier.trim();

      const { error: oErr } = await supabase
        .from("orders")
        .update({
          payment_method: paymentMethod,
          discount: discountNum,
          total_value: subtotalCalc,
          notes: notes.trim() || null,
          source: src,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          status: dbStatus,
          fulfillment_status,
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .eq("id", order.id);
      if (oErr) throw oErr;

      // 4. Venda vinculada
      await supabase
        .from("sales")
        .update({
          payment_method: paymentMethod,
          total_value: totalCalc,
          notes: notes.trim() || null,
          source: src,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          fulfillment_status,
          customer_name_snapshot: custName.trim(),
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .eq("order_id", order.id);

      // 5. Importação
      if (trackingTrim) {
        const { data: existing } = await supabase
          .from("imports")
          .select("id, linked_order_ids, order_numbers")
          .eq("tracking_code", trackingTrim)
          .maybeSingle();
        if (existing) {
          const linked = Array.from(new Set([...(existing.linked_order_ids ?? []), order.id]));
          const nums = Array.from(
            new Set([...(existing.order_numbers ?? []), order.order_number].filter(Boolean) as number[]),
          );
          await supabase
            .from("imports")
            .update({ linked_order_ids: linked, order_numbers: nums } as never)
            .eq("id", existing.id);
        } else {
          const guess = detectCarrier(trackingTrim);
          await supabase.from("imports").insert({
            store_id: order.store_id,
            tracking_code: trackingTrim,
            supplier: supplierTrim || null,
            carrier: guess?.name ?? null,
            country: guess?.country ?? null,
            status: "comprado",
            total_value: 0,
            linked_order_ids: [order.id],
            order_numbers: order.order_number ? [order.order_number] : [],
          } as never);
        }
      }
    },
    onSuccess: () => {
      toast.success("Pedido atualizado");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-orders"] });
      qc.invalidateQueries({ queryKey: ["customers-search"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
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
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-orders"] });
      setConfirmDelete(false);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  function addNewItem() {
    if (!newCascade.team || !newCascade.productType || !newCascade.model || !newCascade.size) {
      toast.error("Preencha time, tipo, modelo e tamanho");
      return;
    }
    const price = Number(newPriceStr) || 0;
    if (price <= 0) { toast.error("Informe o preço unitário"); return; }
    const label = buildProductLabel({
      team: newCascade.team,
      season: newCascade.season,
      productType: newCascade.productType,
      model: newCascade.model,
      specialEdition: newCascade.specialEdition,
      gender: newCascade.gender,
    });
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        product_id: null,
        product_name: label,
        size: newCascade.size as SizeOpt,
        quantity: newQty,
        unit_price: price,
      },
    ]);
    setNewCascade(emptyCascadeValue());
    setNewQty(1);
    setNewPriceStr("");
    setShowAdd(false);
  }

  const open = !!order;
  if (!order) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

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
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-sora">
              Editar pedido {orderNum(order.order_number)}
              <OrderStatusBadges o={order} />
            </SheetTitle>
            <p className="text-xs text-muted-foreground">{fmtDateTime(order.created_at)}</p>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Cliente */}
            <section className="space-y-2 rounded-md border border-border p-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Cliente</h4>
              <div>
                <Label>Nome*</Label>
                <Input value={custName} onChange={(e) => setCustName(e.target.value)} maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} maxLength={40} />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input value={custInstagram} onChange={(e) => setCustInstagram(e.target.value)} maxLength={80} />
                </div>
              </div>
            </section>

            {/* Itens */}
            <section className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Produtos</h4>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd((s) => !s)}>
                  {showAdd ? "Cancelar" : "Adicionar item"}
                </Button>
              </div>

              <div className="space-y-2">
                {visibleItems.map((it) => {
                  const realIdx = items.findIndex((x) => x.id === it.id);
                  return (
                    <div key={it.id} className="space-y-2 rounded-md border border-border p-2">
                      <div className="flex items-start gap-2">
                        <Input
                          className="flex-1"
                          value={it.product_name}
                          onChange={(e) => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, product_name: e.target.value } : x))}
                          maxLength={200}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, removed: true } : x))}
                          aria-label="Remover item"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Tam</Label>
                          <Input
                            value={it.size ?? ""}
                            onChange={(e) => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, size: (e.target.value as SizeOpt) || null } : x))}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Qtd</Label>
                          <Input
                            type="number" min={1}
                            value={it.quantity}
                            onChange={(e) => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Preço un.</Label>
                          <Input
                            type="number" step="0.01"
                            value={it.unit_price}
                            onChange={(e) => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, unit_price: Number(e.target.value) || 0 } : x))}
                            className="h-8 text-right tabular"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {visibleItems.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum item. Adicione ao menos um.</p>
                )}
              </div>

              {showAdd && (
                <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                  <ProductCascade value={newCascade} onChange={setNewCascade} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Qtd</Label>
                      <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-xs">Preço un. (R$)*</Label>
                      <Input type="number" step="0.01" value={newPriceStr} onChange={(e) => setNewPriceStr(e.target.value)} className="h-8" />
                    </div>
                  </div>
                  <Button size="sm" onClick={addNewItem} className="w-full">Adicionar ao pedido</Button>
                </div>
              )}
            </section>

            {/* Pagamento */}
            <section className="space-y-2 rounded-md border border-border p-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Pagamento</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Forma</Label>
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
                  <Label>Desconto (R$)</Label>
                  <Input type="number" step="0.01" value={discountStr} onChange={(e) => setDiscountStr(e.target.value)} />
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{fmtBRL(subtotalCalc)}</span></div>
                {discountNum > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular text-[color:#DC2626]">- {fmtBRL(discountNum)}</span></div>
                )}
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular">{fmtBRL(totalCalc)}</span></div>
              </div>
            </section>

            <section>
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} />
            </section>

            {/* Logística */}
            <section className="space-y-3 rounded-md border border-border p-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Logística</h4>
              <div>
                <Label className="mb-1.5 block">Origem</Label>
                <Tabs value={src} onValueChange={(v) => setSrc(v as SourceKey)}>
                  <TabsList className="grid w-full grid-cols-3">
                    {ORDER_SOURCE_TABS.map((t) => (
                      <TabsTrigger key={t.value} value={t.value} className="text-xs">{t.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {src !== "estoque" && (
                  <Input
                    className="mt-2"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={src === "fornecedor_china" ? "Nome do fornecedor" : "Nome do revendedor"}
                    maxLength={120}
                  />
                )}
              </div>
              <div>
                <Label>Código de rastreamento / Forma de entrega</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex.: LP123456789CN" maxLength={120} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Motoboy", "Entrega pessoal", "Retirada na loja"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTracking(opt)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        tracking === opt
                          ? "border-[color:#2563EB] bg-[color:#2563EB15] text-[color:#2563EB]"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Data da compra</Label>
                <Input type="date" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
              </div>
            </section>

            {/* Status */}
            <section className="space-y-2">
              <Label>Status atual do pedido <span className="text-[color:#DC2626]">*</span></Label>
              <Select value={uiStatus} onValueChange={setUiStatus}>
                <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aguardando_fornecedor">Aguardando fazer pedido com fornecedor</SelectItem>
                  <SelectItem value="aguardando_envio_fornecedor">Aguardando envio do fornecedor</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="aguardando_retirada">Aguardando retirada do cliente</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Alimenta os filtros (envio pendente, enviado, entregue, etc.).
              </p>
            </section>

            {/* Histórico */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between"><span>{h.label}</span><span>{fmtDateTime(h.at)}</span></li>
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-between">
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
              <div className="flex gap-2 sm:justify-end">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}>
                  {saveAll.isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
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
  productId: string | null;
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

  // Step 1 — cascata "cria na hora"
  const [cascade, setCascade] = useState<ProductCascadeValue>(emptyCascadeValue());
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
      setCascade(emptyCascadeValue());
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

  const { data: customers } = useQuery({
    queryKey: ["customers-search"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, phone").order("name").limit(300);
      return data ?? [];
    },
    enabled: open,
  });

  const filteredCustomers = (customers ?? []).filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  const addToCart = () => {
    if (!cascade.team) { toast.error("Selecione o time / seleção"); return; }
    if (!cascade.productType) { toast.error("Selecione o tipo de produto"); return; }
    if (!cascade.model) { toast.error("Selecione o modelo"); return; }
    if (cascade.model === "edicao_especial" && !cascade.specialEdition.trim()) {
      toast.error("Informe qual edição especial"); return;
    }
    if (!cascade.size) { toast.error("Selecione o tamanho"); return; }
    if (cfgQty < 1) { toast.error("Quantidade inválida"); return; }
    const price = Number(cfgPriceStr) || 0;
    if (price <= 0) { toast.error("Informe o preço"); return; }

    const label = buildProductLabel({
      team: cascade.team,
      season: cascade.season,
      productType: cascade.productType,
      model: cascade.model,
      specialEdition: cascade.specialEdition,
      gender: cascade.gender,
    });

    setCart((prev) => [...prev, {
      productId: null,
      productName: label,
      team: cascade.team,
      size: cascade.size as SizeOpt,
      quantity: cfgQty,
      unitPrice: price,
      stock: 0,
    }]);

    setCascade(emptyCascadeValue());
    setCfgQty(1);
    setCfgPriceStr("");
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
            <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Configurar produto do pedido</p>

              <ProductCascade value={cascade} onChange={setCascade} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={cfgQty} onChange={(e) => setCfgQty(Math.max(1, Number(e.target.value)))} />
                </div>
                <div>
                  <Label>Preço unit. (R$)*</Label>
                  <Input type="number" step="0.01" value={cfgPriceStr} onChange={(e) => setCfgPriceStr(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCascade(emptyCascadeValue()); setCfgQty(1); setCfgPriceStr(""); }}>Limpar</Button>
                <Button onClick={addToCart}>Adicionar ao pedido</Button>
              </div>
            </div>


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
