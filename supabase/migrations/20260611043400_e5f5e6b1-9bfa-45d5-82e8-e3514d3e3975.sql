
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_external
  ON public.orders (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
