import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER",
  "LANG", "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
  "SUPABASE_JWKS", "SUPABASE_SECRET_KEYS", "SUPABASE_DB_URL",
  "SB_EXECUTION_ID",
]);
const SYSTEM_PREFIXES = ["XDG_", "EDGE_RUNTIME", "SB_", "DENO_"];

const knownFunctionNames = ["migrate-sql", "painel-migracao"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const allEnv = Deno.env.toObject();
    const SUPABASE_URL = allEnv.SUPABASE_URL ?? "";
    const anon_key = allEnv.SUPABASE_ANON_KEY ?? allEnv.SUPABASE_PUBLISHABLE_KEY ?? "";
    const service_role_key = allEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";

    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(allEnv)) {
      if (SYSTEM_VARS.has(k)) continue;
      if (k.startsWith("XDG_")) continue;
      if (["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"].includes(k)) continue;
      extras[k] = v;
    }

    // Probe edge functions
    const probes = await Promise.allSettled(
      knownFunctionNames.map(async (name) => {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "OPTIONS" });
        return { name, ok: res.status < 500 };
      })
    );
    const edge_functions = probes
      .filter((p): p is PromiseFulfilledResult<{ name: string; ok: boolean }> => p.status === "fulfilled" && p.value.ok)
      .map((p) => p.value.name);

    // Discover tables
    let database_tables: unknown = [];
    if (service_role_key) {
      try {
        const admin = createClient(SUPABASE_URL, service_role_key);
        const q = `
          SELECT
            t.tablename,
            COALESCE((SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relname = t.tablename AND s.schemaname='public'), 0) AS row_count,
            (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename) AS column_count,
            0 AS encrypted_columns,
            EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='user_id') AS has_user_id
          FROM pg_tables t
          WHERE t.schemaname='public'
          ORDER BY t.tablename
        `;
        const { data } = await admin.rpc("exec_sql", { sql_query: q });
        database_tables = data ?? [];
      } catch (_) {
        database_tables = [];
      }
    }

    return new Response(
      JSON.stringify({
        project_url: SUPABASE_URL,
        anon_key,
        service_role_key,
        secrets: extras,
        edge_functions,
        edge_functions_count: edge_functions.length,
        database_tables,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
