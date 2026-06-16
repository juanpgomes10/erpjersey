
-- Restrict avatar reads to same-store members
DROP POLICY IF EXISTS "Avatars are readable by authenticated" ON storage.objects;
CREATE POLICY "Avatars readable by same-store members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.store_id = public.current_store_id()
      )
    )
  );

-- Restrict store-logo reads to same-store members
DROP POLICY IF EXISTS "Store logos readable by authenticated" ON storage.objects;
CREATE POLICY "Store logos readable by same-store members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = (public.current_store_id())::text
  );

-- Make current_store_id deterministic with LIMIT 1
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;
