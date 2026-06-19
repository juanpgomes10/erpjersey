
-- Estoque agora é debitado apenas via after_order_paid quando a origem é "estoque"
DROP TRIGGER IF EXISTS trg_decrement_stock ON public.sale_items;

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
  v_net numeric(10,2);
  v_ext text;
  v_source public.sale_source;
BEGIN
  is_paid_now := NEW.status IN ('pago','enviado','entregue');
  was_paid := (TG_OP = 'UPDATE') AND (OLD.status IN ('pago','enviado','entregue'));

  IF is_paid_now AND NOT was_paid THEN
    -- Descobre origem da venda vinculada (se houver)
    SELECT s.source INTO v_source FROM public.sales s WHERE s.order_id = NEW.id LIMIT 1;

    -- Baixa de estoque APENAS quando origem = 'estoque'
    IF v_source = 'estoque' THEN
      FOR it IN SELECT product_id, size, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
        IF it.product_id IS NOT NULL THEN
          UPDATE public.product_sizes
             SET quantity = GREATEST(quantity - it.quantity, 0)
           WHERE product_id = it.product_id AND size = it.size;
        END IF;
      END LOOP;
    END IF;

    -- Receita: prefere net_value da venda vinculada
    SELECT s.net_value INTO v_net FROM public.sales s WHERE s.order_id = NEW.id LIMIT 1;

    v_ext := 'order_revenue:' || NEW.id::text;

    INSERT INTO public.transactions
      (store_id, type, description, category, value, payment_method, paid, source, external_id)
    VALUES (
      NEW.store_id, 'entrada',
      'Pedido #' || lpad(NEW.order_number::text, 4, '0'),
      'venda',
      COALESCE(NULLIF(v_net,0), NEW.total_value - COALESCE(NEW.discount,0)),
      NEW.payment_method, true,
      'order_revenue', v_ext
    )
    ON CONFLICT (store_id, source, external_id)
      WHERE source IS NOT NULL AND external_id IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
