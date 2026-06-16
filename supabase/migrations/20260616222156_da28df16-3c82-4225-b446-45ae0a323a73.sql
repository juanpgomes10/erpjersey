
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS delivery_method text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS fulfillment_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_status text;
