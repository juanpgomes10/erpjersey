
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS tracking_status_raw text,
  ADD COLUMN IF NOT EXISTS carrier_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS value_usd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_order_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
