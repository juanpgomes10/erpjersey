
-- Add model to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model TEXT;

-- Add net_value and source to sales
DO $$ BEGIN
  CREATE TYPE public.sale_source AS ENUM ('estoque', 'drop', 'loja_parceira');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS net_value NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS source public.sale_source NOT NULL DEFAULT 'estoque';

-- Update stock decrement trigger to only fire when source = 'estoque'
CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source public.sale_source;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT source INTO v_source FROM public.sales WHERE id = NEW.sale_id;
    IF v_source = 'estoque' THEN
      UPDATE public.product_sizes
      SET quantity = GREATEST(quantity - NEW.quantity, 0)
      WHERE product_id = NEW.product_id AND size = NEW.size;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Use net_value in the transactions created from sales
CREATE OR REPLACE FUNCTION public.create_transaction_for_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'concluida' THEN
    INSERT INTO public.transactions (store_id, type, description, category, value, payment_method, paid)
    VALUES (NEW.store_id, 'entrada', 'Venda #' || substring(NEW.id::text, 1, 8), 'venda', COALESCE(NULLIF(NEW.net_value,0), NEW.total_value), NEW.payment_method, true);
  END IF;
  RETURN NEW;
END;
$function$;
