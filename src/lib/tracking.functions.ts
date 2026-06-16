import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Integração com 17TRACK (API v2.4). A chave é lida apenas no servidor.

type TrackEvent = {
  time: string;
  description: string;
  location?: string;
  stage?: string;
};

const importStatusList = [
  "comprado",
  "enviado",
  "em_transito",
  "chegou_brasil",
  "aguardando_taxa",
  "barrado_alfandega",
  "saiu_entrega",
  "entregue",
  "cancelado",
] as const;
type ImportStatus = (typeof importStatusList)[number];

const STATUS_NOTIFICATION: Record<string, { title: string; type: "info" | "urgent" }> = {
  enviado: { title: "📦 Importação enviada pelo fornecedor", type: "info" },
  em_transito: { title: "🚚 Pedido em trânsito", type: "info" },
  chegou_brasil: { title: "📦 Pedido recebido no Brasil", type: "info" },
  aguardando_taxa: { title: "💰 Aguardando pagamento de tributos", type: "urgent" },
  barrado_alfandega: { title: "⚠️ Pedido barrado na alfândega", type: "urgent" },
  saiu_entrega: { title: "🚚 Saiu para entrega", type: "info" },
  entregue: { title: "✅ Pedido entregue", type: "info" },
};

function getApiKey() {
  // Cloudflare Workers nem sempre expõem variáveis cujo nome começa com dígito
  // (como "17TRACK_API_KEY") em process.env. Procuramos de forma resiliente.
  const env = (process.env ?? {}) as Record<string, string | undefined>;
  const candidates = [
    env["17TRACK_API_KEY"],
    env.SEVENTEENTRACK_API_KEY,
    env.SEVENTEEN_TRACK_API_KEY,
    env.TRACK17_API_KEY,
    env.TRACKING_API_KEY,
  ];
  for (const c of candidates) if (c) return c;
  // varredura: qualquer variável que contenha "17track" ou "track_api_key"
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    const n = name.toLowerCase();
    if (n.includes("17track") || n.endsWith("track_api_key")) return value;
  }
  throw new Error("Integração de rastreamento não configurada (17TRACK_API_KEY).");
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
  if (s === "NotFound" || s === "Undelivered") return null; // mantém estado atual
  return null;
}

type TrackInfoResponse = {
  data?: {
    accepted?: Array<{
      number?: string;
      track_info?: {
        latest_status?: { status?: string; sub_status?: string };
        misc_info?: { carrier_code?: string | number };
        tracking?: {
          providers?: Array<{
            provider?: { name?: string };
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

async function callTrack17(endpoint: string, body: unknown, apiKey: string) {
  const res = await fetch(`https://api.17track.net/track/v2.4/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "17token": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`17TRACK erro ${res.status}`);
  return res.json();
}

// ───────────────────────── REGISTER ─────────────────────────
export const registerTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trackingCode: z.string().min(8).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = getApiKey();
    try {
      const json = (await callTrack17(
        "register",
        [{ number: data.trackingCode }],
        apiKey,
      )) as { data?: { accepted?: Array<{ carrier?: number }> } };
      const carrierCode = json.data?.accepted?.[0]?.carrier;
      return { ok: true, carrierCode: carrierCode ? String(carrierCode) : null };
    } catch {
      // Pode falhar se já estiver registrado; não é erro fatal.
      return { ok: true, carrierCode: null };
    }
  });

// ───────────────────────── REFRESH ONE ─────────────────────────
const refreshOneSchema = z.object({ importId: z.string().uuid() });

// Mapeia status de importação → status de pedido (orders)
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

// Propaga status para os pedidos vinculados a uma importação.
async function propagateToOrders(
  supabase: { from: (t: string) => { update: (v: unknown) => { in: (c: string, ids: string[]) => Promise<unknown> } } },
  linkedOrderIds: string[] | null | undefined,
  mappedImportStatus: ImportStatus | null,
) {
  if (!linkedOrderIds?.length || !mappedImportStatus) return;
  const orderStatus = importStatusToOrderStatus(mappedImportStatus);
  if (!orderStatus) return;
  await supabase.from("orders").update({ status: orderStatus }).in("id", linkedOrderIds);
}


export const refreshTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refreshOneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = getApiKey();
    const { supabase } = context;

    const { data: imp, error } = await supabase
      .from("imports")
      .select("id, store_id, tracking_code, carrier, status")
      .eq("id", data.importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!imp?.tracking_code) throw new Error("Importação sem código de rastreamento.");

    // garante registro (idempotente)
    await callTrack17("register", [{ number: imp.tracking_code }], apiKey).catch(() => null);

    const json = (await callTrack17(
      "gettrackinfo",
      [{ number: imp.tracking_code }],
      apiKey,
    )) as TrackInfoResponse;

    const accepted = json.data?.accepted?.[0]?.track_info;
    const events: TrackEvent[] =
      accepted?.tracking?.providers?.flatMap((p) =>
        (p.events ?? []).map((e) => ({
          time: e.time_iso ?? "",
          description: e.description ?? "",
          location: e.location,
          stage: e.stage,
        })),
      ) ?? [];

    const rawStatus = accepted?.latest_status?.status ?? "";
    const subStatus = accepted?.latest_status?.sub_status ?? "";
    const mapped = mapStatus(rawStatus, subStatus);
    const carrierCode = accepted?.misc_info?.carrier_code;

    const update: Record<string, unknown> = {
      tracking_events: events,
      last_tracking_update: new Date().toISOString(),
      tracking_status_raw: rawStatus || null,
    };
    if (carrierCode) update.carrier_code = String(carrierCode);
    if (mapped) update.status = mapped;

    const { error: upErr } = await supabase
      .from("imports")
      .update(update as never)
      .eq("id", data.importId);
    if (upErr) throw new Error(upErr.message);

    if (mapped && mapped !== imp.status && imp.store_id) {
      const meta = STATUS_NOTIFICATION[mapped];
      if (meta) {
        await supabase.from("notifications").insert({
          store_id: imp.store_id,
          type: meta.type,
          title: meta.title,
          body: `Rastreio ${imp.tracking_code}${imp.carrier ? ` • ${imp.carrier}` : ""}`,
          link: "/importacoes",
          related_import_id: imp.id,
        } as never);
      }
    }

    return { events, status: mapped ?? rawStatus };
  });

// ───────────────────────── REFRESH ALL ─────────────────────────
export const refreshAllTrackings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = getApiKey();
    const { supabase } = context;

    // Apenas as ativas (não entregues nem barradas/canceladas)
    const { data: list, error } = await supabase
      .from("imports")
      .select("id, store_id, tracking_code, carrier, status")
      .not("tracking_code", "is", null)
      .not("status", "in", "(entregue,cancelado,barrado_alfandega)");
    if (error) throw new Error(error.message);
    if (!list?.length) return { updated: 0, total: 0 };

    const numbers = list
      .map((i) => i.tracking_code)
      .filter(Boolean)
      .slice(0, 40); // limite por chamada

    if (numbers.length === 0) return { updated: 0, total: 0 };

    const json = (await callTrack17(
      "gettrackinfo",
      numbers.map((n) => ({ number: n })),
      apiKey,
    )) as TrackInfoResponse;

    type AcceptedItem = NonNullable<NonNullable<TrackInfoResponse["data"]>["accepted"]>[number];
    const byNumber = new Map<string, AcceptedItem>();
    for (const a of (json.data?.accepted ?? []) as AcceptedItem[]) {
      if (a.number) byNumber.set(a.number, a);
    }

    let updated = 0;
    for (const imp of list) {
      if (!imp.tracking_code) continue;
      const a = byNumber.get(imp.tracking_code);
      if (!a?.track_info) continue;
      const info = a.track_info as NonNullable<AcceptedItem["track_info"]>;
      type Provider = NonNullable<NonNullable<typeof info.tracking>["providers"]>[number];
      type Ev = NonNullable<Provider["events"]>[number];
      const events: TrackEvent[] =
        info.tracking?.providers?.flatMap((p: Provider) =>
          (p.events ?? []).map((e: Ev) => ({
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

      await supabase.from("imports").update(update as never).eq("id", imp.id);

      if (mapped && mapped !== imp.status && imp.store_id) {
        const meta = STATUS_NOTIFICATION[mapped];
        if (meta) {
          await supabase.from("notifications").insert({
            store_id: imp.store_id,
            type: meta.type,
            title: meta.title,
            body: `Rastreio ${imp.tracking_code}${imp.carrier ? ` • ${imp.carrier}` : ""}`,
            link: "/importacoes",
            related_import_id: imp.id,
          } as never);
        }
      }
      updated += 1;
    }
    return { updated, total: list.length };
  });
