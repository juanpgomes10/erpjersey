
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.order_items ALTER COLUMN size DROP NOT NULL;

ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_source_external
  ON public.customers (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_source_external
  ON public.imports (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
