import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  User as UserIcon,
  Store as StoreIcon,
  Bell,
  Shield,
  Palette,
  Settings as SettingsIcon,
  ImageIcon,
  Upload,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  Sun,
  Moon,
  Download,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  fetchSalesRows,
  fetchOrdersRows,
  fetchCustomersRows,
  fetchImportsRows,
  fetchFinanceRows,
  downloadXlsx,
  periodToRange,
  todayStr,
  type ExportPeriod,
} from "@/lib/export-xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
});

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const SEGMENTS = ["Camisas de Futebol", "Importados", "Misto"];

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function ConfiguracoesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <h1 className="font-sora text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Personalize o sistema, gerencie sua loja e ajuste preferências.
        </p>
      </header>

      <Tabs defaultValue="geral" className="flex flex-col gap-6 lg:flex-row">
        <TabsList
          className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-[color:#111827] p-2 lg:w-56 lg:flex-col lg:items-stretch"
        >
          <TabTrigger value="geral" icon={SettingsIcon} label="Geral" />
          <TabTrigger value="perfil" icon={UserIcon} label="Perfil" />
          <TabTrigger value="loja" icon={StoreIcon} label="Loja" />
          <TabTrigger value="aparencia" icon={Palette} label="Aparência" />
          <TabTrigger value="notificacoes" icon={Bell} label="Notificações" />
          <TabTrigger value="seguranca" icon={Shield} label="Segurança" />
          <TabTrigger value="exportar" icon={Download} label="Exportar Dados" />
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="geral" className="m-0"><GeralTab /></TabsContent>
          <TabsContent value="perfil" className="m-0"><PerfilTab /></TabsContent>
          <TabsContent value="loja" className="m-0"><LojaTab /></TabsContent>
          <TabsContent value="notificacoes" className="m-0"><NotificacoesTab /></TabsContent>
          <TabsContent value="seguranca" className="m-0"><SegurancaTab /></TabsContent>
          <TabsContent value="aparencia" className="m-0"><AparenciaTab /></TabsContent>
          <TabsContent value="exportar" className="m-0"><ExportarTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ---------------- GERAL ---------------- */

const USE_STORE_LOGO_KEY = "erpjersey:use-store-logo";

export function getUseStoreLogo(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(USE_STORE_LOGO_KEY) === "1";
}

function GeralTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: store } = useQuery({
    queryKey: ["store-logo-pref"],
    enabled: !!user,
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", user!.id).maybeSingle();
      if (!prof?.store_id) return null;
      const { data } = await supabase.from("stores").select("id, name, logo_url").eq("id", prof.store_id).maybeSingle();
      return data;
    },
  });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "light" | "dark") || "dark";
  });
  const [useStoreLogo, setUseStoreLogo] = useState<boolean>(() => getUseStoreLogo());
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleStoreLogo(v: boolean) {
    setUseStoreLogo(v);
    localStorage.setItem(USE_STORE_LOGO_KEY, v ? "1" : "0");
    window.dispatchEvent(new Event("app-logo-change"));
    toast.success(v ? "Logo da loja ativada" : "Logo padrão restaurada");
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !store) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${store.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("store-logos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("store-logos").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? null;
      await supabase.from("stores").update({ logo_url: url }).eq("id", store.id);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["store-full"] });
      qc.invalidateQueries({ queryKey: ["store-logo-pref"] });
      if (!useStoreLogo) toggleStoreLogo(true);
      else window.dispatchEvent(new Event("app-logo-change"));
      toast.success("Logo enviada");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar logo");
    } finally {
      setUploading(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Identidade visual</CardTitle>
          <CardDescription>Use a logo da sua loja em vez da logo padrão do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-[color:#0F172A]">
              {store?.logo_url ? (
                <img src={store.logo_url} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
              <Button variant="outline" size="sm" onClick={() => logoFileRef.current?.click()} disabled={uploading || !store}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {store?.logo_url ? "Trocar logo" : "Enviar logo"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG ou JPG até 5MB. Aparece na barra lateral.</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-[color:#0F172A] p-3">
            <div>
              <div className="text-sm">Usar minha logo na página principal</div>
              <div className="text-xs text-muted-foreground">
                {store?.logo_url ? "Substitui a logo do ERPJersey no menu." : "Envie uma logo primeiro."}
              </div>
            </div>
            <Switch checked={useStoreLogo} disabled={!store?.logo_url} onCheckedChange={toggleStoreLogo} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Tema</CardTitle>
          <CardDescription>Escolha entre modo claro ou escuro.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>
              <Moon className="h-4 w-4" /> Escuro
            </Button>
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>
              <Sun className="h-4 w-4" /> Claro
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Atalhos</CardTitle>
          <CardDescription>Acesse rapidamente outras configurações.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <ShortcutRow icon={UserIcon} label="Perfil" hint="Seus dados pessoais" target="perfil" />
          <ShortcutRow icon={StoreIcon} label="Loja" hint="Dados públicos da loja" target="loja" />
          <ShortcutRow icon={Bell} label="Notificações" hint="Alertas e canais" target="notificacoes" />
          <ShortcutRow icon={Shield} label="Segurança" hint="Senha e sessões" target="seguranca" />
          <ShortcutRow icon={Palette} label="Aparência" hint="Tema e cores" target="aparencia" />
          <ShortcutRow icon={Download} label="Exportar Dados" hint="Planilhas em Excel" target="exportar" />
        </CardContent>
      </Card>
    </div>
  );
}

function ShortcutRow({
  icon: Icon, label, hint, target,
}: { icon: typeof UserIcon; label: string; hint: string; target: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const trigger = document.querySelector<HTMLButtonElement>(`[data-state][role="tab"][value="${target}"], [role="tab"][data-radix-collection-item][value="${target}"]`);
        // Fallback: find by text match
        const tabs = document.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        const match = trigger ?? Array.from(tabs).find((t) => t.getAttribute("data-value") === target || t.textContent?.trim().toLowerCase().includes(label.toLowerCase()));
        match?.click();
      }}
      className="flex items-center gap-3 rounded-md border border-border bg-[color:#0F172A] p-3 text-left transition-colors hover:bg-[color:#111827]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:rgba(37,99,235,0.12)] text-[color:#2563EB]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function TabTrigger({
  value, icon: Icon, label, soon,
}: { value: string; icon: typeof UserIcon; label: string; soon?: boolean }) {
  return (
    <TabsTrigger
      value={value}
      className="flex w-full items-center justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-[color:rgba(37,99,235,0.12)] data-[state=active]:text-[color:#2563EB]"
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {soon && (
        <span className="rounded bg-[color:#1E293B] px-1.5 py-0.5 text-[10px] uppercase text-[color:#64748B]">
          em breve
        </span>
      )}
    </TabsTrigger>
  );
}

/* ---------------- PERFIL ---------------- */

function PerfilTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-full", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setPosition((profile as any).position ?? "");
      setWhatsapp((profile as any).whatsapp ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? null;
      setAvatarUrl(url);
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-full"] });
      toast.success("Foto atualizada");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        name: name.trim(),
        position: position.trim() || null,
        whatsapp: whatsapp.trim() || null,
      }).eq("id", user.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["profile-full"] });
      toast.success("Perfil atualizado");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <SkeletonCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sora">Perfil</CardTitle>
        <CardDescription>Suas informações pessoais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-[color:#2563EB] text-lg text-white">
              {(name || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Trocar foto
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">PNG ou JPG até 5MB</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Email">
            <Input value={user?.email ?? ""} disabled />
          </Field>
          <Field label="Cargo / função">
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ex: Dono da loja" maxLength={80} />
          </Field>
          <Field label="WhatsApp pessoal">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- LOJA ---------------- */

function LojaTab() {
  const qc = useQueryClient();
  const { data: storeInfo, isLoading } = useQuery({
    queryKey: ["store-full"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", u.user.id).maybeSingle();
      if (!prof?.store_id) return null;
      const { data, error } = await supabase.from("stores").select("*").eq("id", prof.store_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "", segment: "", city: "", state: "", whatsapp: "", instagram: "", description: "",
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storeInfo) {
      setForm({
        name: storeInfo.name ?? "",
        segment: storeInfo.segment ?? "",
        city: storeInfo.city ?? "",
        state: (storeInfo as any).state ?? "",
        whatsapp: (storeInfo as any).whatsapp ?? "",
        instagram: (storeInfo as any).instagram ?? "",
        description: (storeInfo as any).description ?? "",
      });
      setLogoUrl(storeInfo.logo_url ?? null);
    }
  }, [storeInfo]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storeInfo) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${storeInfo.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("store-logos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("store-logos").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? null;
      setLogoUrl(url);
      await supabase.from("stores").update({ logo_url: url }).eq("id", storeInfo.id);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["store-full"] });
      toast.success("Logo atualizado");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar logo");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!storeInfo) return;
    if (!form.name.trim()) { toast.error("Nome da loja é obrigatório"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("stores").update({
        name: form.name.trim(),
        segment: form.segment || null,
        city: form.city.trim() || null,
        state: form.state || null,
        whatsapp: form.whatsapp.trim() || null,
        instagram: form.instagram.trim() || null,
        description: form.description.trim() || null,
      }).eq("id", storeInfo.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["store-full"] });
      toast.success("Loja atualizada");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <SkeletonCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sora">Loja</CardTitle>
        <CardDescription>Informações públicas da sua loja.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {logoUrl && <AvatarImage src={logoUrl} />}
            <AvatarFallback className="bg-[color:#1E293B] text-lg">
              {(form.name || "L").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Trocar logo
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">PNG ou JPG até 5MB</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da loja">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Segmento">
            <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {BR_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="WhatsApp comercial">
            <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="Instagram">
            <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@minhaloja" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição da loja">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} maxLength={500} />
            </Field>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- NOTIFICAÇÕES ---------------- */

type NotifPrefs = {
  import_taxed: boolean;
  import_blocked: boolean;
  import_out_for_delivery: boolean;
  import_delivered: boolean;
  financial_due: boolean;
  financial_due_days: number;
  email_enabled: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  import_taxed: true, import_blocked: true,
  import_out_for_delivery: true, import_delivered: true,
  financial_due: true, financial_due_days: 3,
  email_enabled: true,
};

function NotificacoesTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", user.id).maybeSingle();
      if (!prof?.store_id) return;
      setStoreId(prof.store_id);
      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setPrefs({
          import_taxed: d.import_taxed, import_blocked: d.import_blocked,
          import_out_for_delivery: d.import_out_for_delivery, import_delivered: d.import_delivered,
          financial_due: d.financial_due, financial_due_days: d.financial_due_days,
          email_enabled: d.email_enabled,
        });
      }
      setLoaded(true);
    })();
  }, [user]);


  async function update<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) {
    if (!user || !storeId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase
      .from("notification_preferences" as any)
      .upsert({ user_id: user.id, store_id: storeId, ...next }, { onConflict: "user_id" });
    if (error) {
      toast.error("Erro ao salvar preferência");
    }
  }

  if (!loaded) return <SkeletonCard />;

  return (
    <div className="space-y-4">

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Alertas de importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow label="Notificar quando importação for taxada"
            checked={prefs.import_taxed} onChange={(v) => update("import_taxed", v)} />
          <ToggleRow label="Notificar quando importação for barrada"
            checked={prefs.import_blocked} onChange={(v) => update("import_blocked", v)} />
          <ToggleRow label="Notificar quando importação sair para entrega"
            checked={prefs.import_out_for_delivery} onChange={(v) => update("import_out_for_delivery", v)} />
          <ToggleRow label="Notificar quando importação for entregue"
            checked={prefs.import_delivered} onChange={(v) => update("import_delivered", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Alertas financeiros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow label="Notificar contas a pagar com vencimento próximo"
            checked={prefs.financial_due} onChange={(v) => update("financial_due", v)} />
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-[color:#0F172A] p-3">
            <span className="text-sm">Antecedência do aviso</span>
            <Select
              value={String(prefs.financial_due_days)}
              onValueChange={(v) => update("financial_due_days", Number(v))}
              disabled={!prefs.financial_due}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="3">3 dias</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Canais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border bg-[color:#0F172A] p-3 opacity-80">
            <div>
              <div className="text-sm">Notificações no sistema</div>
              <div className="text-xs text-muted-foreground">Sempre ativo</div>
            </div>
            <Switch checked disabled />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-[color:#0F172A] p-3">
            <div>
              <div className="text-sm">Email</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <Switch checked={prefs.email_enabled} onCheckedChange={(v) => update("email_enabled", v)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-[color:#0F172A] p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ---------------- SEGURANÇA ---------------- */

function SegurancaTab() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [changing, setChanging] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const strength = passwordStrength(next);

  async function changePassword() {
    if (next !== confirm) { toast.error("As senhas não coincidem"); return; }
    if (next.length < 8) { toast.error("Senha precisa ter ao menos 8 caracteres"); return; }
    if (!user?.email) return;
    setChanging(true);
    try {
      // Re-auth check
      const { error: reErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (reErr) { toast.error("Senha atual incorreta"); setChanging(false); return; }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      toast.success("Senha alterada");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao alterar senha");
    } finally {
      setChanging(false);
    }
  }

  async function signOutAll() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error("Erro ao encerrar sessões");
    else toast.success("Outras sessões encerradas");
  }

  async function deleteAccount() {
    toast.info("Solicitação registrada. Entre em contato com o suporte para concluir a exclusão.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Alterar senha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Senha atual">
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Nova senha">
            <div className="relative">
              <Input type={showNext ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowNext(!showNext)}>
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {next && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-[color:#1E293B]">
                  <div className={cn("h-full transition-all", strength.color)} style={{ width: `${strength.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{strength.label}</span>
              </div>
            )}
          </Field>
          <Field label="Confirmar nova senha">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button onClick={changePassword} disabled={changing || !current || !next || !confirm}>
            {changing && <Loader2 className="h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Sessões ativas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border bg-[color:#0F172A] p-3 text-sm">
            <div className="font-medium">Sessão atual</div>
            <div className="text-xs text-muted-foreground">
              {typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : ""}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Último acesso: agora</div>
          </div>
          <Button variant="outline" onClick={signOutAll}>Encerrar todas as outras sessões</Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-sora text-base text-destructive">
            <AlertTriangle className="h-4 w-4" /> Zona de perigo
          </CardTitle>
          <CardDescription>Esta ação é irreversível.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive">
                Excluir conta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir conta</AlertDialogTitle>
                <AlertDialogDescription>
                  Digite <strong>CONFIRMAR</strong> para excluir sua conta permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="CONFIRMAR" />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteText("")}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteText !== "CONFIRMAR"}
                  onClick={deleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function passwordStrength(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 2) return { label: "Fraca", pct: 33, color: "bg-red-500" };
  if (score <= 4) return { label: "Média", pct: 66, color: "bg-yellow-500" };
  return { label: "Forte", pct: 100, color: "bg-green-500" };
}

/* ---------------- APARÊNCIA ---------------- */

function AparenciaTab() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "light" | "dark") || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-sora text-base">Tema</CardTitle>
          <CardDescription>Escolha como o ERPJersey deve aparecer.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <ThemeCard active={theme === "dark"} onClick={() => setTheme("dark")} mode="dark" />
            <ThemeCard active={theme === "light"} onClick={() => setTheme("light")} mode="light" />
          </div>
        </CardContent>
      </Card>

      <Card className="opacity-70">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-sora text-base">Cor de destaque</CardTitle>
            <Badge variant="secondary">Em breve</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Personalize a cor de destaque da interface.
        </CardContent>
      </Card>

      <Card className="opacity-70">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-sora text-base">Idioma</CardTitle>
            <Badge variant="secondary">Em breve</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mude o idioma do sistema.
        </CardContent>
      </Card>
    </div>
  );
}

function ThemeCard({ active, onClick, mode }: { active: boolean; onClick: () => void; mode: "light" | "dark" }) {
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-colors",
        active ? "border-[color:#2563EB]" : "border-border hover:border-[color:#334155]",
      )}
    >
      <div className={cn(
        "h-24 w-full rounded-md border border-border",
        isDark ? "bg-[#0F172A]" : "bg-white",
      )}>
        <div className={cn("m-2 h-3 w-12 rounded", isDark ? "bg-[#1E293B]" : "bg-slate-200")} />
        <div className={cn("mx-2 mt-1 h-2 w-20 rounded", isDark ? "bg-[#1E293B]" : "bg-slate-200")} />
        <div className={cn("mx-2 mt-3 h-6 w-16 rounded", isDark ? "bg-[#2563EB]" : "bg-[#2563EB]")} />
      </div>
      <div className="flex items-center gap-2">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        <span className="text-sm font-medium">{isDark ? "Escuro" : "Claro"}</span>
      </div>
    </button>
  );
}


/* ---------------- shared ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </CardContent>
    </Card>
  );
}

/* ---------------- EXPORTAR DADOS ---------------- */

const PERIOD_OPTIONS: { value: ExportPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

function PeriodPicker({
  period, onPeriod, from, to, onFrom, onTo,
}: {
  period: ExportPeriod; onPeriod: (v: ExportPeriod) => void;
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase text-muted-foreground">Período</Label>
      <Select value={period} onValueChange={(v) => onPeriod(v as ExportPeriod)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {period === "custom" && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

function ExportCard({
  title, description, columns, children, onExport,
}: {
  title: string; description: string; columns: string[];
  children?: React.ReactNode; onExport: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sora text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="rounded-md border border-[color:#1E293B] bg-[color:#0F172A] p-3">
          <div className="mb-1 text-[11px] uppercase text-muted-foreground">Colunas exportadas</div>
          <div className="text-xs text-foreground/80">{columns.join(" · ")}</div>
        </div>
        <Button
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onExport();
              toast.success("Download iniciado");
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao exportar");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Excel
        </Button>
      </CardContent>
    </Card>
  );
}

function useExportPeriod(initial: ExportPeriod = "month") {
  const [period, setPeriod] = useState<ExportPeriod>(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = () => periodToRange(period, { from, to });
  return { period, setPeriod, from, setFrom, to, setTo, range };
}

function ExportarTab() {
  const sales = useExportPeriod();
  const orders = useExportPeriod();
  const [orderStatus, setOrderStatus] = useState("all");
  const imp = useExportPeriod();
  const fin = useExportPeriod();
  const [allLoading, setAllLoading] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-sora text-sm font-semibold">Exportar tudo</div>
            <div className="text-xs text-muted-foreground">
              Gera um único Excel com uma aba por módulo (período: este mês).
            </div>
          </div>
          <Button
            disabled={allLoading}
            onClick={async () => {
              setAllLoading(true);
              try {
                const r = periodToRange("month");
                const [s, o, c, i, f] = await Promise.all([
                  fetchSalesRows(r),
                  fetchOrdersRows(r),
                  fetchCustomersRows(),
                  fetchImportsRows(r),
                  fetchFinanceRows(r),
                ]);
                downloadXlsx(`erpjersey-completo-${todayStr()}.xlsx`, {
                  Vendas: s, Pedidos: o, Clientes: c, Importações: i, Financeiro: f,
                });
                toast.success("Download iniciado");
              } catch (e: any) {
                toast.error(e?.message ?? "Erro ao exportar");
              } finally {
                setAllLoading(false);
              }
            }}
          >
            {allLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar tudo
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ExportCard
          title="Vendas"
          description="Histórico completo de vendas com cliente, produtos, valores e formas de pagamento"
          columns={["Data","Nº Venda","Cliente","Produtos","Quantidade","Valor unitário","Valor total","Lucro","Forma de pagamento","Status"]}
          onExport={async () => {
            const rows = await fetchSalesRows(sales.range());
            downloadXlsx(`erpjersey-vendas-${todayStr()}.xlsx`, { Vendas: rows });
          }}
        >
          <PeriodPicker period={sales.period} onPeriod={sales.setPeriod} from={sales.from} to={sales.to} onFrom={sales.setFrom} onTo={sales.setTo} />
        </ExportCard>

        <ExportCard
          title="Pedidos"
          description="Lista de pedidos com status, cliente e valores"
          columns={["Data","Nº Pedido","Cliente","Produtos","Valor total","Forma de pagamento","Status"]}
          onExport={async () => {
            const rows = await fetchOrdersRows(orders.range(), orderStatus);
            downloadXlsx(`erpjersey-pedidos-${todayStr()}.xlsx`, { Pedidos: rows });
          }}
        >
          <PeriodPicker period={orders.period} onPeriod={orders.setPeriod} from={orders.from} to={orders.to} onFrom={orders.setFrom} onTo={orders.setTo} />
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Status</Label>
            <Select value={orderStatus} onValueChange={setOrderStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ExportCard>

        <ExportCard
          title="Clientes"
          description="Base completa de clientes com histórico de compras"
          columns={["Nome","WhatsApp","Instagram","Cidade","Total de compras","Valor total gasto","Última compra","Data de cadastro"]}
          onExport={async () => {
            const rows = await fetchCustomersRows();
            downloadXlsx(`erpjersey-clientes-${todayStr()}.xlsx`, { Clientes: rows });
          }}
        />

        <ExportCard
          title="Importações"
          description="Histórico de importações com status e valores"
          columns={["Código de rastreio","Fornecedor","País","Transportadora","Status","Previsão de entrega","Valor USD","Valor R$","Taxa alfandegária","Data de cadastro"]}
          onExport={async () => {
            const rows = await fetchImportsRows(imp.range());
            downloadXlsx(`erpjersey-importacoes-${todayStr()}.xlsx`, { Importações: rows });
          }}
        >
          <PeriodPicker period={imp.period} onPeriod={imp.setPeriod} from={imp.from} to={imp.to} onFrom={imp.setFrom} onTo={imp.setTo} />
        </ExportCard>

        <ExportCard
          title="Financeiro"
          description="Lançamentos financeiros com entradas, saídas e saldo"
          columns={["Data","Tipo","Descrição","Categoria","Valor","Forma de pagamento","Observações"]}
          onExport={async () => {
            const rows = await fetchFinanceRows(fin.range());
            downloadXlsx(`erpjersey-financeiro-${todayStr()}.xlsx`, { Financeiro: rows });
          }}
        >
          <PeriodPicker period={fin.period} onPeriod={fin.setPeriod} from={fin.from} to={fin.to} onFrom={fin.setFrom} onTo={fin.setTo} />
        </ExportCard>
      </div>
    </div>
  );
}

