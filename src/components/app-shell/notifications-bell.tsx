import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() } as never)
        .is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Realtime: novos alertas viram toast + atualizam a lista
  useEffect(() => {
    const channel = supabase
      .channel("notifications-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as Notification;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          const fn = n.type === "urgent" ? toast.error : toast;
          fn(n.title, {
            description: n.body ?? undefined,
            duration: n.type === "urgent" ? 8000 : 5000,
            action: n.link
              ? { label: "Ver", onClick: () => navigate({ to: n.link! }) }
              : undefined,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, navigate]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && unread > 0) markAllRead.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:#EF4444] px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-semibold">Notificações</div>
          {unread > 0 && (
            <button
              className="text-xs text-[color:#2563EB] hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              Marcar como lidas
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Sem notificações por enquanto.
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`cursor-pointer border-b border-border px-3 py-2 text-sm hover:bg-accent ${
                    !n.read_at ? "bg-[color:rgba(37,99,235,0.06)]" : ""
                  }`}
                  onClick={() => {
                    setOpen(false);
                    if (n.link) navigate({ to: n.link });
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 font-medium leading-snug">
                      {n.title}
                    </div>
                    {n.type === "urgent" && (
                      <span className="rounded bg-[color:#EF4444] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Urgente
                      </span>
                    )}
                  </div>
                  {n.body && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {n.body}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
