import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Platform = z.enum(["shopify", "nuvemshop"]);

async function shopifyShop(storeUrl: string, token: string) {
  const url = `https://${storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/admin/api/2024-01/shop.json`;
  const r = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (!r.ok) throw new Error("Credenciais inválidas. Verifique a URL e o token.");
  const j: any = await r.json();
  return j.shop?.name ?? null;
}

async function nuvemshopShop(storeId: string, token: string) {
  const url = `https://api.nuvemshop.com.br/v1/${storeId}/store`;
  const r = await fetch(url, {
    headers: { Authentication: `bearer ${token}`, "User-Agent": "ERPJersey (contato@erpjersey)" },
  });
  if (!r.ok) throw new Error("Credenciais inválidas. Verifique o ID e o token.");
  const j: any = await r.json();
  return j.name?.pt ?? j.name ?? null;
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("integrations")
      .select("id, platform, store_url, store_name, external_store_id, last_synced_at, is_active");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const connectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { platform: "shopify" | "nuvemshop"; storeUrl?: string; storeId?: string; token: string }) =>
    z
      .object({
        platform: Platform,
        storeUrl: z.string().optional(),
        storeId: z.string().optional(),
        token: z.string().min(5).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", userId).single();
    if (!prof?.store_id) throw new Error("Loja não encontrada");

    let storeName: string | null = null;
    let externalId: string | null = null;
    let storeUrl: string | null = null;

    if (data.platform === "shopify") {
      if (!data.storeUrl) throw new Error("URL da loja é obrigatória");
      storeUrl = data.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
      storeName = await shopifyShop(storeUrl, data.token);
    } else {
      if (!data.storeId) throw new Error("ID da loja é obrigatório");
      externalId = data.storeId;
      storeName = await nuvemshopShop(data.storeId, data.token);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integrations").upsert(
      {
        store_id: prof.store_id,
        platform: data.platform,
        store_url: storeUrl,
        store_name: storeName,
        external_store_id: externalId,
        access_token: data.token,
        is_active: true,
      },
      { onConflict: "store_id,platform" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, storeName };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { platform: "shopify" | "nuvemshop" }) => z.object({ platform: Platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("integrations")
      .delete()
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { platform: "shopify" | "nuvemshop" }) => z.object({ platform: Platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", userId).single();
    if (!prof?.store_id) throw new Error("Loja não encontrada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("store_id", prof.store_id)
      .eq("platform", data.platform)
      .maybeSingle();
    if (!integ) throw new Error("Integração não encontrada");

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let imported = 0;

    if (data.platform === "shopify") {
      const url = `https://${integ.store_url}/admin/api/2024-01/orders.json?status=any&created_at_min=${since}&limit=250`;
      const r = await fetch(url, { headers: { "X-Shopify-Access-Token": integ.access_token! } });
      if (!r.ok) throw new Error("Falha ao buscar pedidos da Shopify");
      const j: any = await r.json();
      for (const o of j.orders ?? []) {
        const mapStatus = (() => {
          if (o.cancelled_at) return "cancelado";
          if (o.fulfillment_status === "fulfilled") return "enviado";
          if (o.financial_status === "paid") return "pago";
          return "pendente";
        })();
        let customerId: string | null = null;
        if (o.email) {
          const name = `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim() || o.email;
          const { data: existing } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("store_id", prof.store_id)
            .eq("notes", o.email)
            .maybeSingle();
          if (existing) customerId = existing.id;
          else {
            const { data: nc } = await supabaseAdmin
              .from("customers")
              .insert({ store_id: prof.store_id, name, notes: o.email })
              .select("id")
              .single();
            customerId = nc?.id ?? null;
          }
        }
        const { error: upErr } = await supabaseAdmin.from("orders").upsert(
          {
            store_id: prof.store_id,
            customer_id: customerId,
            total_value: Number(o.total_price ?? 0),
            status: mapStatus as any,
            payment_method: "pix" as any,
            source: "shopify",
            external_id: String(o.id),
          },
          { onConflict: "store_id,source,external_id" },
        );
        if (!upErr) imported++;
      }
    } else {
      const url = `https://api.nuvemshop.com.br/v1/${integ.external_store_id}/orders?per_page=200&created_at_min=${since}`;
      const r = await fetch(url, {
        headers: {
          Authentication: `bearer ${integ.access_token}`,
          "User-Agent": "ERPJersey (contato@erpjersey)",
        },
      });
      if (!r.ok) throw new Error("Falha ao buscar pedidos da Nuvemshop");
      const orders: any[] = await r.json();
      for (const o of orders ?? []) {
        const mapStatus = (() => {
          if (o.status === "cancelled") return "cancelado";
          if (o.shipping_status === "shipped") return "enviado";
          if (o.payment_status === "paid") return "pago";
          return "pendente";
        })();
        let customerId: string | null = null;
        const email = o.contact_email ?? o.customer?.email;
        if (email) {
          const name = o.customer?.name ?? email;
          const { data: existing } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("store_id", prof.store_id)
            .eq("notes", email)
            .maybeSingle();
          if (existing) customerId = existing.id;
          else {
            const { data: nc } = await supabaseAdmin
              .from("customers")
              .insert({ store_id: prof.store_id, name, notes: email })
              .select("id")
              .single();
            customerId = nc?.id ?? null;
          }
        }
        const { error: upErr } = await supabaseAdmin.from("orders").upsert(
          {
            store_id: prof.store_id,
            customer_id: customerId,
            total_value: Number(o.total ?? 0),
            status: mapStatus as any,
            payment_method: "pix" as any,
            source: "nuvemshop",
            external_id: String(o.id),
          },
          { onConflict: "store_id,source,external_id" },
        );
        if (!upErr) imported++;
      }
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integ.id);

    return { ok: true, imported };
  });
