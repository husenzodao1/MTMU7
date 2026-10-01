-- ============================================================================
-- 00067 · A picture in a conversation, and a face behind a name.
--
--   1. Photos in chat. A photo is a message with a path, the way a place is a
--      message with coordinates (00063): one row, so realtime delivers the
--      whole thing at once and nobody sees a bubble waiting for its picture.
--      The file lives in a private bucket, under the conversation it was sent
--      to, and only that conversation's members can open it. The browser
--      shrinks it before it leaves the phone, which also drops the camera's
--      location data from it.
--
--   2. A member card: what anybody in the school may see about somebody they
--      are talking to — name, photo, nickname, what they do here, and a
--      pupil's class — in one call.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The bucket
-- ----------------------------------------------------------------------------
-- Private: a photo sent to a class chat is not a photo on the website. Eight
-- megabytes is far above what the shrunken image weighs; it is there for the
-- browser that could not shrink it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('chat-media', 'chat-media', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- <school>/<conversation>/<uploader>/<file>. The second segment as a uuid, or
-- NULL when the path is not shaped like one of ours.
CREATE OR REPLACE FUNCTION app.object_conversation(p_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := split_part(p_name, '/', 2);
BEGIN
  IF v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND p_name NOT LIKE '%..%' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.object_conversation(text) TO authenticated;

DROP POLICY IF EXISTS sp_chat_media_insert ON storage.objects;
CREATE POLICY sp_chat_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-media'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND split_part(name, '/', 3) = (SELECT auth.uid())::text
  AND app.is_conversation_member(app.object_conversation(name))
);
DROP POLICY IF EXISTS sp_chat_media_read ON storage.objects;
CREATE POLICY sp_chat_media_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-media' AND app.is_conversation_member(app.object_conversation(name))
);
DROP POLICY IF EXISTS sp_chat_media_delete ON storage.objects;
CREATE POLICY sp_chat_media_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chat-media' AND split_part(name, '/', 3) = (SELECT auth.uid())::text
);

-- ----------------------------------------------------------------------------
-- 2. The message carries the picture
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_width int,
  ADD COLUMN IF NOT EXISTS media_height int;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_check CHECK (
  CASE
    WHEN type = 'image' AND NOT is_deleted THEN
      media_path IS NOT NULL AND length(media_path) <= 300
      AND media_width BETWEEN 1 AND 10000 AND media_height BETWEEN 1 AND 10000
    ELSE media_path IS NULL AND media_width IS NULL AND media_height IS NULL
  END
);

-- The guard of 00065, taught about pictures: a photo must be one the sender
-- uploaded into this very conversation, and it cannot be swapped afterwards.
-- Deleting the message lets go of it along with the words.
CREATE OR REPLACE FUNCTION app.guard_message_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_conv public.conversations%ROWTYPE;
  v_other uuid;
  v_deleting boolean := TG_OP = 'UPDATE' AND NEW.is_deleted AND NOT OLD.is_deleted;
BEGIN
  IF v_deleting THEN
    NEW.location_lat := NULL;
    NEW.location_lng := NULL;
    NEW.media_path := NULL;
    NEW.media_width := NULL;
    NEW.media_height := NULL;
  END IF;
  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF v_conv.type = 'announcement' AND NOT EXISTS (
      SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id = NEW.sender_id AND cm.role = 'admin') THEN
      RAISE EXCEPTION 'only channel administrators can post here' USING ERRCODE = '42501';
    END IF;
    IF v_conv.type = 'direct' THEN
      SELECT cm.user_id INTO v_other FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id <> NEW.sender_id LIMIT 1;
      IF v_other IS NOT NULL AND app.is_blocked_between(NEW.sender_id, v_other) THEN
        RAISE EXCEPTION 'messaging_blocked' USING ERRCODE = '42501';
      END IF;
    END IF;
    NEW.type := CASE WHEN NEW.type IN ('text', 'file', 'image', 'audio', 'location') THEN NEW.type ELSE 'text' END;
    IF NEW.type = 'image' AND (
      NEW.media_path IS NULL
      OR NEW.media_path NOT LIKE NEW.school_id::text || '/' || NEW.conversation_id::text || '/' || NEW.sender_id::text || '/%'
      OR NEW.media_path LIKE '%..%'
    ) THEN
      RAISE EXCEPTION 'invalid_media' USING ERRCODE = '22023';
    END IF;
    NEW.is_pinned := false;
    NEW.is_edited := false;
    NEW.is_deleted := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.messages m WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id) THEN
      RAISE EXCEPTION 'reply must reference a message in the same conversation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR (NOT v_deleting AND (NEW.location_lat IS DISTINCT FROM OLD.location_lat
                             OR NEW.location_lng IS DISTINCT FROM OLD.location_lng
                             OR NEW.media_path IS DISTINCT FROM OLD.media_path
                             OR NEW.media_width IS DISTINCT FROM OLD.media_width
                             OR NEW.media_height IS DISTINCT FROM OLD.media_height)) THEN
    RAISE EXCEPTION 'protected message field cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_deleted THEN
    RAISE EXCEPTION 'deleted messages cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF v_deleting THEN
    NEW.deleted_at := now();
    NEW.deleted_by := (SELECT auth.uid());
    NEW.content := '';
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    IF OLD.created_at < now() - interval '48 hours' THEN
      RAISE EXCEPTION 'messages can only be edited within 48 hours' USING ERRCODE = '42501';
    END IF;
    NEW.is_edited := true;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- The thread reads the picture back with everything else.
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, timestamptz, uuid, int);
CREATE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid, conversation_id uuid, sender_id uuid, sender_first_name varchar, sender_last_name varchar,
  sender_avatar_url varchar, content text, type varchar, reply_to_id uuid, is_pinned boolean,
  is_edited boolean, is_deleted boolean, is_favorite boolean, created_at timestamptz, edited_at timestamptz,
  location_lat numeric, location_lng numeric, media_path text, media_width int, media_height int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.id, m.conversation_id, m.sender_id, u.first_name, u.last_name, u.avatar_url,
         CASE WHEN m.is_deleted THEN '' ELSE m.content END, m.type, m.reply_to_id, m.is_pinned,
         m.is_edited, m.is_deleted,
         EXISTS (SELECT 1 FROM public.message_favorites f WHERE f.message_id = m.id AND f.user_id = (SELECT auth.uid())),
         m.created_at, m.edited_at,
         CASE WHEN m.is_deleted THEN NULL ELSE m.location_lat END,
         CASE WHEN m.is_deleted THEN NULL ELSE m.location_lng END,
         CASE WHEN m.is_deleted THEN NULL ELSE m.media_path END,
         CASE WHEN m.is_deleted THEN NULL ELSE m.media_width END,
         CASE WHEN m.is_deleted THEN NULL ELSE m.media_height END
  FROM public.messages m
  LEFT JOIN public.users u ON u.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (p_before_created_at IS NULL OR (m.created_at, m.id) < (p_before_created_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    AND NOT EXISTS (SELECT 1 FROM public.message_deletions d WHERE d.message_id = m.id AND d.user_id = (SELECT auth.uid()))
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
REVOKE EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, uuid, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. The member card
-- ----------------------------------------------------------------------------
/**
 * What a member of the school may see about another member of the same
 * school: the directory already shows the name and the photo (00023), and
 * this adds only what anybody standing in the corridor would know — what they
 * do here, a pupil's class, a teacher's subjects this year, and the nickname
 * they chose to be found by. Nothing about marks, contacts or family.
 */
CREATE OR REPLACE FUNCTION public.get_member_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_user public.users%ROWTYPE;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM public.users u
  WHERE u.id = p_user_id AND u.school_id = v_school AND u.is_active AND u.status IN ('active', 'graduated');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'first_name', v_user.first_name,
    'last_name', v_user.last_name,
    'middle_name', v_user.middle_name,
    'avatar_url', v_user.avatar_url,
    'nickname', v_user.nickname,
    'status', v_user.status,
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      WHERE ur.user_id = v_user.id AND ur.school_id = v_school
    ), '[]'::jsonb),
    'class', (
      SELECT c.name FROM public.students s
      JOIN public.enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN public.academic_years y ON y.id = e.academic_year_id AND y.is_current
      JOIN public.classes c ON c.id = e.class_id
      WHERE s.user_id = v_user.id
      LIMIT 1
    ),
    'subjects', coalesce((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('tg', sj.name_tg, 'ru', sj.name_ru, 'en', sj.name_en))
      FROM public.staff st
      JOIN public.class_subjects cs ON cs.teacher_id = st.id AND cs.is_active
      JOIN public.classes c ON c.id = cs.class_id
      JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
      JOIN public.subjects sj ON sj.id = cs.subject_id
      WHERE st.user_id = v_user.id
    ), '[]'::jsonb),
    'homeroom', (
      SELECT c.name FROM public.staff st
      JOIN public.classes c ON c.homeroom_staff_id = st.id
      JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
      WHERE st.user_id = v_user.id
      LIMIT 1
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_card(uuid) TO authenticated;
