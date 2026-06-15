import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Receipt, X, UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { detectCarrier } from "@/lib/carrier";
import { fmtBRL, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { modelShortLabel } from "./estoque";
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

type SizeOpt = "P" | "M" | "G" | "GG" | "XGG";
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
      <EditSaleSheet sale={editing} onClose={() => setEditId(null)} />
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
  const [productSearch, setProductSearch] = useState("");

  // Configurador do item (após selecionar produto)
  type ProductLite = {
    id: string;
    name: string;
    team: string | null;
    season: string | null;
    model?: string | null;
    sale_price: number | string;
    cost_price: number | string;
    product_sizes?: Array<{ size: string; quantity: number }>;
  };
  const [selectedProduct, setSelectedProduct] = useState<ProductLite | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualTeam, setManualTeam] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualSeason, setManualSeason] = useState("");
  const [cfgSize, setCfgSize] = useState<SizeOpt | null>(null);
  const [cfgGender, setCfgGender] = useState<"masculina" | "feminina" | "infantil">("masculina");
  const [cfgCostStr, setCfgCostStr] = useState("");
  const [cfgPriceStr, setCfgPriceStr] = useState("");

  // Cliente
  const [customerMode, setCustomerMode] = useState<"cadastrado" | "novo">("cadastrado");
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

  // Ref para focar busca de produto ao "adicionar mais"
  const productSearchRef = useRef<HTMLInputElement>(null);

  function resetConfigurator() {
    setSelectedProduct(null);
    setManualMode(false);
    setManualName("");
    setManualTeam("");
    setManualModel("");
    setManualSeason("");
    setCfgSize(null);
    setCfgGender("masculina");
    setCfgCostStr("");
    setCfgPriceStr("");
  }

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setCart([]);
      setProductSearch("");
      resetConfigurator();
      setCustomerMode("cadastrado");
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
      setPaidValueStr("");
      setNetValueStr("");
      setShippingCostStr("");
      setNotes("");
      setSaleDate(todayStr());
    }
  }, [open]);


  const { data: products } = useQuery({
    queryKey: ["products-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, model, team, season, sale_price, cost_price, product_sizes(size, quantity)")
        .limit(300);
      return data ?? [];
    },
    enabled: open,
  });

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

  const filteredProducts = (products ?? []).filter((p) => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    const m = ((p as { model?: string | null }).model ?? "").toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.team ?? "").toLowerCase().includes(q) ||
      (p.season ?? "").toLowerCase().includes(q) ||
      m.includes(q)
    );
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

  // Reflete o total automaticamente até o usuário editar
  useEffect(() => {
    if (paidValueStr === "") return;
    // se usuário ainda não tocou, nada a fazer
  }, [paidValueStr]);

  const productLabel = (p: { name: string; team: string | null; season: string | null; model?: string | null }) =>
    [modelShortLabel(p.model ?? null), p.team, p.season].filter(Boolean).join(" · ") || p.name;

  function selectProduct(p: NonNullable<typeof products>[number]) {
    const pp = p as typeof p & { model?: string | null };
    setSelectedProduct({
      id: p.id,
      name: p.name,
      team: p.team,
      season: p.season,
      model: pp.model ?? null,
      sale_price: p.sale_price,
      cost_price: p.cost_price,
      product_sizes: p.product_sizes,
    });
    setManualMode(false);
    setCfgSize(null);
    setCfgGender("masculina");
    setCfgCostStr(Number(p.cost_price) > 0 ? String(p.cost_price) : "");
    setCfgPriceStr(Number(p.sale_price) > 0 ? String(p.sale_price) : "");
  }

  function confirmAddItem() {
    if (!cfgSize) {
      toast.error("Selecione o tamanho");
      return;
    }
    const price = Number(cfgPriceStr) || 0;
    const cost = Number(cfgCostStr) || 0;
    if (price <= 0) {
      toast.error("Informe o valor pago pelo cliente");
      return;
    }

    let productId: string | null = null;
    let baseLabel = "";
    const stockBySize: Record<string, number> = {};

    if (manualMode) {
      const nameParts = [
        manualName.trim() || "Camisa avulsa",
        manualTeam.trim(),
        manualModel.trim() ? modelShortLabel(manualModel.trim()) : "",
        manualSeason.trim(),
      ].filter(Boolean);
      baseLabel = nameParts.join(" · ");
    } else if (selectedProduct) {
      productId = selectedProduct.id;
      const pp = selectedProduct;
      baseLabel = `${pp.name}${pp.team ? ` — ${pp.team}` : ""}${pp.model ? ` · ${modelShortLabel(pp.model)}` : ""}${pp.season ? ` · ${pp.season}` : ""}`;
      pp.product_sizes?.forEach((s) => { stockBySize[s.size] = s.quantity; });
    } else {
      return;
    }

    const genderLabel = cfgGender === "masculina" ? "Masc." : cfgGender === "feminina" ? "Fem." : "Infantil";
    const fullLabel = `${baseLabel} · ${genderLabel}`;

    setCart((prev) => [
      ...prev,
      {
        productId,
        productName: fullLabel,
        size: cfgSize,
        gender: cfgGender,
        quantity: 1,
        unitPrice: price,
        unitCost: cost,
        stockBySize,
      },
    ]);

    resetConfigurator();
    setProductSearch("");
    setTimeout(() => productSearchRef.current?.focus(), 0);
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
      const orderStatus: "pago" | "pendente" =
        source === "estoque" || trackingTrim ? "pago" : "pendente";

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
                <TabsTrigger value="cadastrado"><UserCheck className="mr-2 h-4 w-4" /> Cliente cadastrado</TabsTrigger>
                <TabsTrigger value="novo"><UserPlus className="mr-2 h-4 w-4" /> Cliente novo</TabsTrigger>
              </TabsList>
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
            <Input
              ref={productSearchRef}
              placeholder="Buscar por time, modelo (1/2/3) ou temporada..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch && !selectedProduct && !manualMode && (
              <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border">
                {filteredProducts.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                ) : (
                  filteredProducts.map((p) => {
                    const pp = p as typeof p & { model?: string | null };
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className="flex w-full items-center justify-between gap-3 border-b border-border p-3 text-left last:border-none hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{productLabel(pp)}</p>
                          <p className="text-xs text-muted-foreground">{fmtBRL(Number(p.sale_price))}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">Selecionar →</span>
                      </button>
                    );
                  })
                )}
                <button
                  type="button"
                  onClick={() => { setManualMode(true); setSelectedProduct(null); setCfgSize(null); setCfgGender("masculina"); setCfgCostStr(""); setCfgPriceStr(""); }}
                  className="flex w-full items-center gap-2 border-t border-border bg-muted/40 p-3 text-left text-sm font-medium hover:bg-accent"
                >
                  <Plus className="h-4 w-4" /> Não encontrou? Criar novo produto
                </button>
              </div>
            )}

            {/* Configurador */}
            {(selectedProduct || manualMode) && (
              <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Configurar item</p>
                    <p className="text-sm font-medium truncate">
                      {manualMode ? "Novo produto avulso" : productLabel(selectedProduct!)}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={resetConfigurator}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {manualMode && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Nome / descrição*</Label>
                      <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ex.: Camisa retrô" />
                    </div>
                    <div>
                      <Label>Time</Label>
                      <Input value={manualTeam} onChange={(e) => setManualTeam(e.target.value)} placeholder="Ex.: Flamengo" />
                    </div>
                    <div>
                      <Label>Modelo</Label>
                      <Input value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="1, 2, 3 ou edição especial" />
                    </div>
                    <div>
                      <Label>Temporada</Label>
                      <Input value={manualSeason} onChange={(e) => setManualSeason(e.target.value)} placeholder="2024/2025" />
                    </div>
                  </div>
                )}

                <div>
                  <Label className="mb-1.5 block">Tamanho*</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["P", "M", "G", "GG", "XGG"] as SizeOpt[]).map((sz) => {
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setCfgSize(sz)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${cfgSize === sz ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                        >
                          {sz}
                        </button>
                      );
                    })}

                  </div>
                </div>

                <div>
                  <Label className="mb-1.5 block">Gênero*</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["masculina", "feminina", "infantil"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setCfgGender(g)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition ${cfgGender === g ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Custo aproximado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cfgCostStr}
                      onChange={(e) => setCfgCostStr(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label>Valor pago pelo cliente (R$)*</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cfgPriceStr}
                      onChange={(e) => setCfgPriceStr(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={resetConfigurator}>Cancelar</Button>
                  <Button type="button" onClick={confirmAddItem}>Adicionar à venda</Button>
                </div>
              </div>
            )}

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

            {cart.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full border-dashed"
                onClick={() => {
                  setProductSearch("");
                  setTimeout(() => productSearchRef.current?.focus(), 0);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar outro produto
              </Button>
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
