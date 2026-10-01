-- ============================================================================
-- 00028 · Storage buckets and object policies.
--
-- Object paths always start with the school id: <school_id>/<...>. Access to
-- protected objects follows the visibility of the database row that
-- references them (RLS on that row decides). Findings addressed: SEC-011,
-- spec §32, §66.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('public-media', 'public-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('library-covers', 'library-covers', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('library-files', 'library-files', false, 104857600, ARRAY['application/pdf', 'application/epub+zip', 'audio/mpeg']),
  ('documents', 'documents', false, 52428800, ARRAY[
    'application/pdf', 'application/msword', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png']),
  ('homework', 'homework', false, 26214400, ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- First path segment as a school id (NULL when malformed).
CREATE OR REPLACE FUNCTION app.object_school(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := split_part(p_name, '/', 1);
BEGIN
  IF v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND p_name NOT LIKE '%..%' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.object_school(text) TO anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname LIKE 'sp\_%' ESCAPE '\' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- avatars: <school>/<user>/<file>; public read by URL, owner writes
CREATE POLICY sp_avatars_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'avatars'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);
CREATE POLICY sp_avatars_owner ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'avatars' AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);
CREATE POLICY sp_avatars_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'avatars' AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);

-- public-media: website images (news covers, events, CMS, identity)
CREATE POLICY sp_public_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'public-media'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND (app.can(app.object_school(name), 'media.upload') OR app.can(app.object_school(name), 'cms.manage')
       OR app.can(app.object_school(name), 'news.create') OR app.can(app.object_school(name), 'events.manage'))
);
CREATE POLICY sp_public_media_read_managers ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'public-media' AND app.object_school(name) = (SELECT app.current_school_id())
);
CREATE POLICY sp_public_media_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'public-media' AND (app.can(app.object_school(name), 'media.manage') OR owner_id = (SELECT auth.uid())::text)
);

-- library covers and files follow library_items visibility
CREATE POLICY sp_library_read ON storage.objects FOR SELECT TO anon, authenticated USING (
  bucket_id IN ('library-covers', 'library-files')
  AND EXISTS (
    SELECT 1 FROM public.library_items i
    WHERE (bucket_id = 'library-covers' AND i.cover_url = name)
       OR (bucket_id = 'library-files' AND i.file_url = name)
  )
);
CREATE POLICY sp_library_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id IN ('library-covers', 'library-files')
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND (app.can(app.object_school(name), 'library.create') OR app.can(app.object_school(name), 'library.update'))
);
CREATE POLICY sp_library_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id IN ('library-covers', 'library-files')
  AND app.can(app.object_school(name), 'library.update')
);

-- documents follow documents / document_versions visibility
CREATE POLICY sp_documents_read ON storage.objects FOR SELECT TO anon, authenticated USING (
  bucket_id = 'documents'
  AND (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.storage_path = name)
    OR EXISTS (SELECT 1 FROM public.document_versions v WHERE v.storage_path = name)
  )
);
CREATE POLICY sp_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'documents'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND app.can(app.object_school(name), 'documents.create')
);

-- homework: uploads go to <school>/<uploader>/...; reads follow attachment rows
CREATE POLICY sp_homework_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'homework'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);
CREATE POLICY sp_homework_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'homework'
  AND (
    split_part(name, '/', 2) = (SELECT auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.homework_attachments h WHERE h.storage_path = name)
  )
);
CREATE POLICY sp_homework_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'homework' AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  AND NOT EXISTS (SELECT 1 FROM public.homework_attachments h WHERE h.storage_path = name)
);
