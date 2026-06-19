import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Receipt, X, UserPlus, UserCheck, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectCarrier } from "@/lib/carrier";
import { fmtBRL, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { ProductCascade, emptyCascadeValue, type ProductCascadeValue } from "@/components/product/product-cascade";
import { PhotoUploader } from "@/components/product/photo-uploader";
import { buildProductLabel } from "@/lib/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/use-profile";

import type { Database } from "@/integrations/supabase/types";
type SizeOpt = Database["public"]["Enums"]["product_size"];
type SourceKey = "estoque" | "fornecedor_china" | "revendedor_br";

const SOURCE_TABS: { value: SourceKey; label: string }[] = [
  { value: "estoque", label: "Estoque da loja" },
  { value: "fornecedor_china", label: "Fornecedor China" },
  { value: "revendedor_br", label: "Revendedor BR" },
];

const sourceLabel = (s: string) => {
  if (s === "drop") return "Fornecedor China";
  if (s === "loja_parceira") return "Revendedor BR";
  const f = SOURCE_TABS.find((o) => o.value === s);
  return f?.label ?? s;
};

type DeliveryMethod = "entrega_particular" | "motoboy_app" | "retirada_loja";
const DELIVERY_METHOD_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: "entrega_particular", label: "Entrega particular" },
  { value: "motoboy_app", label: "Motoboy / app" },
  { value: "retirada_loja", label: "Retirada na loja" },
];

type FulfillmentStatus =
  | "aguardando_fornecedor"
  | "aguardando_envio_fornecedor"
  | "enviado"
  | "aguardando_retirada"
  | "entregue";

const FULFILLMENT_OPTIONS: { value: FulfillmentStatus; label: string }[] = [
  { value: "aguardando_fornecedor", label: "Aguardando fazer pedido com fornecedor" },
  { value: "aguardando_envio_fornecedor", label: "Aguardando envio do fornecedor" },
  { value: "enviado", label: "Enviado" },
  { value: "aguardando_retirada", label: "Aguardando retirada do cliente" },
  { value: "entregue", label: "Entregue" },
];

// Mapeia o status visual escolhido pelo usuário para o status canônico do pedido,
// que alimenta os filtros existentes (pendente / pago / enviado / entregue).
function fulfillmentToOrderStatus(
  f: FulfillmentStatus,
  paidValue: number = 0,
): "pendente" | "pago" | "enviado" | "entregue" {
  // Se o cliente já pagou (valor pago > 0), o pedido nunca é "pendente",
  // mesmo que ainda esteja aguardando o fornecedor.
  switch (f) {
    case "aguardando_fornecedor": return paidValue > 0 ? "pago" : "pendente";
    case "aguardando_envio_fornecedor": return "pago";
    case "enviado": return "enviado";
    case "aguardando_retirada": return "enviado";
    case "entregue": return "entregue";
  }
}

// Helper para vincular pedido a uma importação (upsert)
async function linkOrderToImport(opts: {
  storeId: string;
  trackingCode: string;
  supplierName: string | null;
  orderId: string;
  orderNumber: number | null;
}) {
  const code = opts.trackingCode.trim();
  if (!code) return;
  const { data: existing } = await supabase
    .from("imports")
    .select("id, linked_order_ids, order_numbers")
    .eq("tracking_code", code)
    .maybeSingle();
  if (existing) {
    const linked = Array.from(new Set([...(existing.linked_order_ids ?? []), opts.orderId]));
    const nums = Array.from(
      new Set([...(existing.order_numbers ?? []), opts.orderNumber].filter(Boolean) as number[]),
    );
    await supabase
      .from("imports")
      .update({ linked_order_ids: linked, order_numbers: nums } as never)
      .eq("id", existing.id);
  } else {
    const guess = detectCarrier(code);
    await supabase.from("imports").insert({
      store_id: opts.storeId,
      tracking_code: code,
      supplier: opts.supplierName,
      carrier: guess?.name ?? null,
      country: guess?.country ?? null,
      status: "comprado",
      total_value: 0,
      linked_order_ids: [opts.orderId],
      order_numbers: opts.orderNumber ? [opts.orderNumber] : [],
    } as never);
  }
}

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — ERPJersey" }] }),
  component: VendasPage,
});

function VendasPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, customer:customers(id, name, phone, address), items:sale_items(id, product_id, product_name_snapshot, size, quantity, unit_price, unit_cost, product:products(name, model, team, season))")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const filtered = (sales ?? []).filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const customerName = ((s.customer as { name: string } | null)?.name ?? s.customer_name_snapshot ?? "").toLowerCase();
    const productNames = (s.items as Array<{ product: { name: string } | null }>)?.map((i) => i.product?.name?.toLowerCase() ?? "").join(" ");
    return customerName.includes(q) || productNames.includes(q);
  });

  const editing = (sales ?? []).find((s) => s.id === editId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Vendas</h1>
          <p className="text-sm text-muted-foreground">Registre e acompanhe suas vendas</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova venda
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou produto..."
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-left font-medium">Itens</th>
                    <th className="px-3 py-2 text-left font-medium">Origem</th>
                    <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                    <th className="px-3 py-2 text-right font-medium">Pago</th>
                    <th className="px-3 py-2 text-right font-medium">Líquido</th>
                    <th className="px-3 py-2 text-right font-medium">Lucro</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const items = s.items as Array<{ quantity: number; product: { name: string } | null }>;
                    const customer = (s.customer as { name: string } | null)?.name ?? s.customer_name_snapshot ?? "—";
                    const netValue = Number((s as unknown as { net_value?: number }).net_value ?? 0) || Number(s.total_value);
                    const sourceVal = (s as unknown as { source?: string }).source ?? "estoque";
                    return (
                      <tr
                        key={s.id}
                        className="group border-b border-border last:border-none hover:bg-accent/40"
                      >
                        <td className="px-3 py-3 text-muted-foreground cursor-pointer" onClick={() => setEditId(s.id)}>{fmtDateTime(s.created_at)}</td>
                        <td className="px-3 py-3 font-medium cursor-pointer" onClick={() => setEditId(s.id)}>{customer}</td>
                        <td className="px-3 py-3 text-muted-foreground cursor-pointer" onClick={() => setEditId(s.id)}>
                          {items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0} item(ns)
                        </td>
                        <td className="px-3 py-3 text-muted-foreground cursor-pointer" onClick={() => setEditId(s.id)}>{sourceLabel(sourceVal)}</td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => setEditId(s.id)}>{paymentMethodLabel[s.payment_method] ?? s.payment_method}</td>
                        <td className="px-3 py-3 text-right tabular font-medium cursor-pointer" onClick={() => setEditId(s.id)}>{fmtBRL(Number(s.total_value))}</td>
                        <td className="px-3 py-3 text-right tabular cursor-pointer" onClick={() => setEditId(s.id)}>{fmtBRL(netValue)}</td>
                        <td className="px-3 py-3 text-right tabular text-[color:#16A34A] cursor-pointer" onClick={() => setEditId(s.id)}>{fmtBRL(Number(s.profit))}</td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => setEditId(s.id)}>
                          <Badge variant={s.status === "concluida" ? "default" : "secondary"}>
                            {s.status === "concluida" ? "Concluída" : "Cancelada"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => setEditId(s.id)}
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
          )}
        </CardContent>
      </Card>

      <NewSaleDialog open={open} onOpenChange={setOpen} />
      <EditSaleSheet sale={editing as unknown as SaleRow | null} onClose={() => setEditId(null)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Receipt className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 font-sora text-lg font-semibold">Nenhuma venda ainda</h3>
      <p className="mt-1 text-sm text-muted-foreground">Clique em "Nova venda" para começar.</p>
    </div>
  );
}

type CartItem = {
  productId: string | null;
  productName: string;
  size: SizeOpt;
  gender: "masculina" | "feminina" | "infantil";
  quantity: number;
  unitPrice: number;
  unitCost: number;
  imageUrl: string | null;
  stockBySize: Record<string, number>;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

function NewSaleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [cart, setCart] = useState<CartItem[]>([]);

  // Configurador do item (cascata Time → Temporada → Produto → Modelo → Gênero → Tamanho)
  const [cascade, setCascade] = useState<ProductCascadeValue>(emptyCascadeValue());
  const [cfgCostStr, setCfgCostStr] = useState("");
  const [cfgImageUrl, setCfgImageUrl] = useState<string | null>(null);

  
  const [cfgPersonalize, setCfgPersonalize] = useState(false);
  const [cfgPersonName, setCfgPersonName] = useState("");
  const [cfgPersonNumber, setCfgPersonNumber] = useState("");

  // Cliente
  const [customerMode, setCustomerMode] = useState<"cadastrado" | "novo">("novo");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Pagamento e faturamento
  const [paymentMethod, setPaymentMethod] = useState<string>("pix");
  const [source, setSource] = useState<SourceKey>("estoque");
  const [supplierName, setSupplierName] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | "">("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus | "">("");
  const [paidValueStr, setPaidValueStr] = useState("");
  const [netValueStr, setNetValueStr] = useState("");
  const [shippingCostStr, setShippingCostStr] = useState("");
  const [notes, setNotes] = useState("");

  // Data da venda
  const todayStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [saleDate, setSaleDate] = useState<string>(todayStr());

  function resetConfigurator() {
    setCascade(emptyCascadeValue());
    setCfgCostStr("");
    
    setCfgPersonalize(false);
    setCfgPersonName("");
    setCfgPersonNumber("");
  }

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setCart([]);
      resetConfigurator();
      setCustomerMode("novo");
      setCustomerId(null);
      setCustomerSearch("");
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerNotes("");
      setCustomerAddress("");
      setPaymentMethod("pix");
      setSource("estoque");
      setSupplierName("");
      setTrackingCode("");
      setDeliveryMethod("");
      setFulfillmentStatus("");
      setPaidValueStr("");
      setNetValueStr("");
      setShippingCostStr("");
      setNotes("");
      setSaleDate(todayStr());
    }
  }, [open]);

  const { data: customers } = useQuery({
    queryKey: ["customers-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, address")
        .order("name")
        .limit(300);
      return (data ?? []) as CustomerRow[];
    },
    enabled: open,
  });

  const filteredCustomers = (customers ?? []).filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  const totalCalc = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const paidValue = paidValueStr === "" ? totalCalc : Number(paidValueStr) || 0;
  const netValue = netValueStr === "" ? paidValue : Number(netValueStr) || 0;
  const shippingCost = Number(shippingCostStr) || 0;
  const itemsCost = cart.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const totalCost = itemsCost + shippingCost;
  const profit = netValue - totalCost;

  function confirmAddItem() {
    if (!cascade.team) { toast.error("Selecione o time / seleção"); return; }
    if (!cascade.productType) { toast.error("Selecione o tipo de produto"); return; }
    if (!cascade.model) { toast.error("Selecione o modelo"); return; }
    if (cascade.model === "edicao_especial" && !cascade.specialEdition.trim()) {
      toast.error("Informe qual edição especial"); return;
    }
    if (!cascade.size) { toast.error("Selecione o tamanho"); return; }
    const cost = Number(cfgCostStr) || 0;

    const baseLabel = buildProductLabel({
      team: cascade.team,
      season: cascade.season,
      productType: cascade.productType,
      model: cascade.model,
      specialEdition: cascade.specialEdition,
      gender: cascade.gender,
    });
    const personParts: string[] = [];
    if (cfgPersonalize) {
      if (cfgPersonName.trim()) personParts.push(`Nome: ${cfgPersonName.trim()}`);
      if (cfgPersonNumber.trim()) personParts.push(`Nº ${cfgPersonNumber.trim()}`);
    }
    const personSuffix = personParts.length ? ` · Personalização (${personParts.join(", ")})` : "";
    const fullLabel = `${baseLabel}${personSuffix}`;

    setCart((prev) => [
      ...prev,
      {
        productId: null,
        productName: fullLabel,
        size: cascade.size as SizeOpt,
        gender: cascade.gender,
        quantity: 1,
        unitPrice: 0,
        unitCost: cost,
        stockBySize: {},
      },
    ]);

    resetConfigurator();
  }


  const customerValid = useMemo(() => {
    if (customerMode === "cadastrado") return !!customerId;
    return newCustomerName.trim().length > 0;
  }, [customerMode, customerId, newCustomerName]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error("Sem loja vinculada");
      if (cart.length === 0) throw new Error("Adicione ao menos um produto");
      if (!customerValid) throw new Error("Selecione ou cadastre um cliente");
      if (!fulfillmentStatus) throw new Error("Selecione o status atual do pedido");

      // 1. Cliente
      let finalCustomerId: string | null = customerId;
      let customerNameSnapshot: string | null = null;
      if (customerMode === "novo") {
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({
            store_id: profile.store_id,
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || null,
            notes: newCustomerNotes.trim() || null,
            address: customerAddress.trim() || null,
          })
          .select()
          .single();
        if (cErr) throw cErr;
        finalCustomerId = created.id;
        customerNameSnapshot = created.name;
      } else {
        customerNameSnapshot = customers?.find((c) => c.id === customerId)?.name ?? null;
        if (customerId && customerAddress.trim()) {
          await supabase
            .from("customers")
            .update({ address: customerAddress.trim() })
            .eq("id", customerId);
        }
      }

      const createdAtIso =
        saleDate && saleDate !== todayStr()
          ? new Date(`${saleDate}T12:00:00`).toISOString()
          : null;

      // 2. Pedido (sempre criar — toda venda gera um pedido)
      const trackingTrim = trackingCode.trim();
      const supplierTrim = supplierName.trim();
      const orderStatus = fulfillmentToOrderStatus(fulfillmentStatus as FulfillmentStatus, paidValue);

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          store_id: profile.store_id,
          customer_id: finalCustomerId,
          user_id: profile.id,
          total_value: paidValue,
          status: orderStatus,
          payment_method: paymentMethod,
          notes: notes || null,
          source,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          delivery_method: deliveryMethod || null,
          fulfillment_status: fulfillmentStatus,
          shipping_cost: shippingCost,
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .select()
        .single();
      if (orderErr) throw orderErr;

      const { error: orderItemsErr } = await supabase.from("order_items").insert(
        cart.map((c) => ({
          order_id: order.id,
          product_id: c.productId,
          product_name: c.productName,
          size: c.size,
          quantity: c.quantity,
          unit_price: c.unitPrice,
        })),
      );
      if (orderItemsErr) throw orderItemsErr;

      // 3. Venda
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          store_id: profile.store_id,
          customer_id: finalCustomerId,
          customer_name_snapshot: customerNameSnapshot,
          user_id: profile.id,
          total_value: paidValue,
          net_value: netValue,
          source,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          delivery_method: deliveryMethod || null,
          fulfillment_status: fulfillmentStatus,
          order_id: order.id,
          profit,
          payment_method: paymentMethod as never,
          status: "concluida",
          notes: notes || null,
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .select()
        .single();
      if (error) throw error;

      // 4. Itens de venda
      const { error: itemsErr } = await supabase.from("sale_items").insert(
        cart.map((c) => ({
          sale_id: sale.id,
          product_id: c.productId,
          product_name_snapshot: c.productName,
          size: c.size,
          quantity: c.quantity,
          unit_price: c.unitPrice,
          unit_cost: c.unitCost,
        })),
      );
      if (itemsErr) throw itemsErr;

      // 5. Importação (se houver código de rastreio)
      if (trackingTrim) {
        await linkOrderToImport({
          storeId: profile.store_id,
          trackingCode: trackingTrim,
          supplierName: supplierTrim || null,
          orderId: order.id,
          orderNumber: (order as { order_number?: number | null }).order_number ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Venda registrada!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["customers-search"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sora">Nova venda</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 0. DATA DA VENDA */}
          <section className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <Label>Data da venda</Label>
                <Input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant={saleDate === todayStr() ? "default" : "outline"}
                size="sm"
                onClick={() => setSaleDate(todayStr())}
              >
                Hoje
              </Button>
              <p className="text-xs text-muted-foreground">
                {saleDate === todayStr() ? "Usando data de hoje." : "Data personalizada selecionada."}
              </p>
            </div>
          </section>

          {/* 1. CLIENTE */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">1. Cliente</h3>
            <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as "cadastrado" | "novo")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="novo"><UserPlus className="mr-2 h-4 w-4" /> Cliente novo</TabsTrigger>
                <TabsTrigger value="cadastrado"><UserCheck className="mr-2 h-4 w-4" /> Cliente cadastrado</TabsTrigger>
              </TabsList>
              <TabsContent value="novo" className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Nome*</Label>
                    <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div>
                  <Label>Informações adicionais</Label>
                  <Input value={newCustomerNotes} onChange={(e) => setNewCustomerNotes(e.target.value)} placeholder="Instagram, cidade, observações..." />
                </div>
              </TabsContent>
              <TabsContent value="cadastrado" className="mt-3 space-y-2">
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {filteredCustomers.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCustomerId(c.id); setCustomerAddress(c.address ?? ""); }}
                        className={`flex w-full items-center justify-between border-b border-border p-3 text-left last:border-none hover:bg-accent ${customerId === c.id ? "bg-accent" : ""}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone ?? "sem telefone"}</p>
                        </div>
                        {customerId === c.id && <Badge>Selecionado</Badge>}
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
            <div className="mt-3">
              <Label>Endereço (opcional)</Label>
              <Textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Rua, número, complemento, bairro, cidade/UF, CEP"
                rows={2}
              />
            </div>
          </section>

          {/* 2. PRODUTOS */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">
              2. Produtos {cart.length > 0 && <span className="font-normal text-muted-foreground">({cart.length} no carrinho)</span>}
            </h3>

            <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Configurar item</p>

              <ProductCascade value={cascade} onChange={setCascade} />

              <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Personalização</Label>
                    <p className="text-xs text-muted-foreground">Nome e número estampados.</p>
                  </div>
                  <div className="flex gap-2">
                    {([["nao","Não"],["sim","Sim"]] as const).map(([k,l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          const v = k === "sim";
                          setCfgPersonalize(v);
                          if (!v) { setCfgPersonName(""); setCfgPersonNumber(""); }
                        }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${(cfgPersonalize ? "sim" : "nao") === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {cfgPersonalize && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Nome</Label>
                      <Input value={cfgPersonName} onChange={(e) => setCfgPersonName(e.target.value)} placeholder="Nome" />
                    </div>
                    <div>
                      <Label>Número</Label>
                      <Input value={cfgPersonNumber} onChange={(e) => setCfgPersonNumber(e.target.value)} placeholder="Ex.: 10" inputMode="numeric" />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>Custo aproximado do produto (R$)</Label>
                <Input type="number" step="0.01" value={cfgCostStr} onChange={(e) => setCfgCostStr(e.target.value)} placeholder="0,00" />
                <p className="mt-1 text-xs text-muted-foreground">Quanto custou para você. O valor pago pelo cliente é informado abaixo em "Dados de faturamento".</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={resetConfigurator}>Limpar</Button>
                <Button type="button" onClick={confirmAddItem}>Adicionar à venda</Button>
              </div>
            </div>

            {/* Carrinho */}
            {cart.length > 0 && (
              <div className="mt-3 rounded-md border border-border">
                <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
                  <div className="col-span-6">Produto</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-3 text-right">Custo un.</div>
                  <div className="col-span-1"></div>
                </div>
                {cart.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-border p-3 last:border-none">
                    <div className="col-span-6 min-w-0">
                      <p className="text-sm font-medium truncate">{c.productName}</p>
                      <p className="text-xs text-muted-foreground">Tamanho {c.size}</p>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={1}
                        value={c.quantity}
                        onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value));
                          setCart((prev) => prev.map((x, idx) => idx === i ? { ...x, quantity: q } : x));
                        }}
                        className="h-8 text-center"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={c.unitCost}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setCart((prev) => prev.map((x, idx) => idx === i ? { ...x, unitCost: v } : x));
                        }}
                        className="h-8 text-right tabular"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <Button variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((_, idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>


          {/* 3. LOGÍSTICA */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">3. Logística</h3>
            <Tabs value={source} onValueChange={(v) => setSource(v as SourceKey)}>
              <TabsList className="grid w-full grid-cols-3">
                {SOURCE_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="estoque" className="mt-3">
                <p className="text-xs text-muted-foreground">
                  O item será baixado automaticamente do seu estoque.
                </p>
              </TabsContent>
              <TabsContent value="fornecedor_china" className="mt-3">
                <Label>Nome do fornecedor</Label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ex.: Yupoo XYZ, Weidian ABC..."
                />
              </TabsContent>
              <TabsContent value="revendedor_br" className="mt-3">
                <Label>Nome do revendedor</Label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ex.: Loja parceira, grupo de revenda..."
                />
              </TabsContent>
            </Tabs>

            <div className="mt-3">
              <Label>Código de rastreamento</Label>
              <Input
                value={trackingCode}
                onChange={(e) => {
                  setTrackingCode(e.target.value);
                  if (e.target.value.trim()) setDeliveryMethod("");
                }}
                placeholder="Ex.: LP123456789CN"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Se informado, o código é vinculado automaticamente à página de Importações.
              </p>
            </div>

            <div className="mt-3 rounded-md border border-dashed border-border p-3">
              <Label className="mb-1.5 block">Venda sem código de rastreamento</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Selecione a forma de entrega quando não houver rastreio.
              </p>
              <Select
                value={deliveryMethod || undefined}
                onValueChange={(v) => {
                  setDeliveryMethod(v as DeliveryMethod);
                  if (v) setTrackingCode("");
                }}
                disabled={!!trackingCode.trim()}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a forma de entrega" />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4">
              <Label>Status atual do pedido*</Label>
              <Select
                value={fulfillmentStatus || undefined}
                onValueChange={(v) => setFulfillmentStatus(v as FulfillmentStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status atual" />
                </SelectTrigger>
                <SelectContent>
                  {FULFILLMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Esse status alimenta os filtros do sistema (pendente, enviado, entregue, etc.).
              </p>
            </div>
          </section>


          {/* 4. PAGAMENTO */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">4. Forma de pagamento</h3>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(paymentMethodLabel).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>


          {/* 4. FATURAMENTO */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">5. Dados de faturamento</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Valor pago pelo cliente (R$)*</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paidValueStr}
                  onChange={(e) => setPaidValueStr(e.target.value)}
                  placeholder="0,00"
                />
                <p className="mt-1 text-xs text-muted-foreground">Faturamento bruto da venda.</p>
              </div>
              <div>
                <Label>Custo total dos produtos (R$)</Label>
                <Input
                  type="text"
                  value={fmtBRL(itemsCost)}
                  readOnly
                  className="bg-muted/40"
                />
                <p className="mt-1 text-xs text-muted-foreground">Soma automática dos custos do carrinho. Vai para "Custo dos pedidos" no Financeiro.</p>
              </div>

              <div>
                <Label>Valor líquido recebido</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={netValueStr}
                  onChange={(e) => setNetValueStr(e.target.value)}
                  placeholder={fmtBRL(paidValue)}
                />
                <p className="mt-1 text-xs text-muted-foreground">Desconte aqui as taxas (cartão, gateway).</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Custo de frete (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={shippingCostStr}
                  onChange={(e) => setShippingCostStr(e.target.value)}
                  placeholder="0,00"
                />
                <p className="mt-1 text-xs text-muted-foreground">Se houver, será somado ao custo total e reduzirá o lucro.</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </section>

          {/* Resumo */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>Custo total: <span className="tabular">{fmtBRL(totalCost)}</span></span>
              <span>Líquido: <span className="tabular">{fmtBRL(netValue)}</span></span>
              <span className={profit >= 0 ? "text-[color:#16A34A]" : "text-destructive"}>
                Lucro: <span className="tabular">{fmtBRL(profit)}</span>
              </span>
              <span className="font-sora text-lg font-semibold tabular">{fmtBRL(paidValue)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || cart.length === 0 || !customerValid || !fulfillmentStatus}>
            {save.isPending ? "Salvando..." : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Sale Sheet ---------------- */

type SaleEditItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  size: SizeOpt | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  removed?: boolean;
};

type SaleRow = {
  id: string;
  source: string | null;
  supplier_name: string | null;
  tracking_code: string | null;
  delivery_method: string | null;
  fulfillment_status: string | null;
  payment_method: string;
  total_value: number | string;
  net_value: number | string | null;
  notes: string | null;
  order_id: string | null;
  store_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer: { id: string; name: string; phone: string | null; address: string | null } | null;
  items: Array<{
    id: string;
    product_id: string | null;
    product_name_snapshot: string | null;
    size: string | null;
    quantity: number;
    unit_price: number | string;
    unit_cost: number | string;
    product: { name: string; model: string | null; team: string | null; season: string | null } | null;
  }>;
  created_at?: string | null;
};

function fulfillmentToOrderStatusEdit(
  v: string,
  paidValue: number = 0,
): { status: "pendente" | "pago" | "enviado" | "entregue" | "cancelado"; fulfillment_status: string | null } {
  // Se já houve pagamento (>0), nunca marcar como "pendente".
  const aguardando: "pendente" | "pago" = paidValue > 0 ? "pago" : "pendente";
  const map: Record<string, "pendente" | "pago" | "enviado" | "entregue" | "cancelado"> = {
    aguardando_fornecedor: aguardando,
    aguardando_envio_fornecedor: "pago",
    enviado: "enviado",
    aguardando_retirada: "enviado",
    entregue: "entregue",
    cancelado: "cancelado",
  };
  const set = ["aguardando_fornecedor","aguardando_envio_fornecedor","enviado","aguardando_retirada","entregue"];
  return { status: map[v] ?? "pago", fulfillment_status: set.includes(v) ? v : null };
}

function EditSaleSheet({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const qc = useQueryClient();

  // Customer
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");

  // Items
  const [items, setItems] = useState<SaleEditItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newCascade, setNewCascade] = useState<ProductCascadeValue>(emptyCascadeValue());
  const [newQty, setNewQty] = useState(1);
  const [newPriceStr, setNewPriceStr] = useState("");
  const [newCostStr, setNewCostStr] = useState("");

  // Logistics + finance
  const [src, setSrc] = useState<SourceKey>("estoque");
  const [supplier, setSupplier] = useState("");
  const [tracking, setTracking] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<string>("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string>("aguardando_envio_fornecedor");
  const [payment, setPayment] = useState("pix");
  const [paid, setPaid] = useState("");
  const [net, setNet] = useState("");
  const [obs, setObs] = useState("");
  const [createdAt, setCreatedAt] = useState("");

  useEffect(() => {
    if (!sale) return;
    setCustName(sale.customer?.name ?? sale.customer_name_snapshot ?? "");
    setCustPhone(sale.customer?.phone ?? "");
    setCustAddress(sale.customer?.address ?? "");
    setItems(
      (sale.items ?? []).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.product?.name ?? it.product_name_snapshot ?? "Produto",
        size: (it.size as SizeOpt) ?? null,
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        unit_cost: Number(it.unit_cost),
      })),
    );
    setShowAdd(false);
    setNewCascade(emptyCascadeValue());
    setNewQty(1);
    setNewPriceStr("");
    setNewCostStr("");

    const s = (sale.source ?? "estoque") as string;
    const normalized: SourceKey =
      s === "drop" ? "fornecedor_china" :
      s === "loja_parceira" ? "revendedor_br" :
      (["estoque","fornecedor_china","revendedor_br"].includes(s) ? (s as SourceKey) : "estoque");
    setSrc(normalized);
    setSupplier(sale.supplier_name ?? "");
    setTracking(sale.tracking_code ?? "");
    setDeliveryMethod(sale.delivery_method ?? "");
    setFulfillmentStatus(sale.fulfillment_status ?? "aguardando_envio_fornecedor");
    setPayment(sale.payment_method ?? "pix");
    setPaid(String(sale.total_value ?? ""));
    setNet(sale.net_value != null ? String(sale.net_value) : "");
    setObs(sale.notes ?? "");
    setCreatedAt(sale.created_at ? String(sale.created_at).slice(0, 10) : "");
  }, [sale]);

  const visibleItems = items.filter((i) => !i.removed);
  const itemsTotal = visibleItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const itemsCost = visibleItems.reduce((s, i) => s + i.unit_cost * i.quantity, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      if (!custName.trim()) throw new Error("Nome do cliente é obrigatório");
      if (visibleItems.length === 0) throw new Error("A venda precisa ter ao menos um item");

      // 1. Cliente
      if (sale.customer?.id) {
        await supabase
          .from("customers")
          .update({
            name: custName.trim(),
            phone: custPhone.trim() || null,
            address: custAddress.trim() || null,
          } as never)
          .eq("id", sale.customer.id);
      }

      // 2. Itens
      for (const it of items) {
        if (it.removed && !it.id.startsWith("new-")) {
          await supabase.from("sale_items").delete().eq("id", it.id);
        } else if (it.id.startsWith("new-") && !it.removed) {
          await supabase.from("sale_items").insert({
            sale_id: sale.id,
            product_id: it.product_id,
            product_name_snapshot: it.product_name,
            size: it.size,
            quantity: it.quantity,
            unit_price: it.unit_price,
            unit_cost: it.unit_cost,
          } as never);
        } else if (!it.removed) {
          await supabase
            .from("sale_items")
            .update({
              product_name_snapshot: it.product_name,
              size: it.size,
              quantity: it.quantity,
              unit_price: it.unit_price,
              unit_cost: it.unit_cost,
            } as never)
            .eq("id", it.id);
        }
      }

      // 3. Venda
      const trackingTrim = tracking.trim();
      const supplierTrim = supplier.trim();
      const paidValue = Number(paid) || itemsTotal;
      const netValue = Number(net) || paidValue;
      const profit = netValue - itemsCost;
      const createdAtIso = createdAt ? new Date(`${createdAt}T12:00:00`).toISOString() : null;
      const { status: orderStatus, fulfillment_status } = fulfillmentToOrderStatusEdit(fulfillmentStatus, paidValue);

      const { error } = await supabase
        .from("sales")
        .update({
          source: src,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          delivery_method: deliveryMethod || null,
          fulfillment_status,
          payment_method: payment,
          total_value: paidValue,
          net_value: netValue,
          profit,
          notes: obs.trim() || null,
          customer_name_snapshot: custName.trim(),
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .eq("id", sale.id);
      if (error) throw error;

      // 4. Pedido vinculado
      if (sale.order_id) {
        await supabase
          .from("orders")
          .update({
            source: src,
            supplier_name: supplierTrim || null,
            tracking_code: trackingTrim || null,
            delivery_method: deliveryMethod || null,
            fulfillment_status,
            payment_method: payment,
            total_value: paidValue,
            notes: obs.trim() || null,
            status: orderStatus,
            ...(createdAtIso ? { created_at: createdAtIso } : {}),
          } as never)
          .eq("id", sale.order_id);

        if (trackingTrim) {
          const { data: ord } = await supabase
            .from("orders")
            .select("order_number")
            .eq("id", sale.order_id)
            .maybeSingle();
          await linkOrderToImport({
            storeId: sale.store_id,
            trackingCode: trackingTrim,
            supplierName: supplierTrim || null,
            orderId: sale.order_id,
            orderNumber: ord?.order_number ?? null,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Venda atualizada");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["fin-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-orders"] });
      qc.invalidateQueries({ queryKey: ["customers-search"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  function addNewItem() {
    if (!newCascade.team || !newCascade.productType || !newCascade.model || !newCascade.size) {
      toast.error("Preencha time, tipo, modelo e tamanho");
      return;
    }
    const price = Number(newPriceStr) || 0;
    if (price <= 0) { toast.error("Informe o preço unitário"); return; }
    const cost = Number(newCostStr) || 0;
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
        unit_cost: cost,
      },
    ]);
    setNewCascade(emptyCascadeValue());
    setNewQty(1);
    setNewPriceStr("");
    setNewCostStr("");
    setShowAdd(false);
  }

  const open = !!sale;
  if (!sale) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-sora">Editar venda</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Cliente */}
          <section className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Cliente</h4>
            <div>
              <Label>Nome*</Label>
              <Input value={custName} onChange={(e) => setCustName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} maxLength={40} />
            </div>
            <div>
              <Label>Endereço</Label>
              <Textarea value={custAddress} onChange={(e) => setCustAddress(e.target.value)} rows={2} maxLength={500} />
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
                    <div className="grid grid-cols-4 gap-2">
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
                      <div>
                        <Label className="text-xs">Custo un.</Label>
                        <Input
                          type="number" step="0.01"
                          value={it.unit_cost}
                          onChange={(e) => setItems((p) => p.map((x, i) => i === realIdx ? { ...x, unit_cost: Number(e.target.value) || 0 } : x))}
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
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">Custo un.</Label>
                    <Input type="number" step="0.01" value={newCostStr} onChange={(e) => setNewCostStr(e.target.value)} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">Preço un.*</Label>
                    <Input type="number" step="0.01" value={newPriceStr} onChange={(e) => setNewPriceStr(e.target.value)} className="h-8" />
                  </div>
                </div>
                <Button size="sm" onClick={addNewItem} className="w-full">Adicionar à venda</Button>
              </div>
            )}
          </section>

          {/* Logística */}
          <section className="space-y-3 rounded-md border border-border p-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Logística</h4>
            <div>
              <Label className="mb-1.5 block">Origem</Label>
              <Tabs value={src} onValueChange={(v) => setSrc(v as SourceKey)}>
                <TabsList className="grid w-full grid-cols-3">
                  {SOURCE_TABS.map((t) => (
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
              <Label>Código de rastreamento</Label>
              <Input
                value={tracking}
                onChange={(e) => { setTracking(e.target.value); if (e.target.value.trim()) setDeliveryMethod(""); }}
                placeholder="Ex.: LP123456789CN"
                maxLength={120}
              />
            </div>
            <div>
              <Label>Forma de entrega (sem rastreio)</Label>
              <Select value={deliveryMethod || undefined} onValueChange={(v) => { setDeliveryMethod(v); if (v) setTracking(""); }} disabled={!!tracking.trim()}>
                <SelectTrigger><SelectValue placeholder="Selecione a forma de entrega" /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Status */}
          <section>
            <Label>Status atual do pedido <span className="text-[color:#DC2626]">*</span></Label>
            <Select value={fulfillmentStatus} onValueChange={setFulfillmentStatus}>
              <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
              <SelectContent>
                {FULFILLMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Pagamento */}
          <section className="space-y-2 rounded-md border border-border p-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Pagamento</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Valor pago</Label>
                <Input type="number" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={fmtBRL(itemsTotal)} />
              </div>
              <div>
                <Label>Líquido</Label>
                <Input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(paymentMethodLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Soma dos itens: <span className="tabular">{fmtBRL(itemsTotal)}</span> · Custo: <span className="tabular">{fmtBRL(itemsCost)}</span>
            </p>
          </section>

          <section>
            <Label>Data da compra</Label>
            <Input type="date" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
          </section>

          <section>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={1000} />
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

