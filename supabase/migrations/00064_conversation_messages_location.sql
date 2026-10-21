-- The reader has to be told where, too.
--
-- get_conversation_messages returns the columns the thread draws, and a
-- location message drawn without its coordinates is a blank grey card. The two
-- new columns join the list; a deleted message gives up its place along with
-- its words, because "this message was deleted" should not still say where
-- somebody was.

-- Dropped rather than replaced: CREATE OR REPLACE will not widen a RETURNS
-- TABLE, and the two new columns do exactly that.
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
  location_lat numeric, location_lng numeric
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
         CASE WHEN m.is_deleted THEN NULL ELSE m.location_lng END
  FROM public.messages m
  LEFT JOIN public.users u ON u.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (p_before_created_at IS NULL OR (m.created_at, m.id) < (p_before_created_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    AND NOT EXISTS (SELECT 1 FROM public.message_deletions d WHERE d.message_id = m.id AND d.user_id = (SELECT auth.uid()))
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- The drop took the grants with it.
REVOKE EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, uuid, int) TO authenticated;
