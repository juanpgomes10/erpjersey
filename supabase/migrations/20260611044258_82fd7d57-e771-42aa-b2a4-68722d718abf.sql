
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_store_source_ext
  ON public.transactions (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.after_order_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it record;
  is_paid_now boolean;
  was_paid boolean;
BEGIN
  is_paid_now := NEW.status IN ('pago','enviado','entregue');
  was_paid := (TG_OP = 'UPDATE') AND (OLD.status IN ('pago','enviado','entregue'));

  IF is_paid_now AND NOT was_paid THEN
    FOR it IN SELECT product_id, size, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      IF it.product_id IS NOT NULL THEN
        UPDATE public.product_sizes
           SET quantity = GREATEST(quantity - it.quantity, 0)
         WHERE product_id = it.product_id AND size = it.size;
      END IF;
    END LOOP;

    INSERT INTO public.transactions (store_id, type, description, category, value, payment_method, paid, source, external_id)
    VALUES (
      NEW.store_id, 'entrada',
      'Pedido #' || lpad(NEW.order_number::text, 4, '0'),
      'venda', NEW.total_value - COALESCE(NEW.discount,0),
      NEW.payment_method, true,
      NEW.source, NEW.external_id
    )
    ON CONFLICT (store_id, source, external_id) WHERE source IS NOT NULL AND external_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: link existing transactions to their shopify orders
UPDATE public.transactions t
   SET source = o.source, external_id = o.external_id
  FROM public.orders o
 WHERE t.source IS NULL
   AND t.store_id = o.store_id
   AND t.category = 'venda'
   AND o.source = 'shopify'
   AND o.external_id IS NOT NULL
   AND t.description = 'Pedido #' || lpad(o.order_number::text, 4, '0');
