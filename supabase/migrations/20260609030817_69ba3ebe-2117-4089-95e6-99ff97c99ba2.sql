
-- Add fields needed for the Orders module
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS discount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_number bigint,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_number ON public.orders(store_id, order_number);

-- Auto-assign sequential order_number per store on insert
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    SELECT COALESCE(MAX(order_number), 0) + 1
      INTO NEW.order_number
      FROM public.orders
     WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_number ON public.orders;
CREATE TRIGGER orders_set_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- Status transition side-effects: stamp timestamps, decrement stock when paid,
-- create a financial transaction when paid
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
BEGIN
  -- Stamp timestamps when transitioning to a new status
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pago' AND NEW.paid_at IS NULL THEN NEW.paid_at := now(); END IF;
    IF NEW.status = 'enviado' AND NEW.shipped_at IS NULL THEN NEW.shipped_at := now(); END IF;
    IF NEW.status = 'entregue' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    IF NEW.status = 'cancelado' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_status_stamp ON public.orders;
CREATE TRIGGER orders_status_stamp
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change();

-- After paid: decrement stock + create financial entry (only once)
CREATE OR REPLACE FUNCTION public.after_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
  is_paid_now boolean;
  was_paid boolean;
BEGIN
  is_paid_now := NEW.status IN ('pago','enviado','entregue');
  was_paid := (TG_OP = 'UPDATE') AND (OLD.status IN ('pago','enviado','entregue'));

  IF is_paid_now AND NOT was_paid THEN
    -- Decrement stock for each item
    FOR it IN SELECT product_id, size, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      IF it.product_id IS NOT NULL THEN
        UPDATE public.product_sizes
           SET quantity = GREATEST(quantity - it.quantity, 0)
         WHERE product_id = it.product_id AND size = it.size;
      END IF;
    END LOOP;

    -- Create financial transaction (one per order)
    INSERT INTO public.transactions (store_id, type, description, category, value, payment_method, paid)
    VALUES (
      NEW.store_id, 'entrada',
      'Pedido #' || lpad(NEW.order_number::text, 4, '0'),
      'venda', NEW.total_value - COALESCE(NEW.discount,0),
      NEW.payment_method, true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_after_paid ON public.orders;
CREATE TRIGGER orders_after_paid
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.after_order_paid();
