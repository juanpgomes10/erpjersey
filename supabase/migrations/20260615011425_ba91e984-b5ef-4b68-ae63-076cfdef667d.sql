
-- Backfill: create orders for sales that don't have one, without re-triggering stock/transaction side effects
DO $$
DECLARE
  s record;
  new_order_id uuid;
  new_status public.order_status;
BEGIN
  -- Disable triggers that would double-count stock / create duplicate transactions
  ALTER TABLE public.orders DISABLE TRIGGER orders_after_paid;

  FOR s IN
    SELECT * FROM public.sales WHERE order_id IS NULL
  LOOP
    IF s.tracking_code IS NOT NULL AND length(trim(s.tracking_code)) > 0 THEN
      new_status := 'pago'::public.order_status;
    ELSIF s.source = 'estoque'::public.sale_source THEN
      new_status := 'pago'::public.order_status;
    ELSE
      new_status := 'pendente'::public.order_status;
    END IF;

    INSERT INTO public.orders (
      store_id, customer_id, user_id, total_value, status,
      notes, payment_method, source, supplier_name, tracking_code,
      created_at, updated_at
    ) VALUES (
      s.store_id, s.customer_id, s.user_id, s.total_value, new_status,
      s.notes, s.payment_method, s.source::text, s.supplier_name, s.tracking_code,
      s.created_at, s.updated_at
    )
    RETURNING id INTO new_order_id;

    INSERT INTO public.order_items (order_id, product_id, size, quantity, unit_price, product_name)
    SELECT new_order_id, si.product_id, si.size, si.quantity, si.unit_price, si.product_name_snapshot
    FROM public.sale_items si
    WHERE si.sale_id = s.id;

    UPDATE public.sales SET order_id = new_order_id WHERE id = s.id;
  END LOOP;

  ALTER TABLE public.orders ENABLE TRIGGER orders_after_paid;
END $$;
