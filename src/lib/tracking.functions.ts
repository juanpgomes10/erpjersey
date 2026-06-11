import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Integração com 17TRACK (https://api.17track.net/) — suporta correios da China,
// Correios BR e centenas de outras transportadoras.

type TrackEvent = {
  time: string;
  description: string;
  location?: string;
  stage?: string;
};

const inputSchema = z.object({
  importId: z.string().uuid(),
});

export const refreshTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["17TRACK_API_KEY"] ?? process.env.SEVENTEENTRACK_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Integração de rastreamento não configurada. Adicione a chave 17TRACK_API_KEY.",
      );
    }

    const { supabase } = context;
    const { data: imp, error } = await supabase
      .from("imports")
      .select("id, tracking_code, carrier")
      .eq("id", data.importId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!imp?.tracking_code) throw new Error("Importação sem código de rastreamento.");

    // 1) registra (idempotente — 17TRACK ignora se já existir)
    await fetch("https://api.17track.net/track/v2.2/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "17token": apiKey },
      body: JSON.stringify([{ number: imp.tracking_code }]),
    }).catch(() => null);

    // 2) consulta
    const res = await fetch("https://api.17track.net/track/v2.2/gettrackinfo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "17token": apiKey },
      body: JSON.stringify([{ number: imp.tracking_code }]),
    });
    if (!res.ok) throw new Error(`17TRACK erro ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        accepted?: Array<{
          track_info?: {
            latest_status?: { status?: string; sub_status?: string };
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

    // Mapeia status 17TRACK -> nosso enum import_status
    const sub = (accepted?.latest_status?.sub_status ?? "").toLowerCase();
    const status = accepted?.latest_status?.status ?? "";
    let mapped: string | null = null;
    if (status === "Delivered") mapped = "entregue";
    else if (status === "OutForDelivery") mapped = "saiu_entrega";
    else if (sub.includes("customs") || sub.includes("alfand")) mapped = "barrado_alfandega";
    else if (status === "InTransit") mapped = "em_transito";
    else if (status === "InfoReceived") mapped = "enviado";
    if (sub.includes("pickup") || sub.includes("retir")) mapped = "aguardando_taxa";

    const update: Record<string, unknown> = {
      tracking_events: events,
      last_tracking_update: new Date().toISOString(),
    };
    if (mapped) update.status = mapped;

    const { error: upErr } = await supabase
      .from("imports")
      .update(update as never)
      .eq("id", data.importId);
    if (upErr) throw new Error(upErr.message);

    return { events, status: mapped ?? status };
  });
