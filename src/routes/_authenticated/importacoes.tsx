import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshTracking } from "@/lib/tracking.functions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/importacoes")({
  component: ImportacoesPage,
});

type ImportRow = {
  id: string;
  tracking_code: string | null;
  supplier: string | null;
  carrier: string | null;
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
  notes: string | null;
  photos: string[];
  order_numbers: number[];
  tracking_events: Array<{
    time: string;
    description: string;
    location?: string;
    stage?: string;
  }>;
  last_tracking_update: string | null;
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
  aguardando_taxa: { label: "Aguardando taxa", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  barrado_alfandega: { label: "Barrado na alfândega", color: "#EF4444", bg: "rgba(239,68,68,0.15)" },
  saiu_entrega: { label: "Saiu para entrega", color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  entregue: { label: "Entregue", color: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  cancelado: { label: "Cancelado", color: "#64748B", bg: "rgba(100,116,139,0.15)" },
};

const TABS: Array<{ key: string; label: string; statuses: ImportRow["status"][]; icon: typeof Package }> = [
  { key: "andamento", label: "Em andamento", icon: Truck, statuses: ["comprado", "enviado", "em_transito", "chegou_brasil", "saiu_entrega"] },
  { key: "taxa", label: "Aguardando taxa", icon: DollarSign, statuses: ["aguardando_taxa"] },
  { key: "barrado", label: "Barrado", icon: Ban, statuses: ["barrado_alfandega"] },
  { key: "entregue", label: "Entregues", icon: CheckCircle2, statuses: ["entregue"] },
  { key: "todas", label: "Todas", icon: Package, statuses: [] },
];

function ImportacoesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("andamento");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: imports = [], isLoading } = useQuery({
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
  const refreshMut = useMutation({
    mutationFn: (importId: string) => refreshFn({ data: { importId } }),
    onSuccess: () => {
      toast.success("Rastreamento atualizado");
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-semibold">Importações</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe todas as encomendas (China, Correios e outros) em um só lugar.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Nova importação
        </Button>
      </div>

      {/* KPIs por status */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TABS.filter((t) => t.key !== "todas").map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.key} className="border-border/60">
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md"
                  style={{ backgroundColor: "rgba(37,99,235,0.12)" }}
                >
                  <Icon className="h-5 w-5 text-[#2563EB]" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                  <div className="text-xl font-semibold tabular">{counts[t.key]}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular">
                {counts[t.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
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
  return (
    <Card className="border-border/60 transition-colors hover:border-border">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{imp.supplier ?? "Fornecedor não informado"}</span>
              <Badge
                style={{ backgroundColor: meta.bg, color: meta.color, borderColor: "transparent" }}
              >
                {meta.label}
              </Badge>
              {imp.status === "barrado_alfandega" && (
                <AlertTriangle className="h-4 w-4 text-[#EF4444]" />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular">📦 {imp.tracking_code ?? "—"}</span>
              {imp.order_numbers.length > 0 && (
                <span>
                  Pedidos: {imp.order_numbers.map((n) => `#${String(n).padStart(4, "0")}`).join(", ")}
                </span>
              )}
              {imp.photos.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> {imp.photos.length}
                </span>
              )}
              {imp.last_tracking_update && (
                <span>Atualizado em {fmtDateTime(imp.last_tracking_update)}</span>
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
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} title="Remover">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useMemo(() => {
    if (!importRow || importRow.photos.length === 0) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const path of importRow.photos) {
        const { data } = await supabase.storage.from("import-photos").createSignedUrl(path, 3600);
        if (data?.signedUrl) map[path] = data.signedUrl;
      }
      setSignedUrls(map);
    })();
  }, [importRow?.id, importRow?.photos.length]);

  if (!importRow) return null;
  const meta = STATUS_META[importRow.status];

  return (
    <Sheet open={!!importRow} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {importRow.supplier ?? "Importação"}
            <Badge style={{ backgroundColor: meta.bg, color: meta.color, borderColor: "transparent" }}>
              {meta.label}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="rounded-md border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Código de rastreamento</div>
                <div className="font-mono tabular">{importRow.tracking_code ?? "—"}</div>
              </div>
              <div className="flex gap-2">
                {importRow.tracking_code && (
                  <a
                    href={`https://t.17track.net/pt-br#nums=${importRow.tracking_code}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                  >
                    Abrir no 17TRACK <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
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

          {importRow.notes && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Notas</div>
              <p className="text-sm whitespace-pre-wrap">{importRow.notes}</p>
            </div>
          )}

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
              Histórico de rastreamento
            </div>
            {importRow.tracking_events.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum evento ainda. Clique em "Atualizar" para buscar.
              </p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {importRow.tracking_events.map((e, idx) => (
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
  const [trackingCode, setTrackingCode] = useState("");
  const [supplier, setSupplier] = useState("");
  const [carrier, setCarrier] = useState("");
  const [orderNumbers, setOrderNumbers] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  function reset() {
    setTrackingCode("");
    setSupplier("");
    setCarrier("");
    setOrderNumbers("");
    setNotes("");
    setFiles([]);
  }

  const createMut = useMutation({
    mutationFn: async () => {
      if (!trackingCode.trim()) throw new Error("Código de rastreamento é obrigatório");
      if (!supplier.trim()) throw new Error("Fornecedor é obrigatório");

      // store id
      const { data: prof } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", (await supabase.auth.getUser()).data.user!.id)
        .single();
      const storeId = prof?.store_id as string;
      if (!storeId) throw new Error("Loja não encontrada");

      const orderNums = orderNumbers
        .split(/[,\s]+/)
        .map((s) => s.replace(/\D/g, ""))
        .filter(Boolean)
        .map((s) => Number(s));

      // upload photos
      setUploading(true);
      const paths: string[] = [];
      for (const f of files) {
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

      const { error } = await supabase.from("imports").insert({
        store_id: storeId,
        tracking_code: trackingCode.trim(),
        supplier: supplier.trim(),
        carrier: carrier.trim() || null,
        order_numbers: orderNums,
        notes: notes.trim() || null,
        photos: paths,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova importação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Código de rastreamento *</Label>
              <Input
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder="Ex: LP00123456789CN"
              />
            </div>
            <div>
              <Label>Fornecedor *</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
          </div>

          <div>
            <Label>Transportadora (opcional)</Label>
            <Input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Correios, China Post, Cainiao..."
            />
          </div>

          <div>
            <Label>Pedidos relacionados (opcional)</Label>
            <Input
              value={orderNumbers}
              onChange={(e) => setOrderNumbers(e.target.value)}
              placeholder="Ex: 12, 34, 56"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Informe os números dos pedidos das vendas separados por vírgula.
            </p>
          </div>

          <div>
            <Label>Notas / camisas no pacote (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: 2x Cruzeiro I, 1x Flamengo III..."
              rows={3}
            />
          </div>

          <div>
            <Label>Fotos do fornecedor (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
