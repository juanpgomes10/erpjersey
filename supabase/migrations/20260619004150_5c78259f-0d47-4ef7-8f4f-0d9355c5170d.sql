
-- 1) Remove trigger duplicado de receita por venda
DROP TRIGGER IF EXISTS trg_sale_transaction ON public.sales;

-- 2) after_order_paid: usar net_value (líquido) quando houver venda vinculada
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
BEGIN
  is_paid_now := NEW.status IN ('pago','enviado','entregue');
  was_paid := (TG_OP = 'UPDATE') AND (OLD.status IN ('pago','enviado','entregue'));

  IF is_paid_now AND NOT was_paid THEN
    -- Baixa de estoque (mantida)
    FOR it IN SELECT product_id, size, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      IF it.product_id IS NOT NULL THEN
        UPDATE public.product_sizes
           SET quantity = GREATEST(quantity - it.quantity, 0)
         WHERE product_id = it.product_id AND size = it.size;
      END IF;
    END LOOP;

    -- Receita: prefere net_value da venda vinculada (líquido após taxas)
    SELECT s.net_value
      INTO v_net
      FROM public.sales s
     WHERE s.order_id = NEW.id
     LIMIT 1;

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

-- 3) sync_order_supplier_cost: separa mercadoria (fornecedor) e frete em 2 lançamentos
CREATE OR REPLACE FUNCTION public.sync_order_supplier_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items_cost numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_is_fulfilled boolean;
  v_was_fulfilled boolean;
  v_ext_items text;
  v_ext_ship text;
BEGIN
  v_ext_items := 'order_cost:' || NEW.id::text;
  v_ext_ship  := 'order_shipping:' || NEW.id::text;
  v_is_fulfilled := NEW.status IN ('enviado','entregue');
  v_was_fulfilled := (TG_OP = 'UPDATE') AND (OLD.status IN ('enviado','entregue'));

  -- Cancelamento: remove lançamentos automáticos
  IF NEW.status = 'cancelado' THEN
    DELETE FROM public.transactions
     WHERE store_id = NEW.store_id
       AND source IN ('order_cost','order_shipping','order_revenue')
       AND external_id IN (v_ext_items, v_ext_ship, 'order_revenue:' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF v_is_fulfilled AND NOT v_was_fulfilled THEN
    -- Soma custo dos itens: prioriza sale_items.unit_cost, depois products.cost_price
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

    -- Fallback adicional: se não achou nada via order_items, soma direto sale_items da venda vinculada
    IF COALESCE(v_items_cost,0) = 0 THEN
      SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost,0)), 0)
        INTO v_items_cost
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
       WHERE s.order_id = NEW.id;
    END IF;

    v_shipping := COALESCE(NEW.shipping_cost, 0);

    -- Mercadoria
    IF v_items_cost > 0 THEN
      INSERT INTO public.transactions
        (store_id, type, description, category, value, payment_method, paid, source, external_id)
      VALUES (
        NEW.store_id, 'saida',
        'Mercadoria do pedido #' || lpad(COALESCE(NEW.order_number,0)::text, 4, '0')
          || COALESCE(' • ' || NULLIF(NEW.supplier_name,''), ''),
        'fornecedor',
        v_items_cost, NEW.payment_method, true,
        'order_cost', v_ext_items
      )
      ON CONFLICT (store_id, source, external_id)
        WHERE source IS NOT NULL AND external_id IS NOT NULL
      DO NOTHING;
    END IF;

    -- Frete
    IF v_shipping > 0 THEN
      INSERT INTO public.transactions
        (store_id, type, description, category, value, payment_method, paid, source, external_id)
      VALUES (
        NEW.store_id, 'saida',
        'Frete do pedido #' || lpad(COALESCE(NEW.order_number,0)::text, 4, '0'),
        'frete',
        v_shipping, NEW.payment_method, true,
        'order_shipping', v_ext_ship
      )
      ON CONFLICT (store_id, source, external_id)
        WHERE source IS NOT NULL AND external_id IS NOT NULL
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Backfill: remove lançamentos legados "Venda #..." gerados pelo trigger antigo
DELETE FROM public.transactions
 WHERE source IS NULL
   AND category = 'venda'
   AND description LIKE 'Venda #%';

-- 5) Reprocessa pedidos existentes que já estão pagos/enviados/entregues
--    (insere receita do pedido se ainda não houver)
INSERT INTO public.transactions
  (store_id, type, description, category, value, payment_method, paid, source, external_id, created_at)
SELECT
  o.store_id, 'entrada',
  'Pedido #' || lpad(o.order_number::text, 4, '0'),
  'venda',
  COALESCE(NULLIF((SELECT s.net_value FROM public.sales s WHERE s.order_id = o.id LIMIT 1), 0),
           o.total_value - COALESCE(o.discount,0)),
  o.payment_method, true,
  'order_revenue', 'order_revenue:' || o.id::text,
  COALESCE(o.paid_at, o.created_at)
FROM public.orders o
WHERE o.status IN ('pago','enviado','entregue')
ON CONFLICT (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL
DO NOTHING;

-- 6) Atualiza external_id antigo de custo "order_cost" para o novo formato (já é o mesmo, no-op seguro)
--    e separa frete dos custos antigos: insere lançamento de frete onde ainda não existe.
INSERT INTO public.transactions
  (store_id, type, description, category, value, payment_method, paid, source, external_id, created_at)
SELECT
  o.store_id, 'saida',
  'Frete do pedido #' || lpad(o.order_number::text, 4, '0'),
  'frete',
  o.shipping_cost,
  o.payment_method, true,
  'order_shipping', 'order_shipping:' || o.id::text,
  COALESCE(o.shipped_at, o.paid_at, o.created_at)
FROM public.orders o
WHERE o.status IN ('enviado','entregue')
  AND COALESCE(o.shipping_cost,0) > 0
ON CONFLICT (store_id, source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL
DO NOTHING;
