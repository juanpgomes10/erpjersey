
CREATE OR REPLACE FUNCTION public.sync_order_supplier_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric(10,2) := 0;
  v_items_cost numeric(10,2) := 0;
  v_is_fulfilled boolean;
  v_was_fulfilled boolean;
  v_ext text;
BEGIN
  v_ext := 'order_cost:' || NEW.id::text;
  v_is_fulfilled := NEW.status IN ('enviado','entregue');
  v_was_fulfilled := (TG_OP = 'UPDATE') AND (OLD.status IN ('enviado','entregue'));

  -- Cancellation: remove any auto-generated supplier cost expense
  IF NEW.status = 'cancelado' THEN
    DELETE FROM public.transactions
     WHERE store_id = NEW.store_id
       AND source = 'order_cost'
       AND external_id = v_ext;
    RETURN NEW;
  END IF;

  IF v_is_fulfilled AND NOT v_was_fulfilled THEN
    -- Sum item costs: prefer sale_items.unit_cost when a linked sale exists,
    -- otherwise fall back to products.cost_price.
    SELECT COALESCE(SUM(
      oi.quantity * COALESCE(
        (SELECT si.unit_cost
           FROM public.sale_items si
           JOIN public.sales s ON s.id = si.sale_id
          WHERE s.order_id = NEW.id
            AND si.product_id IS NOT DISTINCT FROM oi.product_id
            AND si.size IS NOT DISTINCT FROM oi.size
          LIMIT 1),
        (SELECT p.cost_price FROM public.products p WHERE p.id = oi.product_id),
        0
      )
    ), 0)
      INTO v_items_cost
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id;

    v_cost := COALESCE(v_items_cost, 0) + COALESCE(NEW.shipping_cost, 0);

    IF v_cost > 0 THEN
      INSERT INTO public.transactions
        (store_id, type, description, category, value, payment_method, paid, source, external_id)
      VALUES (
        NEW.store_id,
        'saida',
        'Custo do pedido #' || lpad(COALESCE(NEW.order_number,0)::text, 4, '0')
          || COALESCE(' • ' || NULLIF(NEW.supplier_name,''), ''),
        'fornecedor',
        v_cost,
        NEW.payment_method,
        true,
        'order_cost',
        v_ext
      )
      ON CONFLICT (store_id, source, external_id)
        WHERE source IS NOT NULL AND external_id IS NOT NULL
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_supplier_cost ON public.orders;
CREATE TRIGGER orders_sync_supplier_cost
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_supplier_cost();
