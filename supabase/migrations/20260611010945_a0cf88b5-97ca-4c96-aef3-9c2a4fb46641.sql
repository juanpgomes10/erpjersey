
ALTER TYPE public.import_status ADD VALUE IF NOT EXISTS 'barrado_alfandega';

ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS order_numbers bigint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_tracking_update timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS carrier text;

-- Storage policies for import-photos bucket. Paths are scoped as: <store_id>/<filename>
CREATE POLICY "Import photos read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'import-photos'
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );

CREATE POLICY "Import photos insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'import-photos'
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );

CREATE POLICY "Import photos update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'import-photos'
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );

CREATE POLICY "Import photos delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'import-photos'
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );
