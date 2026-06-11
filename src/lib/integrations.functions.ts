import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Platform = z.enum(["shopify", "nuvemshop"]);

function shopifyBase(storeUrl: string) {
  return `https://${storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/admin/api/2024-01`;
}

async function shopifyShop(storeUrl: string, token: string) {
  const r = await fetch(`${shopifyBase(storeUrl)}/shop.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
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

const SIZE_MAP: Record<string, string> = { P: "P", M: "M", G: "G", GG: "GG", XGG: "XGG" };
function mapSize(raw?: string | null): string | null {
  if (!raw) return null;
  const up = raw.toUpperCase().trim();
  if (SIZE_MAP[up]) return up;
  // try to extract first token
  const token = up.split(/[\s/|-]+/).find((t) => SIZE_MAP[t]);
  return token ?? null;
}

function mapShopifyStatus(o: any): "pendente" | "pago" | "enviado" | "cancelado" {
  if (o.cancelled_at || o.financial_status === "refunded" || o.financial_status === "voided") return "cancelado";
  if (o.fulfillment_status === "fulfilled") return "enviado";
  if (o.financial_status === "paid") return "pago";
  return "pendente";
}

async function fetchAllShopify(url: string, token: string, key: string) {
  const out: any[] = [];
  let next: string | null = url;
  while (next) {
    const r: Response = await fetch(next, { headers: { "X-Shopify-Access-Token": token } });
    if (!r.ok) throw new Error(`Falha ao buscar ${key} na Shopify (${r.status})`);
    const j: any = await r.json();
    out.push(...(j[key] ?? []));
    const link = r.headers.get("link") ?? "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

export const syncIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { platform: "shopify" | "nuvemshop" }) => z.object({ platform: Platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("store_id").eq("id", userId).single();
    if (!prof?.store_id) throw new Error("Loja não encontrada");
    const storeId = prof.store_id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("store_id", storeId)
      .eq("platform", data.platform)
      .maybeSingle();
    if (!integ) throw new Error("Integração não encontrada");

    let customersImported = 0;
    let ordersImported = 0;
    let trackingsImported = 0;

    if (data.platform === "shopify") {
      const base = shopifyBase(integ.store_url!);
      const token = integ.access_token!;

      // ---------- CUSTOMERS ----------
      const customers = await fetchAllShopify(
        `${base}/customers.json?limit=250`,
        token,
        "customers",
      );
      // Map external_id -> internal customer id
      const customerMap = new Map<string, string>();
      for (const c of customers) {
        const extId = String(c.id);
        const name =
          `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
          c.email ||
          c.phone ||
          "Cliente Shopify";
        const phone = c.phone ?? c.default_address?.phone ?? null;

        // 1) Try by source+external_id
        let internalId: string | null = null;
        const { data: existingByExt } = await supabaseAdmin
          .from("customers")
          .select("id")
          .eq("store_id", storeId)
          .eq("source", "shopify")
          .eq("external_id", extId)
          .maybeSingle();
        if (existingByExt) {
          internalId = existingByExt.id;
        } else if (phone) {
          // 2) Try by phone (link existing manual customer)
          const { data: existingByPhone } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("store_id", storeId)
            .eq("phone", phone)
            .maybeSingle();
          if (existingByPhone) {
            internalId = existingByPhone.id;
            await supabaseAdmin
              .from("customers")
              .update({ source: "shopify", external_id: extId })
              .eq("id", internalId);
          }
        }
        if (!internalId) {
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("customers")
            .insert({
              store_id: storeId,
              name,
              phone,
              source: "shopify",
              external_id: extId,
            })
            .select("id")
            .single();
          if (!insErr && inserted) {
            internalId = inserted.id;
            customersImported++;
          }
        }
        if (internalId) customerMap.set(extId, internalId);
      }

      // ---------- ORDERS ----------
      const orders = await fetchAllShopify(
        `${base}/orders.json?status=any&limit=250`,
        token,
        "orders",
      );

      for (const o of orders) {
        const extId = String(o.id);
        const status = mapShopifyStatus(o);
        const total = Number(o.total_price ?? 0);
        const createdAt = o.created_at ?? null;

        // Resolve customer
        let customerId: string | null = null;
        if (o.customer?.id) {
          customerId = customerMap.get(String(o.customer.id)) ?? null;
        }
        if (!customerId && (o.customer || o.phone)) {
          // create a minimal customer if not in batch
          const name =
            `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim() ||
            o.email ||
            o.phone ||
            "Cliente Shopify";
          const phone = o.customer?.phone ?? o.phone ?? null;
          const { data: nc } = await supabaseAdmin
            .from("customers")
            .insert({
              store_id: storeId,
              name,
              phone,
              source: "shopify",
              external_id: o.customer?.id ? String(o.customer.id) : null,
            })
            .select("id")
            .single();
          if (nc) {
            customerId = nc.id;
            if (o.customer?.id) customerMap.set(String(o.customer.id), nc.id);
          }
        }

        // Check if order already exists
        const { data: existing } = await supabaseAdmin
          .from("orders")
          .select("id, status")
          .eq("store_id", storeId)
          .eq("source", "shopify")
          .eq("external_id", extId)
          .maybeSingle();

        let orderId: string | null = null;
        const tracking = o.fulfillments?.[0]?.tracking_number ?? null;

        if (existing) {
          orderId = existing.id;
          // only update status (don't overwrite manual edits)
          await supabaseAdmin
            .from("orders")
            .update({ status: status as any })
            .eq("id", orderId);
        } else {
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("orders")
            .insert({
              store_id: storeId,
              customer_id: customerId,
              total_value: total,
              status: status as any,
              payment_method: "pix" as any,
              source: "shopify",
              external_id: extId,
              created_at: createdAt,
            })
            .select("id")
            .single();
          if (insErr || !inserted) continue;
          orderId = inserted.id;
          ordersImported++;

          // Insert items
          for (const li of o.line_items ?? []) {
            const size = mapSize(li.variant_title ?? li.title ?? null);
            await supabaseAdmin.from("order_items").insert({
              order_id: orderId,
              product_id: null,
              product_name: li.title ?? "Produto Shopify",
              size: size as any,
              quantity: Number(li.quantity ?? 1),
              unit_price: Number(li.price ?? 0),
            });
          }
        }

        // ---------- TRACKING -> imports ----------
        if (tracking) {
          const { data: existingImp } = await supabaseAdmin
            .from("imports")
            .select("id")
            .eq("store_id", storeId)
            .eq("source", "shopify")
            .eq("external_id", extId)
            .maybeSingle();
          if (!existingImp) {
            const { error: impErr } = await supabaseAdmin.from("imports").insert({
              store_id: storeId,
              tracking_code: tracking,
              supplier: `Shopify - ${integ.store_name ?? integ.store_url ?? ""}`.trim(),
              status: "em_transito" as any,
              source: "shopify",
              external_id: extId,
              total_value: total,
            });
            if (!impErr) trackingsImported++;
          }
        }
      }
    } else {
      // Nuvemshop sync stays minimal (existing behavior preserved minimally)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
        const status = (() => {
          if (o.status === "cancelled") return "cancelado";
          if (o.shipping_status === "shipped") return "enviado";
          if (o.payment_status === "paid") return "pago";
          return "pendente";
        })();
        const { error: upErr } = await supabaseAdmin.from("orders").upsert(
          {
            store_id: storeId,
            total_value: Number(o.total ?? 0),
            status: status as any,
            payment_method: "pix" as any,
            source: "nuvemshop",
            external_id: String(o.id),
          },
          { onConflict: "store_id,source,external_id" },
        );
        if (!upErr) ordersImported++;
      }
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integ.id);

    return {
      ok: true,
      imported: ordersImported,
      ordersImported,
      customersImported,
      trackingsImported,
    };
  });
