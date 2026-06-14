import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  ClipboardList,
  Users,
  Plane,
  Megaphone,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { NotificationsBell } from "@/components/app-shell/notifications-bell";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart },
  { to: "/estoque", label: "Estoque", icon: Package },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/importacoes", label: "Importações", icon: Plane },
  { to: "/marketing", label: "Marketing", icon: Megaphone, soon: true },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar desktop */}
      <aside
        className="hidden w-60 shrink-0 flex-col border-r border-border lg:flex"
        style={{ backgroundColor: "var(--sidebar)" }}
      >
        <div className="flex h-16 items-center px-5 border-b border-border">
          <Logo size={26} />
        </div>
        <NavList onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside
            className="absolute left-0 top-0 h-full w-64 border-r border-border"
            style={{ backgroundColor: "var(--sidebar)" }}
          >
            <div className="flex h-16 items-center justify-between px-5 border-b border-border">
              <Logo size={26} />
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        const Icon = item.icon;
        const classes = `group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "text-[color:#2563EB]"
            : item.soon
              ? "cursor-not-allowed text-[color:#475569]"
              : "text-[color:#64748B] hover:bg-[color:#1E293B] hover:text-foreground"
        }`;
        const style = active ? { backgroundColor: "rgba(37,99,235,0.12)" } : undefined;
        const inner = (
          <>
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[color:#2563EB]" />
            )}
            <Icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.soon && (
              <span className="rounded bg-[color:#1E293B] px-1.5 py-0.5 text-[10px] uppercase text-[color:#64748B]">
                em breve
              </span>
            )}
          </>
        );
        if (item.soon) {
          return (
            <div key={item.to} className={classes} style={style} aria-disabled>
              {inner}
            </div>
          );
        }
        return (
          <a key={item.to} href={item.to} onClick={(e) => { e.preventDefault(); onNavigate(); window.history.pushState({}, "", item.to); window.dispatchEvent(new PopStateEvent("popstate")); }} className={classes} style={style}>
            {inner}
          </a>
        );
      })}
    </nav>
  );
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const storeName = profile?.store?.name ?? "Minha loja";
  const userName = profile?.name ?? "Usuário";
  const initial = userName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-[color:var(--card)] px-4 md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="lg:hidden">
        <Logo size={32} />
      </div>
      <div className="hidden flex-1 lg:block">
        <h1 className="font-sora text-base font-semibold">{storeName}</h1>
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">
        <ThemeToggle />
        <NotificationsBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[color:#2563EB] text-xs text-white">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{userName}</div>
              <div className="text-xs font-normal text-muted-foreground">{storeName}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

