
REVOKE EXECUTE ON FUNCTION public.create_transaction_for_sale()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_sale()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_number()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_status_change()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.after_order_paid()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_supplier_cost()      FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_store_id()              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(public.app_role)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_store_id()              TO authenticated;
