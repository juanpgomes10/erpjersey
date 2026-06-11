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
  Users as UsersIcon,
  Upload,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  Sun,
  Moon,
} from "lucide-react";

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
          Gerencie seu perfil, loja, notificações e segurança.
        </p>
      </header>

      <Tabs defaultValue="perfil" className="flex flex-col gap-6 lg:flex-row">
        <TabsList
          className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-[color:#111827] p-2 lg:w-56 lg:flex-col lg:items-stretch"
        >
          <TabTrigger value="perfil" icon={UserIcon} label="Perfil" />
          <TabTrigger value="loja" icon={StoreIcon} label="Loja" />
          <TabTrigger value="notificacoes" icon={Bell} label="Notificações" />
          <TabTrigger value="seguranca" icon={Shield} label="Segurança" />
          <TabTrigger value="aparencia" icon={Palette} label="Aparência" />
          <TabTrigger value="usuarios" icon={UsersIcon} label="Usuários" soon />
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="perfil" className="m-0"><PerfilTab /></TabsContent>
          <TabsContent value="loja" className="m-0"><LojaTab /></TabsContent>
          <TabsContent value="notificacoes" className="m-0"><NotificacoesTab /></TabsContent>
          <TabsContent value="seguranca" className="m-0"><SegurancaTab /></TabsContent>
          <TabsContent value="aparencia" className="m-0"><AparenciaTab /></TabsContent>
          <TabsContent value="usuarios" className="m-0"><UsuariosTab /></TabsContent>
        </div>
      </Tabs>
    </div>
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
  stock_minimum: boolean;
  stock_zero: boolean;
  import_taxed: boolean;
  import_blocked: boolean;
  import_out_for_delivery: boolean;
  import_delivered: boolean;
  financial_due: boolean;
  financial_due_days: number;
  email_enabled: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  stock_minimum: true, stock_zero: true,
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
          stock_minimum: d.stock_minimum, stock_zero: d.stock_zero,
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
          <CardTitle className="font-sora text-base">Alertas de estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow label="Notificar quando produto atingir estoque mínimo"
            checked={prefs.stock_minimum} onChange={(v) => update("stock_minimum", v)} />
          <ToggleRow label="Notificar quando produto zerar estoque"
            checked={prefs.stock_zero} onChange={(v) => update("stock_zero", v)} />
        </CardContent>
      </Card>

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

/* ---------------- USUÁRIOS ---------------- */

function UsuariosTab() {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-sora">Usuários</CardTitle>
          <Badge variant="secondary">Em breve</Badge>
        </div>
        <CardDescription>Gerencie quem tem acesso à sua loja.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-border bg-[color:#0F172A] p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[color:#2563EB] text-sm text-white">
                {(user?.email ?? "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-medium">{user?.email}</div>
              <div className="text-xs text-muted-foreground">Você</div>
            </div>
          </div>
          <Badge className="bg-[color:#2563EB] text-white">Admin</Badge>
        </div>
        <Button variant="outline" disabled title="Disponível em breve">+ Convidar usuário</Button>
      </CardContent>
    </Card>
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
