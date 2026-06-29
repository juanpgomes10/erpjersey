import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Logo } from "@/components/brand/logo";
import authLogoAsset from "@/assets/erpjersey-auth-logo.png.asset.json";
import { assetUrl } from "@/lib/asset-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — ERPJersey" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

  // Já logado → dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { name, store_name: storeName },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode entrar.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      const friendly = msg.includes("Invalid login")
        ? "Email ou senha incorretos."
        : msg.includes("already registered")
          ? "Este email já está cadastrado."
          : msg;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error("Não foi possível entrar com Google.");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar com Google.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Lado esquerdo */}
      <div
        className="hidden flex-col justify-between p-12 lg:flex"
        style={{ backgroundColor: "#0F172A" }}
      >
        <Logo size={36} />
        <div className="text-white">
          <div className="mb-8 flex justify-center">
            <img src={assetUrl(authLogoAsset)} alt="ERPJersey" width={180} height={180} style={{ width: 180, height: 180, objectFit: "contain" }} />
          </div>
          <h1 className="font-sora text-4xl font-semibold leading-tight">
            Tudo sobre sua loja de camisas de time.
            <br />
            Em um único lugar.
          </h1>
          <p className="mt-4 text-base text-[color:#94A3B8]">
            Sistema de gestão para lojas de camisas e importados.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              "Controle estoque, vendas e financeiro sem planilhas",
              "Acompanhe importações do pedido à entrega",
              "Veja seu lucro real em tempo real",
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-[color:#CBD5E1]">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[color:#2563EB]" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-[color:#64748B]">© ERPJersey {new Date().getFullYear()}</p>
      </div>

      {/* Lado direito */}
      <div className="flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <Logo size={36} />
          </div>


          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <h2 className="font-sora text-2xl font-semibold">Entrar na sua loja</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bem-vindo de volta. Acesse seu painel.
              </p>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <h2 className="font-sora text-2xl font-semibold">Criar nova loja</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece a gerenciar seu negócio em minutos.
              </p>
            </TabsContent>
          </Tabs>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Seu nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: João Silva" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store">Nome da loja</Label>
                  <Input id="store" value={storeName} onChange={(e) => setStoreName(e.target.value)} required placeholder="Ex: Loja do Zé Camisas" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : mode === "signup" ? "Criar conta" : "Entrar"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            <GoogleIcon /> Continuar com Google
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="mr-2">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
