import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Receipt, X, UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectCarrier } from "@/lib/carrier";
import { fmtBRL, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { ProductCascade, emptyCascadeValue, type ProductCascadeValue } from "@/components/product/product-cascade";
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
function fulfillmentToOrderStatus(f: FulfillmentStatus): "pendente" | "pago" | "enviado" | "entregue" {
  switch (f) {
    case "aguardando_fornecedor": return "pendente";
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
        .select("*, customer:customers(name), items:sale_items(quantity, product:products(name, model, team, season))")
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
                        onClick={() => setEditId(s.id)}
                        className="cursor-pointer border-b border-border last:border-none hover:bg-accent/40"
                      >
                        <td className="px-3 py-3 text-muted-foreground">{fmtDateTime(s.created_at)}</td>
                        <td className="px-3 py-3 font-medium">{customer}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0} item(ns)
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{sourceLabel(sourceVal)}</td>
                        <td className="px-3 py-3">{paymentMethodLabel[s.payment_method] ?? s.payment_method}</td>
                        <td className="px-3 py-3 text-right tabular font-medium">{fmtBRL(Number(s.total_value))}</td>
                        <td className="px-3 py-3 text-right tabular">{fmtBRL(netValue)}</td>
                        <td className="px-3 py-3 text-right tabular text-[color:#16A34A]">{fmtBRL(Number(s.profit))}</td>
                        <td className="px-3 py-3">
                          <Badge variant={s.status === "concluida" ? "default" : "secondary"}>
                            {s.status === "concluida" ? "Concluída" : "Cancelada"}
                          </Badge>
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
  const [cfgPriceStr, setCfgPriceStr] = useState("");
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
    setCfgPriceStr("");
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
    const price = Number(cfgPriceStr) || 0;
    const cost = Number(cfgCostStr) || 0;
    if (price <= 0) { toast.error("Informe o valor pago pelo cliente"); return; }

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
        unitPrice: price,
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
      const orderStatus = fulfillmentToOrderStatus(fulfillmentStatus as FulfillmentStatus);

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

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Custo aproximado (R$)</Label>
                  <Input type="number" step="0.01" value={cfgCostStr} onChange={(e) => setCfgCostStr(e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Valor pago pelo cliente (R$)*</Label>
                  <Input type="number" step="0.01" value={cfgPriceStr} onChange={(e) => setCfgPriceStr(e.target.value)} placeholder="0,00" />
                </div>
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
                  <div className="col-span-5">Produto</div>
                  <div className="col-span-1 text-center">Qtd</div>
                  <div className="col-span-2 text-right">Preço un.</div>
                  <div className="col-span-2 text-right">Custo un.</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>
                {cart.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 border-b border-border p-3 last:border-none">
                    <div className="col-span-5 min-w-0">
                      <p className="text-sm font-medium truncate">{c.productName}</p>
                      <p className="text-xs text-muted-foreground">Tamanho {c.size}</p>
                    </div>
                    <div className="col-span-1">
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
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={c.unitPrice}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setCart((prev) => prev.map((x, idx) => idx === i ? { ...x, unitPrice: v } : x));
                        }}
                        className="h-8 text-right tabular"
                      />
                    </div>
                    <div className="col-span-2">
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
                    <div className="col-span-1 text-right tabular text-sm font-medium">{fmtBRL(c.unitPrice * c.quantity)}</div>
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


          {/* 3. FORNECEDOR / ORIGEM */}
          <section>
            <h3 className="font-sora text-sm font-semibold mb-2">3. Fornecedor</h3>
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
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder="Ex.: LP123456789CN"
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Você pode preencher isso depois. Vendas sem código de rastreamento vão para{" "}
              <span className="font-medium">Pedidos Pendentes</span>. Se informado, o código é
              vinculado automaticamente à página de Importações.
            </p>
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
                <Label>Valor pago pelo cliente</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paidValueStr}
                  onChange={(e) => setPaidValueStr(e.target.value)}
                  placeholder={fmtBRL(totalCalc)}
                />
                <p className="mt-1 text-xs text-muted-foreground">Soma do carrinho: <span className="tabular">{fmtBRL(totalCalc)}</span></p>
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
          <Button onClick={() => save.mutate()} disabled={save.isPending || cart.length === 0 || !customerValid}>
            {save.isPending ? "Salvando..." : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Sale Sheet ---------------- */

type SaleRow = {
  id: string;
  source: string | null;
  supplier_name: string | null;
  tracking_code: string | null;
  payment_method: string;
  total_value: number | string;
  net_value: number | string | null;
  notes: string | null;
  order_id: string | null;
  store_id: string;
  customer_name_snapshot: string | null;
  customer: { name: string } | null;
  created_at?: string | null;
};

function EditSaleSheet({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [src, setSrc] = useState<SourceKey>("estoque");
  const [supplier, setSupplier] = useState("");
  const [tracking, setTracking] = useState("");
  const [payment, setPayment] = useState("pix");
  const [paid, setPaid] = useState("");
  const [net, setNet] = useState("");
  const [obs, setObs] = useState("");
  const [createdAt, setCreatedAt] = useState("");

  useEffect(() => {
    if (!sale) return;
    const s = (sale.source ?? "estoque") as string;
    const normalized: SourceKey =
      s === "drop" ? "fornecedor_china" :
      s === "loja_parceira" ? "revendedor_br" :
      (s as SourceKey);
    setSrc(normalized);
    setSupplier(sale.supplier_name ?? "");
    setTracking(sale.tracking_code ?? "");
    setPayment(sale.payment_method ?? "pix");
    setPaid(String(sale.total_value ?? ""));
    setNet(sale.net_value != null ? String(sale.net_value) : "");
    setObs(sale.notes ?? "");
    setCreatedAt(sale.created_at ? String(sale.created_at).slice(0, 10) : "");
  }, [sale]);

  const save = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      const trackingTrim = tracking.trim();
      const supplierTrim = supplier.trim();
      const paidValue = Number(paid) || 0;
      const netValue = Number(net) || paidValue;

      const createdAtIso = createdAt
        ? new Date(`${createdAt}T12:00:00`).toISOString()
        : null;

      const { error } = await supabase
        .from("sales")
        .update({
          source: src,
          supplier_name: supplierTrim || null,
          tracking_code: trackingTrim || null,
          payment_method: payment,
          total_value: paidValue,
          net_value: netValue,
          notes: obs || null,
          ...(createdAtIso ? { created_at: createdAtIso } : {}),
        } as never)
        .eq("id", sale.id);
      if (error) throw error;

      // Propaga para o pedido vinculado
      if (sale.order_id) {
        const orderStatus: "pago" | "pendente" | "enviado" =
          trackingTrim ? "enviado" : src === "estoque" ? "pago" : "pendente";
        await supabase
          .from("orders")
          .update({
            source: src,
            supplier_name: supplierTrim || null,
            tracking_code: trackingTrim || null,
            payment_method: payment,
            total_value: paidValue,
            notes: obs || null,
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
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const open = !!sale;
  if (!sale) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

  const customerName = sale.customer?.name ?? sale.customer_name_snapshot ?? "—";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-sora">Editar venda</SheetTitle>
          <p className="text-xs text-muted-foreground">{customerName}</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <section>
            <Label className="mb-1.5 block">Fornecedor</Label>
            <Tabs value={src} onValueChange={(v) => setSrc(v as SourceKey)}>
              <TabsList className="grid w-full grid-cols-3">
                {SOURCE_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {src !== "estoque" && (
              <div className="mt-3">
                <Label>Nome do {src === "fornecedor_china" ? "fornecedor" : "revendedor"}</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
            )}
          </section>

          <section>
            <Label>Código de rastreamento</Label>
            <Input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Ex.: LP123456789CN"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Ao preencher, o código é vinculado à página de Importações e o pedido sai de Pendentes.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor pago</Label>
              <Input type="number" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
            <div>
              <Label>Líquido</Label>
              <Input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} />
            </div>
          </section>

          <section>
            <Label>Forma de pagamento</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(paymentMethodLabel).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section>
            <Label>Data da compra</Label>
            <Input type="date" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Ajuste a data caso a venda tenha sido feita em outro dia.
            </p>
          </section>

          <section>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
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

