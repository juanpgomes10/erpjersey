import { createFileRoute } from "@tanstack/react-router";

// Endpoint público chamado por pg_cron a cada 15 minutos para sincronizar
// todos os rastreios ativos com o 17TRACK e propagar status aos pedidos.

type TrackEvent = {
  time: string;
  description: string;
  location?: string;
  stage?: string;
};

type ImportStatus =
  | "comprado"
  | "enviado"
  | "em_transito"
  | "chegou_brasil"
  | "aguardando_taxa"
  | "barrado_alfandega"
  | "saiu_entrega"
  | "entregue"
  | "cancelado";

function getApiKey(): string {
  const env = (process.env ?? {}) as Record<string, string | undefined>;
  const candidates = [
    env["17TRACK_API_KEY"],
    env.SEVENTEENTRACK_API_KEY,
    env.SEVENTEEN_TRACK_API_KEY,
    env.TRACK17_API_KEY,
    env.TRACKING_API_KEY,
  ];
  for (const c of candidates) if (c) return c;
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    const n = name.toLowerCase();
    if (n.includes("17track") || n.endsWith("track_api_key")) return value;
  }
  throw new Error("17TRACK_API_KEY ausente");
}

function mapStatus(status: string, sub: string): ImportStatus | null {
  const s = (status ?? "").trim();
  const sb = (sub ?? "").toLowerCase();
  if (s === "Delivered") return "entregue";
  if (s === "OutForDelivery") return "saiu_entrega";
  if (s === "Exception") return "barrado_alfandega";
  if (sb.includes("customs") || sb.includes("alfand") || sb.includes("hold")) return "barrado_alfandega";
  if (sb.includes("pickup") || sb.includes("retir") || sb.includes("await_pickup")) return "aguardando_taxa";
  if (sb.includes("arrival") || sb.includes("import_") || sb.includes("br_")) return "chegou_brasil";
  if (s === "InTransit") return "em_transito";
  if (s === "InfoReceived") return "enviado";
  return null;
}

function importStatusToOrderStatus(s: ImportStatus): "enviado" | "entregue" | null {
  if (s === "entregue") return "entregue";
  if (
    s === "enviado" ||
    s === "em_transito" ||
    s === "chegou_brasil" ||
    s === "aguardando_taxa" ||
    s === "saiu_entrega"
  ) {
    return "enviado";
  }
  return null;
}

async function callTrack17(endpoint: string, body: unknown, apiKey: string) {
  const res = await fetch(`https://api.17track.net/track/v2.4/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "17token": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`17TRACK ${res.status}`);
  return res.json();
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!expected) return false;
  const apikey = request.headers.get("apikey");
  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  return apikey === expected || bearer === expected;
}

export const Route = createFileRoute("/api/public/hooks/refresh-trackings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const apiKey = getApiKey();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: list, error } = await supabaseAdmin
            .from("imports")
            .select("id, store_id, tracking_code, carrier, status, linked_order_ids")
            .not("tracking_code", "is", null)
            .not("status", "in", "(entregue,cancelado,barrado_alfandega)");
          if (error) throw new Error(error.message);
          if (!list?.length) {
            return new Response(JSON.stringify({ ok: true, updated: 0, total: 0 }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          const numbers = list
            .map((i) => i.tracking_code)
            .filter((n): n is string => Boolean(n))
            .slice(0, 40);
          if (numbers.length === 0) {
            return new Response(JSON.stringify({ ok: true, updated: 0, total: 0 }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          // Registra (idempotente) e busca dados.
          await callTrack17("register", numbers.map((n) => ({ number: n })), apiKey).catch(() => null);
          const json = (await callTrack17(
            "gettrackinfo",
            numbers.map((n) => ({ number: n })),
            apiKey,
          )) as {
            data?: {
              accepted?: Array<{
                number?: string;
                track_info?: {
                  latest_status?: { status?: string; sub_status?: string };
                  misc_info?: { carrier_code?: string | number };
                  tracking?: {
                    providers?: Array<{
                      events?: Array<{
                        time_iso?: string;
                        description?: string;
                        location?: string;
                        stage?: string;
                      }>;
                    }>;
                  };
                };
              }>;
            };
          };

          const byNumber = new Map<string, NonNullable<NonNullable<typeof json.data>["accepted"]>[number]>();
          for (const a of json.data?.accepted ?? []) {
            if (a.number) byNumber.set(a.number, a);
          }

          let updated = 0;
          for (const imp of list) {
            if (!imp.tracking_code) continue;
            const a = byNumber.get(imp.tracking_code);
            const info = a?.track_info;
            if (!info) continue;

            const events: TrackEvent[] =
              info.tracking?.providers?.flatMap((p) =>
                (p.events ?? []).map((e) => ({
                  time: e.time_iso ?? "",
                  description: e.description ?? "",
                  location: e.location,
                  stage: e.stage,
                })),
              ) ?? [];
            const rawStatus = info.latest_status?.status ?? "";
            const subStatus = info.latest_status?.sub_status ?? "";
            const mapped = mapStatus(rawStatus, subStatus);

            const update: Record<string, unknown> = {
              tracking_events: events,
              last_tracking_update: new Date().toISOString(),
              tracking_status_raw: rawStatus || null,
            };
            const cc = info.misc_info?.carrier_code;
            if (cc) update.carrier_code = String(cc);
            if (mapped) update.status = mapped;

            await supabaseAdmin.from("imports").update(update as never).eq("id", imp.id);

            // Propaga ao(s) pedido(s) vinculados
            const linked =
              (imp as unknown as { linked_order_ids?: string[] | null }).linked_order_ids ?? [];
            if (mapped && linked.length > 0) {
              const orderStatus = importStatusToOrderStatus(mapped);
              if (orderStatus) {
                await supabaseAdmin
                  .from("orders")
                  .update({ status: orderStatus } as never)
                  .in("id", linked);
              }
            }

            updated += 1;
          }

          return new Response(
            JSON.stringify({ ok: true, updated, total: list.length }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro desconhecido";
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => {
        // Permite health-check manual
        return new Response(JSON.stringify({ ok: true, hint: "use POST para executar" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
