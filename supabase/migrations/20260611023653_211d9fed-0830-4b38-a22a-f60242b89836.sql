
-- Avatars: anyone authenticated can read; user manages their own folder
CREATE POLICY "Avatars are readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Store logos: anyone authenticated in store can read; admins of the store manage
CREATE POLICY "Store logos readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'store-logos');

CREATE POLICY "Admins upload store logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND public.has_role('admin')
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );

CREATE POLICY "Admins update store logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.has_role('admin')
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );

CREATE POLICY "Admins delete store logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND public.has_role('admin')
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );
