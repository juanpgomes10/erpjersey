import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download, Loader2,
  Code2, Database, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/painel-migracao")({
  ssr: false,
  component: PainelMigracao,
});

type TableRow = {
  tablename: string;
  row_count: number;
  column_count: number;
  encrypted_columns: number;
  has_user_id: boolean;
};

type PanelData = {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables: TableRow[];
};

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}•••••${value.slice(-8)}`;
}

function classifyTable(t: TableRow): { label: string; variant: "default" | "secondary" | "outline" } {
  if (t.row_count === 0) return { label: "Ignorar", variant: "outline" };
  if (t.has_user_id || t.row_count > 100) return { label: "Essencial", variant: "default" };
  return { label: "Histórico", variant: "secondary" };
}

function SecretRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className={`flex items-center gap-2 rounded-md border p-3 ${highlight ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-sm truncate">{shown ? value : mask(value)}</div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => setShown((s) => !s)}>
        {shown ? <EyeOff /> : <Eye />}
      </Button>
      <Button size="icon" variant="ghost" onClick={copy}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function PainelMigracao() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const revealAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/painel-migracao`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as PanelData;
      setData(json);
      toast.success("Tudo revelado");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push("═══ CREDENCIAIS ═══");
    lines.push(`PROJECT_URL=${data.project_url}`);
    lines.push(`ANON_KEY=${data.anon_key}`);
    lines.push(`SERVICE_ROLE_KEY=${data.service_role_key}`);
    lines.push("");
    lines.push("═══ EDGE FUNCTIONS ═══");
    data.edge_functions.forEach((n) => lines.push(n));
    lines.push("");
    lines.push("═══ SECRETS ═══");
    Object.entries(data.secrets).forEach(([k, v]) => lines.push(`${k}=${v}`));
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Tudo copiado");
  };

  const downloadEdgeFunctions = () => {
    const modules = import.meta.glob("/supabase/functions/*/index.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const entries = Object.entries(modules);
    const parts: string[] = [];
    let count = 0;
    for (const [path, src] of entries) {
      const m = path.match(/functions\/([^/]+)\/index\.ts$/);
      const name = m?.[1] ?? path;
      parts.push(`// ═══ ${name} ═══\n${src}\n`);
      count++;
    }
    const blob = new Blob([parts.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edge-functions.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${count} funções exportadas`);
  };

  const downloadSecrets = () => {
    if (!data) return;
    const lines = ["export const SECRETS = {"];
    Object.entries(data.secrets).forEach(([k, v]) => {
      lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    });
    lines.push("} as const;");
    lines.push("");
    lines.push("export type SecretKey = keyof typeof SECRETS;");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secrets.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("secrets.ts baixado");
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-sora text-3xl font-bold">Painel de Migração</h1>
          <p className="text-sm text-muted-foreground">
            Copie os itens abaixo na ordem e cole na extensão CloneSupa.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button onClick={revealAll} disabled={loading} size="lg">
            {loading ? <Loader2 className="animate-spin" /> : <Eye />}
            Revelar Tudo
          </Button>
          <Button onClick={copyAll} variant="outline" disabled={!data}>
            <Copy /> Copiar Tudo
          </Button>
        </div>

        {/* Passo 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="text-primary" /> Passo 1 — Credenciais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data ? (
              <>
                <SecretRow label="Project URL" value={data.project_url} highlight />
                <SecretRow label="Anon Key" value={data.anon_key} />
                <SecretRow label="Service Role Key" value={data.service_role_key} highlight />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo".</p>
            )}
          </CardContent>
        </Card>

        {/* Passo 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="text-primary" /> Passo 2 — Edge Functions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data && (
              <div className="flex flex-wrap gap-2">
                {data.edge_functions.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhuma encontrada.</span>
                )}
                {data.edge_functions.map((n) => (
                  <Badge key={n} variant="secondary">{n}</Badge>
                ))}
              </div>
            )}
            <Button onClick={downloadEdgeFunctions} variant="outline">
              <Download /> Baixar edge-functions.ts
            </Button>
          </CardContent>
        </Card>

        {/* Passo 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="text-primary" /> Passo 3 — Secrets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data ? (
              <>
                {Object.entries(data.secrets).map(([k, v]) => (
                  <SecretRow key={k} label={k} value={v} />
                ))}
                <Button onClick={downloadSecrets} variant="outline" className="mt-2">
                  <Download /> Baixar secrets.ts
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando dados.</p>
            )}
          </CardContent>
        </Card>

        {/* Passo 4 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="text-primary" /> Passo 4 — Conferência (Tabelas)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <div className="text-sm text-muted-foreground">
                  {data.database_tables.length} tabela(s) encontradas no schema public.
                </div>
                <div className="divide-y rounded-md border">
                  {data.database_tables.map((t) => {
                    const c = classifyTable(t);
                    return (
                      <div key={t.tablename} className="flex items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <div className="font-mono text-sm truncate">{t.tablename}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.row_count} linhas · {t.column_count} colunas
                            {t.has_user_id ? " · user_id" : ""}
                          </div>
                        </div>
                        <Badge variant={c.variant}>{c.label}</Badge>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs">
                  <AlertTriangle className="text-yellow-500 shrink-0" />
                  <div>
                    Senhas são copiadas como hash bcrypt. Se o JWT secret do destino mudar,
                    sessões antigas caem mas a senha continua válida — usuários só precisam logar novamente.
                  </div>
                </div>
              </>
            ) : (
              <div className="flex gap-2 text-sm text-muted-foreground">
                <Info /> Revele para ver as tabelas.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
