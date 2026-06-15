
-- 1) Prevent privilege escalation via self-update on profiles
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
  );

-- 2) Revoke EXECUTE from anon/authenticated on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_order_number() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_order_status_change() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.after_order_paid() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_transaction_for_sale() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_sale() FROM anon, authenticated, PUBLIC;

-- Internal helpers: revoke from anon (public), keep authenticated only
REVOKE EXECUTE ON FUNCTION public.current_store_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(app_role) TO authenticated;
