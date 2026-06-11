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

async function fetchShopifyPaged(url: string, token: string, key: string, maxPages = 4) {
  const out: any[] = [];
  let next: string | null = url;
  let pages = 0;
  while (next && pages < maxPages) {
    const r: Response = await fetch(next, { headers: { "X-Shopify-Access-Token": token } });
    if (!r.ok) throw new Error(`Falha ao buscar ${key} na Shopify (${r.status})`);
    const j: any = await r.json();
    out.push(...(j[key] ?? []));
    const link = r.headers.get("link") ?? "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
    pages++;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
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
      // Only last 90 days, capped pages — keeps worker under CPU budget
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      // ---------- CUSTOMERS (batched) ----------
      const customers = await fetchShopifyPaged(
        `${base}/customers.json?limit=250&updated_at_min=${since}`,
        token,
        "customers",
        4,
      );

      const customerMap = new Map<string, string>(); // shopify id -> internal id

      if (customers.length) {
        const extIds = customers.map((c) => String(c.id));
        const phones = customers
          .map((c) => c.phone ?? c.default_address?.phone ?? null)
          .filter((p): p is string => !!p);

        // Pre-fetch existing customers by external_id and by phone in 2 queries
        const { data: existingExt } = await supabaseAdmin
          .from("customers")
          .select("id, external_id")
          .eq("store_id", storeId)
          .eq("source", "shopify")
          .in("external_id", extIds);
        for (const r of existingExt ?? []) {
          if (r.external_id) customerMap.set(r.external_id, r.id);
        }

        const phoneMap = new Map<string, string>();
        if (phones.length) {
          const { data: existingPhone } = await supabaseAdmin
            .from("customers")
            .select("id, phone")
            .eq("store_id", storeId)
            .in("phone", phones);
          for (const r of existingPhone ?? []) {
            if (r.phone) phoneMap.set(r.phone, r.id);
          }
        }

        const toInsert: any[] = [];
        for (const c of customers) {
          const extId = String(c.id);
          if (customerMap.has(extId)) continue;
          const phone = c.phone ?? c.default_address?.phone ?? null;
          if (phone && phoneMap.has(phone)) {
            const id = phoneMap.get(phone)!;
            customerMap.set(extId, id);
            await supabaseAdmin
              .from("customers")
              .update({ source: "shopify", external_id: extId })
              .eq("id", id);
            continue;
          }
          const name =
            `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
            c.email ||
            phone ||
            "Cliente Shopify";
          toInsert.push({
            store_id: storeId,
            name,
            phone,
            source: "shopify",
            external_id: extId,
          });
        }

        for (const batch of chunk(toInsert, 200)) {
          const { data: inserted, error } = await supabaseAdmin
            .from("customers")
            .insert(batch)
            .select("id, external_id");
          if (!error && inserted) {
            for (const r of inserted) {
              if (r.external_id) customerMap.set(r.external_id, r.id);
            }
            customersImported += inserted.length;
          }
        }
      }

      // ---------- ORDERS (batched) ----------
      const orders = await fetchShopifyPaged(
        `${base}/orders.json?status=any&limit=250&updated_at_min=${since}`,
        token,
        "orders",
        4,
      );

      if (orders.length) {
        const orderExtIds = orders.map((o) => String(o.id));

        // Pre-fetch existing orders for this batch
        const { data: existingOrders } = await supabaseAdmin
          .from("orders")
          .select("id, external_id, status")
          .eq("store_id", storeId)
          .eq("source", "shopify")
          .in("external_id", orderExtIds);
        const existingMap = new Map<string, { id: string; status: string }>();
        for (const r of existingOrders ?? []) {
          if (r.external_id) existingMap.set(r.external_id, { id: r.id, status: r.status as any });
        }

        // Pre-fetch existing imports (tracking)
        const { data: existingImps } = await supabaseAdmin
          .from("imports")
          .select("external_id")
          .eq("store_id", storeId)
          .eq("source", "shopify")
          .in("external_id", orderExtIds);
        const existingImpSet = new Set((existingImps ?? []).map((r) => r.external_id));

        // Resolve customers missing from map (single fetch by phone for unknown ones)
        const ordersMissingCustomer = orders.filter(
          (o) => o.customer?.id && !customerMap.has(String(o.customer.id)),
        );
        if (ordersMissingCustomer.length) {
          const newCustomers = ordersMissingCustomer.map((o) => ({
            store_id: storeId,
            name:
              `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim() ||
              o.email ||
              o.customer?.phone ||
              o.phone ||
              "Cliente Shopify",
            phone: o.customer?.phone ?? o.phone ?? null,
            source: "shopify",
            external_id: String(o.customer!.id),
          }));
          // Dedupe by external_id
          const seen = new Set<string>();
          const dedup = newCustomers.filter((c) => {
            if (seen.has(c.external_id)) return false;
            seen.add(c.external_id);
            return true;
          });
          for (const batch of chunk(dedup, 200)) {
            const { data: ins } = await supabaseAdmin
              .from("customers")
              .upsert(batch, { onConflict: "store_id,source,external_id", ignoreDuplicates: false })
              .select("id, external_id");
            for (const r of ins ?? []) {
              if (r.external_id) customerMap.set(r.external_id, r.id);
            }
          }
        }

        // Build inserts + status updates
        const ordersToInsert: any[] = [];
        const statusUpdates: { id: string; status: string }[] = [];
        const importsToInsert: any[] = [];
        const itemsByExtOrderId: Record<string, any[]> = {};

        for (const o of orders) {
          const extId = String(o.id);
          const status = mapShopifyStatus(o);
          const total = Number(o.total_price ?? 0);
          const tracking = o.fulfillments?.[0]?.tracking_number ?? null;
          const customerId = o.customer?.id ? customerMap.get(String(o.customer.id)) ?? null : null;

          const existing = existingMap.get(extId);
          if (existing) {
            if (existing.status !== status) statusUpdates.push({ id: existing.id, status });
          } else {
            ordersToInsert.push({
              store_id: storeId,
              customer_id: customerId,
              total_value: total,
              status,
              payment_method: "pix",
              source: "shopify",
              external_id: extId,
              created_at: o.created_at ?? null,
            });
            itemsByExtOrderId[extId] = (o.line_items ?? []).map((li: any) => ({
              product_id: null,
              product_name: li.title ?? "Produto Shopify",
              size: mapSize(li.variant_title ?? li.title ?? null),
              quantity: Number(li.quantity ?? 1),
              unit_price: Number(li.price ?? 0),
            }));
          }

          if (tracking && !existingImpSet.has(extId)) {
            importsToInsert.push({
              store_id: storeId,
              tracking_code: tracking,
              supplier: `Shopify - ${integ.store_name ?? integ.store_url ?? ""}`.trim(),
              status: "em_transito",
              source: "shopify",
              external_id: extId,
              total_value: total,
            });
          }
        }

        // Insert orders in batches and link items
        for (const batch of chunk(ordersToInsert, 100)) {
          const { data: ins, error } = await supabaseAdmin
            .from("orders")
            .insert(batch)
            .select("id, external_id");
          if (error || !ins) continue;
          ordersImported += ins.length;
          const itemsBatch: any[] = [];
          for (const row of ins) {
            const items = itemsByExtOrderId[row.external_id!] ?? [];
            for (const it of items) itemsBatch.push({ order_id: row.id, ...it });
          }
          if (itemsBatch.length) {
            for (const ib of chunk(itemsBatch, 500)) {
              await supabaseAdmin.from("order_items").insert(ib);
            }
          }
        }

        // Status updates (small set, run sequentially in parallel)
        await Promise.all(
          statusUpdates.map((u) =>
            supabaseAdmin.from("orders").update({ status: u.status as any }).eq("id", u.id),
          ),
        );

        // Imports
        for (const batch of chunk(importsToInsert, 200)) {
          const { data: ins, error } = await supabaseAdmin.from("imports").insert(batch).select("id");
          if (!error && ins) trackingsImported += ins.length;
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
