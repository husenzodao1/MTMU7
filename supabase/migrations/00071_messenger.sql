-- ============================================================================
-- 00071 · The chat, grown into a messenger.
--
--   1. Files and voice notes. A document or a recording is a message with a
--      path, like a photo (00067): one row, in the same private bucket, under
--      the same conversation, with its name, size and type beside it. Only
--      kinds of file a school sends — documents, tables, slides, archives,
--      sound and short video — never a program.
--
--   2. Reactions. One per person per message, as in the messenger everybody
--      knows: choosing another replaces it, choosing the same one again takes
--      it back. Written through one function that checks membership, read by
--      the members, and delivered live.
--
--   3. "Typing…". Nothing is stored: a private realtime channel per
--      conversation, which only its members may join.
--
--   4. A reply from the notification. The phone app and the browser can answer
--      a message without opening the portal; the portal's server, holding a
--      signed token from the push, writes it through the functions below,
--      which ask the same questions the guard asks of a signed-in sender.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Files and voice notes
-- ----------------------------------------------------------------------------
-- Twenty megabytes: a scanned document, a slide deck, a minute of video. The
-- list is what the composer sends; anything else — a program, a page of HTML,
-- a script — is refused by the bucket itself, whatever the browser claims.
UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation', 'application/rtf',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
      'application/x-7z-compressed',
      'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/x-m4a',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]
WHERE id = 'chat-media';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size int,
  ADD COLUMN IF NOT EXISTS media_mime varchar(120),
  ADD COLUMN IF NOT EXISTS media_duration int;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_check CHECK (
  CASE
    WHEN is_deleted THEN
      media_path IS NULL AND media_width IS NULL AND media_height IS NULL
      AND media_name IS NULL AND media_size IS NULL AND media_mime IS NULL AND media_duration IS NULL
    WHEN type = 'image' THEN
      media_path IS NOT NULL AND length(media_path) <= 300
      AND media_width BETWEEN 1 AND 10000 AND media_height BETWEEN 1 AND 10000
      AND media_name IS NULL AND media_duration IS NULL
    WHEN type = 'file' THEN
      media_path IS NOT NULL AND length(media_path) <= 300
      AND media_name IS NOT NULL AND char_length(media_name) BETWEEN 1 AND 200
      AND media_size BETWEEN 1 AND 20971520
      AND media_mime IS NOT NULL
      AND media_width IS NULL AND media_height IS NULL AND media_duration IS NULL
    WHEN type = 'audio' THEN
      media_path IS NOT NULL AND length(media_path) <= 300
      AND media_size BETWEEN 1 AND 20971520
      AND media_mime IS NOT NULL
      AND media_duration BETWEEN 0 AND 900
      AND media_width IS NULL AND media_height IS NULL AND media_name IS NULL
    ELSE
      media_path IS NULL AND media_width IS NULL AND media_height IS NULL
      AND media_name IS NULL AND media_size IS NULL AND media_mime IS NULL AND media_duration IS NULL
  END
);

-- The guard of 00067, taught about files and recordings: they too must be the
-- sender's own upload into this very conversation, and cannot be swapped.
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
    NEW.media_name := NULL;
    NEW.media_size := NULL;
    NEW.media_mime := NULL;
    NEW.media_duration := NULL;
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
    IF NEW.type IN ('image', 'file', 'audio') AND (
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
                             OR NEW.media_height IS DISTINCT FROM OLD.media_height
                             OR NEW.media_name IS DISTINCT FROM OLD.media_name
                             OR NEW.media_size IS DISTINCT FROM OLD.media_size
                             OR NEW.media_mime IS DISTINCT FROM OLD.media_mime
                             OR NEW.media_duration IS DISTINCT FROM OLD.media_duration)) THEN
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

-- What the conversation list and the bell say about it.
CREATE OR REPLACE FUNCTION app.on_message_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sender public.users%ROWTYPE;
  v_recipients uuid[];
  v_body text;
BEGIN
  SELECT * INTO v_sender FROM public.users WHERE id = NEW.sender_id;
  SELECT coalesce(array_agg(cm.user_id), ARRAY[]::uuid[]) INTO v_recipients
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id IS DISTINCT FROM NEW.sender_id AND NOT cm.is_muted;
  v_body := CASE NEW.type
    WHEN 'image' THEN btrim('📷 ' || left(NEW.content, 190))
    WHEN 'location' THEN btrim('📍 ' || left(NEW.content, 190))
    WHEN 'file' THEN btrim('📎 ' || left(coalesce(nullif(NEW.content, ''), NEW.media_name, ''), 190))
    WHEN 'audio' THEN '🎤'
    ELSE left(NEW.content, 200)
  END;
  PERFORM app.notify(v_recipients, NEW.school_id, 'message', 'messages', 'message.new',
    jsonb_build_object('sender', btrim(coalesce(v_sender.first_name, '') || ' ' || coalesce(v_sender.last_name, '')),
                       'conversation_id', NEW.conversation_id),
    '/messages/' || NEW.conversation_id::text, NULL, v_body, 'conversation:' || NEW.conversation_id::text);
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Reactions
-- ----------------------------------------------------------------------------
-- A row per person per message. Taking a reaction back clears its emoji rather
-- than deleting the row, so every change — added, changed, taken back — is an
-- insert or an update the conversation's members can be told about live
-- (realtime cannot filter deletes by conversation).
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  emoji text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id),
  -- An emoji, not a sentence: short, and no letters, digits, spaces or markup.
  CONSTRAINT message_reactions_emoji_check CHECK (
    emoji IS NULL OR (char_length(emoji) BETWEEN 1 AND 16 AND octet_length(emoji) <= 64
                      AND emoji !~ '[A-Za-z0-9<>&"''\\/[:space:]]')
  )
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation ON public.message_reactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_reactions_read ON public.message_reactions;
CREATE POLICY message_reactions_read ON public.message_reactions FOR SELECT TO authenticated
  USING (app.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS mfa_gate ON public.message_reactions;
CREATE POLICY mfa_gate ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));
REVOKE INSERT, UPDATE, DELETE ON public.message_reactions FROM anon, authenticated;
GRANT SELECT ON public.message_reactions TO authenticated;

/**
 * Reacts to a message, changes the reaction, or (with NULL or an empty
 * string) takes it back. Only a member of the conversation, only on a message
 * that is still there, and not across a block.
 */
CREATE OR REPLACE FUNCTION public.set_message_reaction(p_message_id uuid, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_msg record;
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
BEGIN
  SELECT m.id, m.conversation_id, m.school_id, m.sender_id, m.is_deleted, c.type AS conversation_type
  INTO v_msg
  FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id AND c.is_active
  WHERE m.id = p_message_id;
  IF NOT FOUND OR v_uid IS NULL THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT app.is_conversation_member(v_msg.conversation_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_msg.is_deleted THEN
    RAISE EXCEPTION 'deleted messages cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF v_msg.conversation_type = 'direct' AND v_msg.sender_id IS NOT NULL AND v_msg.sender_id <> v_uid
     AND app.is_blocked_between(v_uid, v_msg.sender_id) THEN
    RAISE EXCEPTION 'messaging_blocked' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.message_reactions (message_id, user_id, conversation_id, school_id, emoji)
  VALUES (v_msg.id, v_uid, v_msg.conversation_id, v_msg.school_id, v_emoji)
  ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, updated_at = now()
  WHERE public.message_reactions.emoji IS DISTINCT FROM EXCLUDED.emoji;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_message_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_message_reaction(uuid, text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public' AND tablename = 'message_reactions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions';
  END IF;
END;
$$;

-- The thread reads files, recordings and reactions back with everything else.
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
  location_lat numeric, location_lng numeric, media_path text, media_width int, media_height int,
  media_name text, media_size int, media_mime varchar, media_duration int, reactions jsonb
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
         m.media_path, m.media_width, m.media_height, m.media_name, m.media_size, m.media_mime, m.media_duration,
         CASE WHEN m.is_deleted THEN '[]'::jsonb ELSE coalesce((
           SELECT jsonb_agg(jsonb_build_object('user_id', r.user_id, 'emoji', r.emoji) ORDER BY r.updated_at)
           FROM public.message_reactions r WHERE r.message_id = m.id AND r.emoji IS NOT NULL
         ), '[]'::jsonb) END
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
-- 3. "Typing…"
-- ----------------------------------------------------------------------------
-- Private broadcast channels named chat:<conversation>. Joining one, and
-- saying anything on it, takes membership of that conversation.
CREATE OR REPLACE FUNCTION app.topic_conversation(p_topic text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := substring(coalesce(p_topic, '') FROM '^chat:([0-9a-f-]{36})$');
BEGIN
  IF v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.topic_conversation(text) TO authenticated;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS chat_members_listen ON realtime.messages';
    EXECUTE $p$CREATE POLICY chat_members_listen ON realtime.messages FOR SELECT TO authenticated USING (
      extension = 'broadcast' AND app.is_conversation_member(app.topic_conversation((SELECT realtime.topic())))
    )$p$;
    EXECUTE 'DROP POLICY IF EXISTS chat_members_speak ON realtime.messages';
    EXECUTE $p$CREATE POLICY chat_members_speak ON realtime.messages FOR INSERT TO authenticated WITH CHECK (
      extension = 'broadcast' AND app.is_conversation_member(app.topic_conversation((SELECT realtime.topic())))
    )$p$;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Answering from the notification
-- ----------------------------------------------------------------------------
-- The pushes carry what the reply needs to be addressed. The file name is
-- the preview of a file sent without a caption.
CREATE OR REPLACE FUNCTION public.claim_message_push(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg record;
  v_recipients uuid[];
  v_result jsonb;
BEGIN
  SELECT m.id, m.conversation_id, m.sender_id, m.school_id, m.type, m.content, m.media_name, m.created_at,
         c.type AS conversation_type, c.name AS conversation_name, c.created_by AS requester_id
  INTO v_msg
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id AND c.is_active
  WHERE m.id = p_message_id AND NOT m.is_deleted AND m.created_at > now() - interval '10 minutes';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.message_push_log (message_id) VALUES (p_message_id) ON CONFLICT (message_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT coalesce((SELECT ns.is_enabled FROM public.notification_settings ns
                   WHERE ns.school_id = v_msg.school_id AND ns.type = 'message'), true) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(cm.user_id), ARRAY[]::uuid[]) INTO v_recipients
  FROM public.conversation_members cm
  JOIN public.users u ON u.id = cm.user_id AND u.is_active AND u.status IN ('active', 'graduated')
  LEFT JOIN public.user_settings us ON us.user_id = cm.user_id
  WHERE cm.conversation_id = v_msg.conversation_id
    AND cm.user_id IS DISTINCT FROM v_msg.sender_id
    AND NOT cm.is_muted
    AND coalesce(us.notifications_enabled, true)
    AND coalesce((us.notification_types ->> 'message')::boolean, true)
    AND NOT EXISTS (SELECT 1 FROM public.message_deletions d WHERE d.message_id = v_msg.id AND d.user_id = cm.user_id);

  SELECT jsonb_build_object(
    'message_id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'conversation_type', v_msg.conversation_type,
    'conversation_name', v_msg.conversation_name,
    'requester_id', v_msg.requester_id,
    'sender_id', v_msg.sender_id,
    'type', v_msg.type,
    'preview', left(CASE WHEN v_msg.type = 'file' AND v_msg.content = '' THEN coalesce(v_msg.media_name, '') ELSE v_msg.content END, 160),
    'sender', (SELECT btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
               FROM public.users u WHERE u.id = v_msg.sender_id),
    'targets', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
                                          'auth', s.auth, 'locale', s.locale))
      FROM public.push_subscriptions s WHERE s.user_id = ANY (v_recipients)
    ), '[]'::jsonb),
    'devices', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', d.user_id, 'token', d.token, 'platform', d.platform, 'locale', d.locale))
      FROM public.device_tokens d WHERE d.user_id = ANY (v_recipients)
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_message_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_push(uuid) TO service_role;

/**
 * May this person still write here? The questions the guard and row level
 * security ask a signed-in sender, asked on behalf of somebody answering from
 * a notification: an active member of an active conversation in their own
 * school, with messaging (or their own support conversation), not blocked, and
 * not a reader of an announcement channel.
 */
CREATE OR REPLACE FUNCTION app.may_reply_as(p_user_id uuid, p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = p_user_id
    JOIN public.users u ON u.id = p_user_id AND u.school_id = c.school_id AND u.is_active AND u.status IN ('active', 'graduated')
    WHERE c.id = p_conversation_id AND c.is_active
      AND (c.type <> 'announcement' OR cm.role = 'admin')
      AND (c.type = 'support' OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id AND r.is_active
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id AND p.slug = 'messages.use'
        WHERE ur.user_id = p_user_id AND ur.school_id = c.school_id
      ))
      AND (c.type <> 'direct' OR NOT EXISTS (
        SELECT 1 FROM public.conversation_members other
        WHERE other.conversation_id = c.id AND other.user_id <> p_user_id
          AND app.is_blocked_between(p_user_id, other.user_id)
      ))
  )
$$;
REVOKE EXECUTE ON FUNCTION app.may_reply_as(uuid, uuid) FROM PUBLIC, anon, authenticated;

/** A reply typed into a notification. Returns the new message's id. */
CREATE OR REPLACE FUNCTION public.reply_from_notification(p_user_id uuid, p_conversation_id uuid, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_content text := btrim(coalesce(p_content, ''));
  v_school uuid;
  v_id uuid;
BEGIN
  IF v_content = '' OR char_length(v_content) > 5000 THEN
    RAISE EXCEPTION 'invalid_message' USING ERRCODE = '22023';
  END IF;
  IF NOT app.may_reply_as(p_user_id, p_conversation_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.school_id INTO v_school FROM public.conversations c WHERE c.id = p_conversation_id;
  INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type)
  VALUES (p_conversation_id, p_user_id, v_school, v_content, 'text')
  RETURNING id INTO v_id;
  -- Answering is reading.
  UPDATE public.conversation_members SET last_read_at = now()
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reply_from_notification(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reply_from_notification(uuid, uuid, text) TO service_role;

/** "Mark as read" on a notification. */
CREATE OR REPLACE FUNCTION public.read_from_notification(p_user_id uuid, p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members cm SET last_read_at = now()
  FROM public.conversations c, public.users u
  WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
    AND c.id = cm.conversation_id AND c.is_active
    AND u.id = p_user_id AND u.is_active AND u.school_id = c.school_id
  RETURNING true
$$;
REVOKE EXECUTE ON FUNCTION public.read_from_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_from_notification(uuid, uuid) TO service_role;
