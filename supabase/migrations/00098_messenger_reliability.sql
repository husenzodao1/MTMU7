-- ============================================================================
-- 00098 — The messenger, made dependable
--
-- 1. Read up to a point. "Read" used to mean "read up to the server's now",
--    which also took in a message that arrived a moment before the mark and
--    was never on the screen. The app now says up to which message it
--    showed, and the mark never goes backwards: a late or repeated request
--    cannot undo a later one (thread.tsx, read-queue.ts).
-- 2. Pinned conversations, per person (pinned_at).
-- 3. "Delete chat" for oneself (cleared_at): the conversation leaves one's
--    own list and its history up to that moment is no longer shown to one;
--    the others keep everything, and a new message brings it back. This is
--    the per-message "delete for me" (message_deletions), for a whole chat.
--
-- Additive only: two nullable columns and new or replaced functions.
-- ============================================================================

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

-- ----------------------------------------------------------------------------
-- 1. Read up to a message, never backwards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid, p_up_to timestamptz)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members
  SET last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), least(coalesce(p_up_to, now()), now())),
      last_delivered_at = greatest(coalesce(last_delivered_at, '-infinity'::timestamptz), least(coalesce(p_up_to, now()), now()))
  WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
  RETURNING last_read_at
$$;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, timestamptz) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Pin and unpin, for oneself
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_conversation_pinned(p_conversation_id uuid, p_pinned boolean)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members
  SET pinned_at = CASE WHEN p_pinned THEN coalesce(pinned_at, now()) ELSE NULL END
  WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
  RETURNING pinned_at
$$;
REVOKE EXECUTE ON FUNCTION public.set_conversation_pinned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_pinned(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Delete a chat for oneself, as of the moment it was deleted (the app may
--    tell the server later, having had no line): what came after stays.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_conversation_for_me(p_conversation_id uuid, p_up_to timestamptz DEFAULT NULL)
RETURNS timestamptz
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversation_members
  SET cleared_at = greatest(coalesce(cleared_at, '-infinity'::timestamptz), least(coalesce(p_up_to, now()), now())),
      last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), least(coalesce(p_up_to, now()), now())),
      pinned_at = NULL
  WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
  RETURNING cleared_at
$$;
REVOKE EXECUTE ON FUNCTION public.clear_conversation_for_me(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_conversation_for_me(uuid, timestamptz) TO authenticated;

-- ----------------------------------------------------------------------------
-- The list: pinned first, a deleted chat gone until something new is said,
-- its preview and count only from what came after.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_my_conversations(int);
CREATE FUNCTION public.list_my_conversations(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, type varchar, name varchar, avatar_url varchar, updated_at timestamptz, is_muted boolean,
  last_message_content text, last_message_sender_id uuid, last_message_at timestamptz, last_message_deleted boolean,
  unread_count bigint, members jsonb, created_by uuid, last_message_type varchar,
  description text, my_role varchar, member_count bigint, peer_read_at timestamptz, peer_delivered_at timestamptz,
  pinned_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT c.id, c.type, c.name, c.avatar_url, c.updated_at, me.is_muted,
         CASE WHEN lm.is_deleted THEN '' ELSE lm.content END, lm.sender_id, lm.created_at, lm.is_deleted,
         (SELECT count(*) FROM public.messages x
          WHERE x.conversation_id = c.id AND x.sender_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT x.is_deleted
            AND x.created_at > coalesce(greatest(me.last_read_at, me.cleared_at), '-infinity'::timestamptz)),
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
         peer.delivered_at,
         me.pinned_at
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at, m.is_deleted, m.type FROM public.messages m
    WHERE m.conversation_id = c.id AND m.created_at > coalesce(me.cleared_at, '-infinity'::timestamptz)
    ORDER BY m.created_at DESC, m.id DESC LIMIT 1
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
  WHERE c.is_active AND (me.cleared_at IS NULL OR lm.created_at IS NOT NULL)
  ORDER BY me.pinned_at IS NULL, me.pinned_at DESC, coalesce(lm.created_at, c.updated_at) DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_conversations(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(int) TO authenticated;

-- The thread does not show what one deleted the chat over.
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
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
    AND m.created_at > coalesce((
      SELECT cm.cleared_at FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = (SELECT auth.uid())
    ), '-infinity'::timestamptz)
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- The bar's count, from what came after a chat was deleted.
CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT count(*) FROM public.messages x
  JOIN public.conversation_members me ON me.conversation_id = x.conversation_id AND me.user_id = (SELECT auth.uid())
  WHERE x.sender_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT x.is_deleted AND NOT me.is_muted
    AND x.created_at > coalesce(greatest(me.last_read_at, me.cleared_at), '-infinity'::timestamptz)
$$;
