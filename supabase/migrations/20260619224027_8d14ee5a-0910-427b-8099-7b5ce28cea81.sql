
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS image_url text;

-- Storage policies for product-photos bucket
DROP POLICY IF EXISTS "product-photos read own store" ON storage.objects;
DROP POLICY IF EXISTS "product-photos write own store" ON storage.objects;
DROP POLICY IF EXISTS "product-photos update own store" ON storage.objects;
DROP POLICY IF EXISTS "product-photos delete own store" ON storage.objects;

CREATE POLICY "product-photos read own store" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = (public.current_store_id())::text);

CREATE POLICY "product-photos write own store" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = (public.current_store_id())::text);

CREATE POLICY "product-photos update own store" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = (public.current_store_id())::text)
  WITH CHECK (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = (public.current_store_id())::text);

CREATE POLICY "product-photos delete own store" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND (storage.foldername(name))[1] = (public.current_store_id())::text);
