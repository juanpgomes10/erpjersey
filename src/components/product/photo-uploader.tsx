import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";

type Props = {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Pasta dentro de `<store_id>/` no bucket — separa fotos de venda, estoque etc. */
  folder?: string;
  label?: string;
  hint?: string;
  className?: string;
};

/**
 * Faz upload de uma foto para o bucket `product-photos`, isolada por loja.
 * Retorna uma URL assinada (válida por 1 ano) para exibir no app.
 */
export function PhotoUploader({
  value,
  onChange,
  folder = "produtos",
  label = "Foto do produto",
  hint = "PNG ou JPG até 5MB.",
  className = "",
}: Props) {
  const { data: profile } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!profile?.store_id) { toast.error("Sem loja vinculada"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${profile.store_id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      onChange(signed?.signedUrl ?? null);
      toast.success("Foto enviada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-sm font-medium">{label}</p>}
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {value ? (
            <img src={value} alt="Pré-visualização" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {value ? "Trocar foto" : "Enviar foto"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                <X className="mr-1 h-3 w-3" /> Remover
              </Button>
            )}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
