-- ============================================================================
-- 00094 · The messenger, grown into a small social network.
--
--   1. Delivered, then read. A message now has three states after it leaves
--      the sender's phone: on the server (one tick), on the other person's
--      phone or browser (two grey ticks), read (two coloured ticks). The
--      portal reports "it has reached me" for every conversation at once
--      whenever it opens, comes back to the screen or is told of a new
--      message; opening the conversation is reading it, which is reaching it.
--
--   2. Last seen. The same report keeps one row per person: when they last
--      had the portal open. Shown under the name of somebody one shares a
--      conversation with, and to nobody else.
--
--   3. Channels. A person's own channel: one conversation where only its
--      owner (and the admins they make) post, and anybody in the school may
--      follow. Found through a list of the school's channels, followed and
--      left in a tap, closed by its owner.
--
--   4. Stories. A photo or a few words that stay for a day, seen by the people
--      one shares a conversation with, with who saw them for the author.
--
-- Run again, it changes nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Delivered, then read
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS last_delivered_at timestamptz;
-- A channel's line under its name (section 3), read by the list below.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_description_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_description_check
  CHECK (description IS NULL OR char_length(description) <= 500);

-- ----------------------------------------------------------------------------
-- 2. Last seen
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_presence_school ON public.user_presence(school_id);

/** Do the caller and this person share a conversation (not a school-wide notice board)? */
CREATE OR REPLACE FUNCTION app.shares_conversation_with(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members mine
    JOIN public.conversation_members theirs ON theirs.conversation_id = mine.conversation_id AND theirs.user_id = p_other
    JOIN public.conversations c ON c.id = mine.conversation_id AND c.is_active
      AND c.type NOT IN ('announcement', 'support')
    WHERE mine.user_id = (SELECT auth.uid())
  )
$$;
REVOKE EXECUTE ON FUNCTION app.shares_conversation_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.shares_conversation_with(uuid) TO authenticated;

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_presence_read ON public.user_presence;
CREATE POLICY user_presence_read ON public.user_presence FOR SELECT TO authenticated USING (
  school_id = (SELECT app.current_school_id())
  AND (user_id = (SELECT auth.uid()) OR app.shares_conversation_with(user_id))
);
DROP POLICY IF EXISTS mfa_gate ON public.user_presence;
CREATE POLICY mfa_gate ON public.user_presence AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));
REVOKE INSERT, UPDATE, DELETE ON public.user_presence FROM anon, authenticated;
GRANT SELECT ON public.user_presence TO authenticated;

/**
 * "I am here, and everything sent to me so far has reached me." Called by the
 * portal when it opens, when it comes back to the screen and when it is told
 * of a new message. Touches only the caller's own rows, and a membership row
 * only when something new has arrived there, so a quiet portal writes one row.
 * Returns how many conversations moved to "delivered".
 */
CREATE OR REPLACE FUNCTION public.touch_messenger()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_count int := 0;
BEGIN
  IF v_uid IS NULL OR v_school IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.user_presence (user_id, school_id, last_seen_at)
  VALUES (v_uid, v_school, now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now(), school_id = EXCLUDED.school_id;

  UPDATE public.conversation_members cm SET last_delivered_at = now()
  WHERE cm.user_id = v_uid
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = cm.conversation_id
        AND m.sender_id IS DISTINCT FROM v_uid
        AND m.created_at > coalesce(greatest(cm.last_delivered_at, cm.last_read_at), '-infinity'::timestamptz)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.touch_messenger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_messenger() TO authenticated;

-- Reading is reaching: opening a conversation moves both marks.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members SET last_read_at = now(), last_delivered_at = now()
  WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_from_notification(p_user_id uuid, p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members cm SET last_read_at = now(), last_delivered_at = now()
  FROM public.conversations c, public.users u
  WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
    AND c.id = cm.conversation_id AND c.is_active
    AND u.id = p_user_id AND u.is_active AND u.school_id = c.school_id
  RETURNING true
$$;
REVOKE EXECUTE ON FUNCTION public.read_from_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_from_notification(uuid, uuid) TO service_role;

-- The conversation list says, for the last message, whether the others have
-- it and whether they have read it — the moment the last of them caught up,
-- as the thread does (thread.tsx): in a group, a mark that appeared when the
-- first of thirty looked would say something untrue. The support desk is one
-- side however many staff it: the person asking is read once anybody at the
-- desk has read them, and the desk once the person asking has.
DROP FUNCTION IF EXISTS public.list_my_conversations(int);
CREATE FUNCTION public.list_my_conversations(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, type varchar, name varchar, avatar_url varchar, updated_at timestamptz, is_muted boolean,
  last_message_content text, last_message_sender_id uuid, last_message_at timestamptz, last_message_deleted boolean,
  unread_count bigint, members jsonb, created_by uuid, last_message_type varchar,
  description text, my_role varchar, member_count bigint, peer_read_at timestamptz, peer_delivered_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT c.id, c.type, c.name, c.avatar_url, c.updated_at, me.is_muted,
         CASE WHEN lm.is_deleted THEN '' ELSE lm.content END, lm.sender_id, lm.created_at, lm.is_deleted,
         (SELECT count(*) FROM public.messages x
          WHERE x.conversation_id = c.id AND x.sender_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT x.is_deleted
            AND x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)),
         (SELECT jsonb_agg(jsonb_build_object('user_id', u.id, 'first_name', u.first_name, 'last_name', u.last_name,
                                              'avatar_url', u.avatar_url, 'role', cm.role) ORDER BY cm.joined_at)
          FROM (SELECT * FROM public.conversation_members cm2 WHERE cm2.conversation_id = c.id ORDER BY cm2.joined_at LIMIT 6) cm
          LEFT JOIN public.users u ON u.id = cm.user_id),
         c.created_by,
         lm.type,
         c.description,
         me.role,
         peer.members,
         peer.read_at,
         peer.delivered_at
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at, m.is_deleted, m.type FROM public.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) + 1 AS members,
      CASE
        WHEN c.type = 'support' AND c.created_by = (SELECT auth.uid()) THEN max(o.last_read_at)
        WHEN c.type = 'support' THEN max(o.last_read_at) FILTER (WHERE o.user_id = c.created_by)
        WHEN count(*) FILTER (WHERE o.last_read_at IS NULL) > 0 THEN NULL
        ELSE min(o.last_read_at)
      END AS read_at,
      CASE
        WHEN c.type = 'support' AND c.created_by = (SELECT auth.uid()) THEN max(greatest(o.last_delivered_at, o.last_read_at))
        WHEN c.type = 'support' THEN max(greatest(o.last_delivered_at, o.last_read_at)) FILTER (WHERE o.user_id = c.created_by)
        WHEN count(*) FILTER (WHERE o.last_delivered_at IS NULL AND o.last_read_at IS NULL) > 0 THEN NULL
        ELSE min(greatest(o.last_delivered_at, o.last_read_at))
      END AS delivered_at
    FROM public.conversation_members o
    WHERE o.conversation_id = c.id AND o.user_id <> (SELECT auth.uid())
  ) peer ON true
  WHERE c.is_active
  ORDER BY coalesce(lm.created_at, c.updated_at) DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_conversations(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Channels
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('direct', 'group', 'class_group', 'announcement', 'support', 'channel'));

-- Only a channel's admins post in it, as in an announcement channel.
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
    IF v_conv.type IN ('announcement', 'channel') AND NOT EXISTS (
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

-- Nor does a follower answer a channel's post from its notification.
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
      AND (c.type NOT IN ('announcement', 'channel') OR cm.role = 'admin')
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

/**
 * Opens a channel of one's own. Whoever may start a group may open a channel:
 * staff, and pupils where the school allows them groups. Five open channels
 * a person at most.
 */
CREATE OR REPLACE FUNCTION public.create_channel(p_name text, p_description text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_conv uuid;
BEGIN
  IF v_uid IS NULL OR v_school IS NULL OR NOT app.has_own_permission('messages.use') THEN
    RAISE EXCEPTION 'messaging_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT app.is_staff_member() AND NOT app.school_setting_bool(v_school, 'messaging_students_create_groups', false) THEN
    RAISE EXCEPTION 'channel_creation_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_channel_name' USING ERRCODE = '22023';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'invalid_channel_description' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.conversations c
      WHERE c.created_by = v_uid AND c.type = 'channel' AND c.is_active) >= 5 THEN
    RAISE EXCEPTION 'too_many_channels' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.conversations (school_id, type, name, description, created_by)
  VALUES (v_school, 'channel', v_name, v_description, v_uid) RETURNING id INTO v_conv;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  VALUES (v_conv, v_uid, v_school, 'admin');
  RETURN v_conv;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_channel(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_channel(text, text) TO authenticated;

/** The channel's name and the line under it, by one of its admins. */
CREATE OR REPLACE FUNCTION public.update_channel(p_conversation_id uuid, p_name text, p_description text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
BEGIN
  IF NOT app.is_conversation_admin(p_conversation_id)
     OR NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'channel' AND c.is_active) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_channel_name' USING ERRCODE = '22023';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'invalid_channel_description' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversations SET name = v_name, description = v_description WHERE id = p_conversation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_channel(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_channel(uuid, text, text) TO authenticated;

/**
 * The school's open channels, for somebody looking for one to follow: the
 * channels they follow or run first, then the busiest. `p_query` narrows by
 * name.
 */
CREATE OR REPLACE FUNCTION public.list_school_channels(p_query text DEFAULT NULL, p_limit int DEFAULT 60)
RETURNS TABLE (
  id uuid, name varchar, description text, avatar_url varchar, created_by uuid,
  owner_first_name varchar, owner_last_name varchar, owner_avatar_url varchar,
  followers bigint, is_member boolean, is_admin boolean, last_post_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, c.name, c.description, c.avatar_url, c.created_by,
         o.first_name, o.last_name, o.avatar_url,
         (SELECT count(*) FROM public.conversation_members cm WHERE cm.conversation_id = c.id),
         EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = (SELECT auth.uid())),
         EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'),
         (SELECT max(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id AND NOT m.is_deleted)
  FROM public.conversations c
  LEFT JOIN public.users o ON o.id = c.created_by
  WHERE c.type = 'channel' AND c.is_active
    AND c.school_id = (SELECT app.current_school_id())
    AND (SELECT app.has_own_permission('messages.use'))
    AND (c.created_by IS NULL OR NOT app.is_blocked_between((SELECT auth.uid()), c.created_by))
    AND (coalesce(btrim(p_query), '') = '' OR c.name ILIKE '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ORDER BY 10 DESC, 9 DESC, c.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
REVOKE EXECUTE ON FUNCTION public.list_school_channels(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_school_channels(text, int) TO authenticated;

/** Follows a channel of one's own school. Following twice changes nothing. */
CREATE OR REPLACE FUNCTION public.join_channel(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL OR v_school IS NULL OR NOT app.has_own_permission('messages.use') THEN
    RAISE EXCEPTION 'messaging_not_allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.created_by INTO v_owner FROM public.conversations c
  WHERE c.id = p_conversation_id AND c.type = 'channel' AND c.is_active AND c.school_id = v_school;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner IS NOT NULL AND app.is_blocked_between(v_uid, v_owner) THEN
    RAISE EXCEPTION 'messaging_blocked' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role, last_read_at, last_delivered_at)
  VALUES (p_conversation_id, v_uid, v_school, 'member', now(), now())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_channel(uuid) TO authenticated;

-- Leaving. A group left without an admin gets its longest-standing member as
-- one; a channel left by the last of its admins closes instead — its
-- followers did not sign up to run it.
CREATE OR REPLACE FUNCTION public.remove_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_conv public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT app.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id <> v_uid AND (v_conv.type = 'direct' OR NOT app.is_conversation_admin(p_conversation_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.conversation_members WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  IF v_conv.type <> 'direct' AND NOT EXISTS (
    SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id AND role = 'admin') THEN
    IF v_conv.type = 'channel' THEN
      UPDATE public.conversations SET is_active = false WHERE id = p_conversation_id;
    ELSE
      UPDATE public.conversation_members SET role = 'admin'
      WHERE id = (SELECT id FROM public.conversation_members WHERE conversation_id = p_conversation_id ORDER BY joined_at LIMIT 1);
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_conversation_member(uuid, uuid) TO authenticated;

/** Closes a channel, by one of its admins. Its posts go with it. */
CREATE OR REPLACE FUNCTION public.close_channel(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.is_conversation_admin(p_conversation_id)
     OR NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'channel' AND c.is_active) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conversations SET is_active = false WHERE id = p_conversation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.close_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_channel(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Stories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind varchar(10) NOT NULL,
  media_path text,
  media_width int,
  media_height int,
  caption text NOT NULL DEFAULT '',
  background varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  CONSTRAINT stories_kind_check CHECK (kind IN ('image', 'text')),
  CONSTRAINT stories_caption_check CHECK (char_length(caption) <= 700),
  CONSTRAINT stories_background_check CHECK (background IS NULL OR background IN ('ember', 'night', 'brass', 'sea', 'leaf', 'plum')),
  CONSTRAINT stories_shape_check CHECK (
    (kind = 'image' AND media_path IS NOT NULL AND length(media_path) <= 300
      AND media_width BETWEEN 1 AND 10000 AND media_height BETWEEN 1 AND 10000)
    OR (kind = 'text' AND media_path IS NULL AND media_width IS NULL AND media_height IS NULL
      AND char_length(btrim(caption)) >= 1)
  )
);
CREATE INDEX IF NOT EXISTS idx_stories_school_live ON public.stories(school_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_author ON public.stories(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON public.story_views(viewer_id);

/** May the caller see this person's stories: their own, or somebody they share a conversation with. */
CREATE OR REPLACE FUNCTION app.can_see_stories_of(p_author uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_author = (SELECT auth.uid())
    OR (NOT app.is_blocked_between((SELECT auth.uid()), p_author) AND app.shares_conversation_with(p_author))
$$;
REVOKE EXECUTE ON FUNCTION app.can_see_stories_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.can_see_stories_of(uuid) TO authenticated;

-- A story is the author's own, in their own school, for a day from now — not
-- for whatever the browser says — and its photo is the author's own upload.
CREATE OR REPLACE FUNCTION app.guard_story_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'stories cannot be changed' USING ERRCODE = '42501';
  END IF;
  NEW.created_at := now();
  NEW.expires_at := now() + interval '24 hours';
  IF NEW.kind = 'image' AND (
    NEW.media_path NOT LIKE NEW.school_id::text || '/' || NEW.author_id::text || '/%' OR NEW.media_path LIKE '%..%'
  ) THEN
    RAISE EXCEPTION 'invalid_media' USING ERRCODE = '22023';
  END IF;
  IF NEW.kind = 'image' THEN
    NEW.background := NULL;
  END IF;
  IF (SELECT count(*) FROM public.stories s WHERE s.author_id = NEW.author_id AND s.created_at > now() - interval '24 hours') >= 30 THEN
    RAISE EXCEPTION 'too_many_stories' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_a_guard_story_write ON public.stories;
CREATE TRIGGER trg_a_guard_story_write BEFORE INSERT OR UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION app.guard_story_write();

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stories_read ON public.stories;
CREATE POLICY stories_read ON public.stories FOR SELECT TO authenticated USING (
  school_id = (SELECT app.current_school_id())
  AND (author_id = (SELECT auth.uid()) OR (expires_at > now() AND app.can_see_stories_of(author_id)))
);
DROP POLICY IF EXISTS stories_insert ON public.stories;
CREATE POLICY stories_insert ON public.stories FOR INSERT TO authenticated WITH CHECK (
  author_id = (SELECT auth.uid())
  AND school_id = (SELECT app.current_school_id())
  AND (SELECT app.has_own_permission('messages.use'))
);
DROP POLICY IF EXISTS stories_delete ON public.stories;
CREATE POLICY stories_delete ON public.stories FOR DELETE TO authenticated USING (
  school_id = (SELECT app.current_school_id())
  AND (author_id = (SELECT auth.uid()) OR (SELECT app.has_own_permission('messages.moderate')))
);
DROP POLICY IF EXISTS mfa_gate ON public.stories;
CREATE POLICY mfa_gate ON public.stories AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));
REVOKE UPDATE ON public.stories FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.stories TO authenticated;

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS story_views_read ON public.story_views;
CREATE POLICY story_views_read ON public.story_views FOR SELECT TO authenticated USING (
  viewer_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.author_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS mfa_gate ON public.story_views;
CREATE POLICY mfa_gate ON public.story_views AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));
REVOKE INSERT, UPDATE, DELETE ON public.story_views FROM anon, authenticated;
GRANT SELECT ON public.story_views TO authenticated;

/** "I have seen it." Only a story the caller may see, and not their own. */
CREATE OR REPLACE FUNCTION public.view_story(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_story record;
BEGIN
  SELECT s.id, s.author_id, s.school_id INTO v_story FROM public.stories s
  WHERE s.id = p_story_id AND s.expires_at > now();
  IF NOT FOUND OR v_uid IS NULL OR v_story.school_id IS DISTINCT FROM app.current_school_id()
     OR NOT app.can_see_stories_of(v_story.author_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_story.author_id = v_uid THEN
    RETURN;
  END IF;
  INSERT INTO public.story_views (story_id, viewer_id) VALUES (p_story_id, v_uid)
  ON CONFLICT (story_id, viewer_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.view_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.view_story(uuid) TO authenticated;

/**
 * The row of stories at the top of the messages: one entry per person with
 * something posted in the last day — the caller first, then whoever has
 * something not yet seen, newest first, then the rest. Each carries its
 * stories oldest first, which ones were seen, and for the caller's own, how
 * many have seen each.
 */
CREATE OR REPLACE FUNCTION public.get_story_feed()
RETURNS TABLE (
  author_id uuid, first_name varchar, last_name varchar, avatar_url varchar,
  is_me boolean, all_seen boolean, latest_at timestamptz, stories jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH live AS (
    SELECT s.*
    FROM public.stories s
    WHERE s.school_id = (SELECT app.current_school_id())
      AND s.expires_at > now()
      AND (SELECT app.has_own_permission('messages.use'))
      AND app.can_see_stories_of(s.author_id)
  ),
  marked AS (
    SELECT l.*,
           EXISTS (SELECT 1 FROM public.story_views v WHERE v.story_id = l.id AND v.viewer_id = (SELECT auth.uid())) AS seen,
           CASE WHEN l.author_id = (SELECT auth.uid())
                THEN (SELECT count(*) FROM public.story_views v WHERE v.story_id = l.id) END AS views
    FROM live l
  )
  SELECT m.author_id, u.first_name, u.last_name, u.avatar_url,
         m.author_id = (SELECT auth.uid()),
         bool_and(m.seen OR m.author_id = (SELECT auth.uid())),
         max(m.created_at),
         jsonb_agg(jsonb_build_object(
           'id', m.id, 'kind', m.kind, 'media_path', m.media_path, 'media_width', m.media_width,
           'media_height', m.media_height, 'caption', m.caption, 'background', m.background,
           'created_at', m.created_at, 'seen', m.seen, 'views', m.views
         ) ORDER BY m.created_at)
  FROM marked m
  JOIN public.users u ON u.id = m.author_id AND u.is_active
  GROUP BY m.author_id, u.first_name, u.last_name, u.avatar_url
  ORDER BY 5 DESC, 6 ASC, 7 DESC
  LIMIT 100
$$;
REVOKE EXECUTE ON FUNCTION public.get_story_feed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_story_feed() TO authenticated;

/** Who has seen one of the caller's own stories, latest first. */
CREATE OR REPLACE FUNCTION public.get_story_viewers(p_story_id uuid)
RETURNS TABLE (user_id uuid, first_name varchar, last_name varchar, avatar_url varchar, viewed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.first_name, u.last_name, u.avatar_url, v.viewed_at
  FROM public.story_views v
  JOIN public.stories s ON s.id = v.story_id AND s.author_id = (SELECT auth.uid())
  JOIN public.users u ON u.id = v.viewer_id
  WHERE v.story_id = p_story_id
  ORDER BY v.viewed_at DESC
  LIMIT 500
$$;
REVOKE EXECUTE ON FUNCTION public.get_story_viewers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_story_viewers(uuid) TO authenticated;

/**
 * The caller's own stories that ended more than a day ago, let go of; returns
 * the photos they leave behind, which the browser then removes from the
 * bucket (SQL may not delete storage objects itself).
 */
CREATE OR REPLACE FUNCTION public.forget_old_stories()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.stories s
  WHERE s.author_id = (SELECT auth.uid()) AND s.expires_at < now() - interval '1 day'
  RETURNING s.media_path
$$;
REVOKE EXECUTE ON FUNCTION public.forget_old_stories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forget_old_stories() TO authenticated;

-- The photos: <school>/<author>/<file>, in a private bucket of their own.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('stories', 'stories', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

/** The second segment of an object's name as a uuid: the author of a story's photo. */
CREATE OR REPLACE FUNCTION app.object_owner(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := split_part(p_name, '/', 2);
BEGIN
  IF v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND p_name NOT LIKE '%..%' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.object_owner(text) TO authenticated;

DROP POLICY IF EXISTS sp_stories_insert ON storage.objects;
CREATE POLICY sp_stories_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'stories'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  AND (SELECT app.has_own_permission('messages.use'))
);
DROP POLICY IF EXISTS sp_stories_read ON storage.objects;
CREATE POLICY sp_stories_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'stories'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND app.can_see_stories_of(app.object_owner(name))
);
DROP POLICY IF EXISTS sp_stories_delete ON storage.objects;
CREATE POLICY sp_stories_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'stories' AND split_part(name, '/', 2) = (SELECT auth.uid())::text
);
