
-- Add new enum values for sale source
ALTER TYPE public.sale_source ADD VALUE IF NOT EXISTS 'fornecedor_china';
ALTER TYPE public.sale_source ADD VALUE IF NOT EXISTS 'revendedor_br';

-- Add columns to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- Add columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS tracking_code text;
