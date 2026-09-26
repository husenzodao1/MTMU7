-- ============================================================================
-- 00068 · A lighter path for every message, for the day everybody writes at once.
--
-- Each message used to do more than it needed to:
--
--   1. It rewrote its conversation's row. Every message in a busy class chat
--      queued behind the one before it for that row's lock, fired three
--      BEFORE UPDATE triggers there (one of them a lookup), and sent one more
--      change down the realtime stream that nothing listens to. The list of
--      conversations orders by the last message itself, not by this column,
--      so the write bought nothing.
--
--   2. Checks of "is this row in the same school" ran on every update, even
--      updates that cannot change the school: marking a conversation read, a
--      notification read, a message pinned. They now run when a column they
--      check is written.
--
--   3. Four tables were published to realtime that no page subscribes to.
--      Realtime decodes every change to a published table whether or not
--      anybody is listening.
--
-- And, while here: a notification for a photo or a place says so, instead of
-- being an empty line.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The message no longer touches its conversation
-- ----------------------------------------------------------------------------
-- What stays: the sender has read everything up to what they just sent —
-- and never backwards, should a later read have committed first.
CREATE OR REPLACE FUNCTION app.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.conversation_members
  SET last_read_at = NEW.created_at
  WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id
    AND (last_read_at IS NULL OR last_read_at < NEW.created_at);
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Checks that fire only when what they check is written
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_message_school ON public.messages;
CREATE TRIGGER trg_validate_message_school
  BEFORE INSERT OR UPDATE OF school_id, conversation_id, sender_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_school();

DROP TRIGGER IF EXISTS trg_validate_conversation_school ON public.conversations;
CREATE TRIGGER trg_validate_conversation_school
  BEFORE INSERT OR UPDATE OF school_id, class_id, created_by ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_school();

DROP TRIGGER IF EXISTS trg_validate_conv_member_school ON public.conversation_members;
CREATE TRIGGER trg_validate_conv_member_school
  BEFORE INSERT OR UPDATE OF school_id, conversation_id, user_id ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_conv_member_school();

DROP TRIGGER IF EXISTS trg_validate_notification_school ON public.notifications;
CREATE TRIGGER trg_validate_notification_school
  BEFORE INSERT OR UPDATE OF school_id, user_id ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_school();

-- The timestamps that follow a flag, set when the flag is written.
DROP TRIGGER IF EXISTS trg_soft_delete_messages ON public.messages;
CREATE TRIGGER trg_soft_delete_messages
  BEFORE UPDATE OF is_deleted ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();

DROP TRIGGER IF EXISTS trg_soft_delete_conversations ON public.conversations;
CREATE TRIGGER trg_soft_delete_conversations
  BEFORE UPDATE OF is_active ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();

-- ----------------------------------------------------------------------------
-- 3. Realtime carries only what somebody listens to
-- ----------------------------------------------------------------------------
-- Pages subscribe to messages (a thread, the list), conversation_members (a
-- read receipt, a new conversation) and notifications (the bell). Nothing
-- subscribes to these four.
DO $$
DECLARE
  v_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH v_table IN ARRAY ARRAY['conversations', 'message_favorites', 'message_deletions', 'announcements'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. A notification that says what arrived
-- ----------------------------------------------------------------------------
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
    ELSE left(NEW.content, 200)
  END;
  PERFORM app.notify(v_recipients, NEW.school_id, 'message', 'messages', 'message.new',
    jsonb_build_object('sender', btrim(coalesce(v_sender.first_name, '') || ' ' || coalesce(v_sender.last_name, '')),
                       'conversation_id', NEW.conversation_id),
    '/messages/' || NEW.conversation_id::text, NULL, v_body, 'conversation:' || NEW.conversation_id::text);
  RETURN NULL;
END;
$$;
