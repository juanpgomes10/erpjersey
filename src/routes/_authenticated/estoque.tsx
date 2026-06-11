import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Package, Pencil, Trash2, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/format";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

const SIZES = ["P", "M", "G", "GG", "XGG"] as const;
type Size = (typeof SIZES)[number];

export const MODEL_OPTIONS = [
  { value: "1", label: "Camisa 1 (Home / Titular)" },
  { value: "2", label: "Camisa 2 (Away / Reserva)" },
  { value: "3", label: "Camisa 3 (Third)" },
  { value: "4", label: "Camisa 4" },
  { value: "edicao_especial", label: "Edição especial" },
] as const;

export const CATEGORY_OPTIONS = [
  { value: "brasileiros", label: "Times brasileiros" },
  { value: "internacionais", label: "Times internacionais" },
  { value: "retro", label: "Camisas retrô" },
  { value: "selecoes", label: "Seleções" },
  { value: "nba", label: "NBA" },
  { value: "agasalhos", label: "Agasalhos" },
  { value: "outros", label: "Outros" },
] as const;

export const GENDER_OPTIONS = [
  { value: "masculina", label: "Masculina" },
  { value: "feminina", label: "Feminina" },
  { value: "infantil", label: "Infantil" },
] as const;

export const modelShortLabel = (m: string | null | undefined) => {
  if (!m) return "";
  const f = MODEL_OPTIONS.find((o) => o.value === m);
  return f ? (m === "edicao_especial" ? "Edição especial" : `Camisa ${m}`) : m;
};

const categoryLabel = (c: string | null | undefined) =>
  CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? null;

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({ meta: [{ title: "Estoque — ERPJersey" }] }),
  component: EstoquePage,
});

type ProductRow = {
  id: string;
  name: string;
  team: string | null;
  season: string | null;
  model: string | null;
  category: string | null;
  gender: string | null;
  supplier: string | null;
  cost_price: number;
  sale_price: number;
  image_url: string | null;
  min_stock?: number;
  notes: string | null;
  created_at: string;
  product_sizes: Array<{ size: Size; quantity: number }>;
};

function EstoquePage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fCategory, setFCategory] = useState<string>("all");
  const [fGender, setFGender] = useState<string>("all");
  const [fSize, setFSize] = useState<string>("all");
  const [fTeam, setFTeam] = useState("");
  const [sort, setSort] = useState<"recent" | "old" | "name">("recent");
  const qc = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_sizes(size, quantity)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const filtered = useMemo(() => {
    const list = (products ?? []).filter((p) => {
      // Only show products that the user actually has in stock
      const total = p.product_sizes.reduce((s, x) => s + x.quantity, 0);
      if (total <= 0) return false;

      if (search) {
        const q = search.toLowerCase();
        const hit =
          p.name.toLowerCase().includes(q) ||
          (p.team ?? "").toLowerCase().includes(q) ||
          (p.supplier ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (fCategory !== "all" && p.category !== fCategory) return false;
      if (fGender !== "all" && p.gender !== fGender) return false;
      if (fTeam && !(p.team ?? "").toLowerCase().includes(fTeam.toLowerCase())) return false;
      if (fSize !== "all") {
        const sz = p.product_sizes.find((s) => s.size === fSize);
        if (!sz || sz.quantity <= 0) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sort === "recent" ? db - da : da - db;
    });
    return list;
  }, [products, search, fCategory, fGender, fSize, fTeam, sort]);

  const activeFilterCount =
    (fCategory !== "all" ? 1 : 0) +
    (fGender !== "all" ? 1 : 0) +
    (fSize !== "all" ? 1 : 0) +
    (fTeam ? 1 : 0);

  function clearFilters() {
    setFCategory("all");
    setFGender("all");
    setFSize("all");
    setFTeam("");
  }

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto excluído");
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function handleDelete(p: ProductRow) {
    if (confirm(`Excluir "${p.name}"?`)) del.mutate(p.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Adicione camisas conforme forem entrando na loja
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Novo produto
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, time ou fornecedor..."
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters((v) => !v)}
              className="shrink-0"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="ml-2 h-5 px-1.5">{activeFilterCount}</Badge>
              )}
            </Button>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-[170px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="old">Mais antigos</SelectItem>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFilters && (
            <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Gênero</Label>
                <Select value={fGender} onValueChange={setFGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {GENDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tamanho</Label>
                <Select value={fSize} onValueChange={setFSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {SIZES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Input
                  value={fTeam}
                  onChange={(e) => setFTeam(e.target.value)}
                  placeholder="Ex: Flamengo"
                />
              </div>
              {activeFilterCount > 0 && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="mr-1 h-3 w-3" /> Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-sora text-lg font-semibold">
                {(products ?? []).some((p) => p.product_sizes.reduce((s, x) => s + x.quantity, 0) > 0)
                  ? "Nenhum produto corresponde aos filtros"
                  : "Seu estoque está vazio"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Clique em "Novo produto" para adicionar a primeira camisa.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => {
                return (

                  <div key={p.id} className="group rounded-lg border border-border bg-[color:var(--card)] p-4 transition-colors hover:border-[color:#2563EB]">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[color:#1E293B] overflow-hidden">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[modelShortLabel(p.model), p.team, p.season].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {categoryLabel(p.category) && (
                            <Badge variant="secondary" className="text-[10px]">
                              {categoryLabel(p.category)}
                            </Badge>
                          )}
                          {p.gender && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {p.gender}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {SIZES.map((sz) => {
                        const qty = p.product_sizes.find((s) => s.size === sz)?.quantity ?? 0;
                        return (
                          <div
                            key={sz}
                            className={`flex flex-col items-center rounded border border-border px-2 py-1 text-[10px] ${qty === 0 ? "opacity-40" : ""}`}
                          >
                            <span className="font-medium">{sz}</span>
                            <span className="tabular">{qty}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-sora text-sm font-semibold tabular">{fmtBRL(p.sale_price)}</span>
                    </div>


                    <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditing(p); setOpen(true); }}>
                        <Pencil className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ProductDialog open={open} onOpenChange={setOpen} product={editing} />
    </div>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: ProductRow | null;
}) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [name, setName] = useState(product?.name ?? "");
  const [team, setTeam] = useState(product?.team ?? "");
  const [season, setSeason] = useState(product?.season ?? "");
  const [model, setModel] = useState<string>(product?.model ?? "1");
  const [category, setCategory] = useState<string>(product?.category ?? "brasileiros");
  const [gender, setGender] = useState<string>(product?.gender ?? "masculina");
  const [supplier, setSupplier] = useState(product?.supplier ?? "");
  const [costPrice, setCostPrice] = useState(String(product?.cost_price ?? ""));
  const [salePrice, setSalePrice] = useState(String(product?.sale_price ?? ""));
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [minStock, setMinStock] = useState(String(product?.min_stock ?? "5"));
  const [sizes, setSizes] = useState<Record<Size, string>>(() => {
    const init: Record<Size, string> = { P: "0", M: "0", G: "0", GG: "0", XGG: "0" };
    product?.product_sizes.forEach((s) => { init[s.size] = String(s.quantity); });
    return init;
  });

  // reset when reopening
  if (open && product && product.id !== (window as unknown as { _lastP?: string })._lastP) {
    (window as unknown as { _lastP?: string })._lastP = product.id;
    setName(product.name); setTeam(product.team ?? ""); setSeason(product.season ?? "");
    setModel(product.model ?? "1");
    setCategory(product.category ?? "brasileiros");
    setGender(product.gender ?? "masculina");
    setSupplier(product.supplier ?? ""); setCostPrice(String(product.cost_price));
    setSalePrice(String(product.sale_price)); setImageUrl(product.image_url ?? "");
    setMinStock(String(product.min_stock));
    const init: Record<Size, string> = { P: "0", M: "0", G: "0", GG: "0", XGG: "0" };
    product.product_sizes.forEach((s) => { init[s.size] = String(s.quantity); });
    setSizes(init);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error("Sem loja");
      if (!name.trim()) throw new Error("Nome é obrigatório");

      const payload = {
        store_id: profile.store_id,
        name: name.trim(),
        team: team.trim() || null,
        season: season.trim() || null,
        model: model || null,
        category: category || null,
        gender: gender || null,
        supplier: supplier.trim() || null,
        cost_price: Number(costPrice) || 0,
        sale_price: Number(salePrice) || 0,
        image_url: imageUrl.trim() || null,
        min_stock: Number(minStock) || 0,
      };

      let productId: string;
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
        productId = product.id;
        await supabase.from("product_sizes").delete().eq("product_id", productId);
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        productId = data.id;
      }

      const sizeRows = SIZES
        .map((sz) => ({ product_id: productId, size: sz, quantity: Number(sizes[sz]) || 0 }))
        .filter((r) => r.quantity > 0);
      if (sizeRows.length > 0) {
        const { error } = await supabase.from("product_sizes").insert(sizeRows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(product ? "Produto atualizado!" : "Produto cadastrado!");
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sora">{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="pname">Nome*</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Camisa Flamengo 2024 Home" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Time</Label>
              <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Ex: Flamengo" />
            </div>
            <div>
              <Label>Temporada</Label>
              <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Ex: 2024/25" />
            </div>
            <div>
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gênero</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex: Fornecedor X" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Custo*</Label>
              <Input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div>
              <Label>Venda*</Label>
              <Input type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>URL da imagem</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <Label>Estoque por tamanho</Label>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {SIZES.map((sz) => (
                <div key={sz} className="rounded-md border border-border p-2 text-center">
                  <div className="text-xs font-medium text-muted-foreground">{sz}</div>
                  <Input
                    type="number"
                    min={0}
                    value={sizes[sz]}
                    onChange={(e) => setSizes((p) => ({ ...p, [sz]: e.target.value }))}
                    className="mt-1 h-8 text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : product ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
