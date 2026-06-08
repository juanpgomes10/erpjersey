import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Receipt, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDateTime, paymentMethodLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfile } from "@/hooks/use-profile";

type SizeOpt = "P" | "M" | "G" | "GG" | "XGG";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — ERPJersey" }] }),
  component: VendasPage,
});

function VendasPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, customer:customers(name), items:sale_items(quantity, product:products(name))")
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
                    <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Lucro</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const items = s.items as Array<{ quantity: number; product: { name: string } | null }>;
                    const customer = (s.customer as { name: string } | null)?.name ?? s.customer_name_snapshot ?? "—";
                    return (
                      <tr key={s.id} className="border-b border-border last:border-none hover:bg-accent/40">
                        <td className="px-3 py-3 text-muted-foreground">{fmtDateTime(s.created_at)}</td>
                        <td className="px-3 py-3 font-medium">{customer}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0} item(ns)
                        </td>
                        <td className="px-3 py-3">{paymentMethodLabel[s.payment_method] ?? s.payment_method}</td>
                        <td className="px-3 py-3 text-right tabular font-medium">{fmtBRL(Number(s.total_value))}</td>
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
  productId: string;
  productName: string;
  size: SizeOpt;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

function NewSaleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("pix");
  const [notes, setNotes] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-search"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sale_price, cost_price, product_sizes(size, quantity)")
        .limit(200);
      return data ?? [];
    },
    enabled: open,
  });

  const filteredProducts = (products ?? []).filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const profit = cart.reduce((s, i) => s + (i.unitPrice - i.unitCost) * i.quantity, 0);

  function addItem(p: NonNullable<typeof products>[number], size: SizeOpt) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id && c.size === size);
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        productId: p.id,
        productName: p.name,
        size,
        quantity: 1,
        unitPrice: Number(p.sale_price),
        unitCost: Number(p.cost_price),
      }];
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error("Sem loja vinculada");
      if (cart.length === 0) throw new Error("Adicione ao menos um produto");

      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          store_id: profile.store_id,
          customer_name_snapshot: customerName || null,
          user_id: profile.id,
          total_value: total,
          profit,
          payment_method: paymentMethod as never,
          status: "concluida",
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;

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
    },
    onSuccess: () => {
      toast.success("Venda registrada!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setCart([]);
      setCustomerName("");
      setNotes("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-sora">Nova venda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Produtos */}
          <div>
            <Label className="mb-2 block">Adicionar produto</Label>
            <Input
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border">
                {filteredProducts.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                ) : (
                  filteredProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-border p-3 last:border-none">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtBRL(Number(p.sale_price))}</p>
                      </div>
                      <div className="flex gap-1">
                        {(["P", "M", "G", "GG", "XGG"] as SizeOpt[]).map((sz) => {
                          const stock = p.product_sizes?.find((s) => s.size === sz)?.quantity ?? 0;
                          return (
                            <button
                              key={sz}
                              onClick={() => addItem(p, sz)}
                              disabled={stock === 0}
                              className="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-30"
                              title={`${stock} em estoque`}
                            >
                              {sz}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Carrinho */}
          {cart.length > 0 && (
            <div className="rounded-md border border-border">
              {cart.map((c, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border p-3 last:border-none">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.productName}</p>
                    <p className="text-xs text-muted-foreground">Tamanho {c.size} · {fmtBRL(c.unitPrice)}</p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={c.quantity}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value));
                      setCart((prev) => prev.map((x, idx) => idx === i ? { ...x, quantity: q } : x));
                    }}
                    className="w-16"
                  />
                  <span className="tabular text-sm font-medium w-24 text-right">{fmtBRL(c.unitPrice * c.quantity)}</span>
                  <Button variant="ghost" size="icon" onClick={() => setCart((p) => p.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Cliente + pagamento */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cust">Cliente</Label>
              <Input id="cust" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
            </div>
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
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="text-sm text-muted-foreground">
              Lucro estimado: <span className="text-[color:#16A34A] tabular">{fmtBRL(profit)}</span>
            </div>
            <div className="font-sora text-xl font-semibold tabular">{fmtBRL(total)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || cart.length === 0}>
            {save.isPending ? "Salvando..." : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
