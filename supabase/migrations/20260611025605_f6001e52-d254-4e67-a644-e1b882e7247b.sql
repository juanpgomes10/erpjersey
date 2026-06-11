
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  platform text NOT NULL,
  store_url text,
  store_name text,
  access_token text,
  external_store_id text,
  last_synced_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Integrações da loja" ON public.integrations
  FOR ALL TO authenticated
  USING (store_id = public.current_store_id())
  WITH CHECK (store_id = public.current_store_id());

CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add columns to orders for external source tracking (Shopify/Nuvemshop)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_external
  ON public.orders (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
