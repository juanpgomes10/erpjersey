import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ExportPeriod = "today" | "week" | "month" | "year" | "custom";

export function periodToRange(period: ExportPeriod, custom?: { from?: string; to?: string }) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      break;
    case "week": {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      break;
    }
    case "month":
      start.setDate(1);
      break;
    case "year":
      start.setMonth(0, 1);
      break;
    case "custom":
      if (custom?.from) start.setTime(new Date(custom.from + "T00:00:00").getTime());
      if (custom?.to) end.setTime(new Date(custom.to + "T23:59:59").getTime());
      break;
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleString("pt-BR");
}
function fmtMoney(n?: number | null) {
  return Number(n ?? 0).toFixed(2);
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  concluida: "Concluída",
  comprado: "Comprado",
  em_transito: "Em trânsito",
  recebido_brasil: "Recebido no Brasil",
  saiu_entrega: "Saiu para entrega",
  aguardando_taxa: "Aguardando pagamento de tributos",
};
const lbl = (s?: string | null) => (s ? STATUS_LABEL[s] ?? s : "");

export async function fetchSalesRows(range: { from: string; to: string }) {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, created_at, total_value, net_value, profit, payment_method, status, customer_name_snapshot, customers(name), sale_items(quantity, unit_price, product_name_snapshot)",
    )
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s: any) => {
    const items = s.sale_items ?? [];
    const products = items.map((i: any) => i.product_name_snapshot).filter(Boolean).join(", ");
    const qty = items.reduce((a: number, i: any) => a + Number(i.quantity || 0), 0);
    const unit = items.length ? Number(items[0].unit_price || 0).toFixed(2) : "";
    return {
      Data: fmtDate(s.created_at),
      "Nº Venda": s.id.slice(0, 8),
      Cliente: s.customers?.name ?? s.customer_name_snapshot ?? "",
      Produtos: products,
      Quantidade: qty,
      "Valor unitário": unit,
      "Valor total": fmtMoney(s.total_value),
      Lucro: fmtMoney(s.profit),
      "Forma de pagamento": s.payment_method,
      Status: lbl(s.status),
    };
  });
}

export async function fetchOrdersRows(range: { from: string; to: string }, status?: string) {
  let q = supabase
    .from("orders")
    .select(
      "id, order_number, created_at, total_value, discount, payment_method, status, customers(name), order_items(quantity, products(name))",
    )
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status as any);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((o: any) => ({
    Data: fmtDate(o.created_at),
    "Nº Pedido": String(o.order_number ?? "").padStart(4, "0"),
    Cliente: o.customers?.name ?? "",
    Produtos: (o.order_items ?? [])
      .map((i: any) => `${i.products?.name ?? "—"} x${i.quantity}`)
      .join(", "),
    "Valor total": fmtMoney(Number(o.total_value) - Number(o.discount || 0)),
    "Forma de pagamento": o.payment_method,
    Status: lbl(o.status),
  }));
}

export async function fetchCustomersRows() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, instagram, city, created_at, sales(total_value, created_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: any) => {
    const sales = c.sales ?? [];
    const totalSpent = sales.reduce((a: number, s: any) => a + Number(s.total_value || 0), 0);
    const last = sales.reduce(
      (acc: string | null, s: any) => (!acc || s.created_at > acc ? s.created_at : acc),
      null as string | null,
    );
    return {
      Nome: c.name,
      WhatsApp: c.phone ?? "",
      Instagram: c.instagram ?? "",
      Cidade: c.city ?? "",
      "Total de compras": sales.length,
      "Valor total gasto": fmtMoney(totalSpent),
      "Última compra": last ? fmtDate(last) : "",
      "Data de cadastro": fmtDate(c.created_at),
    };
  });
}

export async function fetchImportsRows(range: { from: string; to: string }) {
  const { data, error } = await supabase
    .from("imports")
    .select(
      "tracking_code, supplier, country, carrier, status, expected_delivery, value_usd, total_value, customs_fee, created_at",
    )
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i: any) => ({
    "Código de rastreio": i.tracking_code ?? "",
    Fornecedor: i.supplier ?? "",
    País: i.country ?? "",
    Transportadora: i.carrier ?? "",
    Status: lbl(i.status),
    "Previsão de entrega": i.expected_delivery ?? "",
    "Valor USD": fmtMoney(i.value_usd),
    "Valor R$": fmtMoney(i.total_value),
    "Taxa alfandegária": fmtMoney(i.customs_fee),
    "Data de cadastro": fmtDate(i.created_at),
  }));
}

export async function fetchFinanceRows(range: { from: string; to: string }) {
  const { data, error } = await supabase
    .from("transactions")
    .select("created_at, type, description, category, value, payment_method, notes")
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    Data: fmtDate(t.created_at),
    Tipo: t.type === "entrada" ? "Entrada" : "Saída",
    Descrição: t.description,
    Categoria: t.category,
    Valor: fmtMoney(t.value),
    "Forma de pagamento": t.payment_method ?? "",
    Observações: t.notes ?? "",
  }));
}

export function downloadXlsx(filename: string, sheets: Record<string, any[]>) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "Sem dados no período" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
