-- ============================================================================
-- 00066 · Ready for a morning when everybody signs in at once.
--
-- The database advisor was asked what it would change under load, and these
-- are the answers that matter on the paths every signed-in person takes.
-- Nothing here changes what anybody may see or do.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Friend requests: the only policies left that call auth.uid() per row
-- ----------------------------------------------------------------------------
-- `auth.uid()` written bare is evaluated once for every row the policy looks
-- at; wrapped in a sub-select it is evaluated once per statement. The same
-- goes for the school lookup. The policies also named no role, so they were
-- consulted for anonymous callers too, who can never pass them.
DROP POLICY IF EXISTS friend_requests_select ON public.friend_requests;
CREATE POLICY friend_requests_select ON public.friend_requests FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_user_school_id())
    AND (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS friend_requests_insert ON public.friend_requests;
CREATE POLICY friend_requests_insert ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_user_school_id())
    AND sender_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS friend_requests_update_sender ON public.friend_requests;
CREATE POLICY friend_requests_update_sender ON public.friend_requests FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_user_school_id())
    AND sender_id = (SELECT auth.uid())
    AND status IN ('pending', 'accepted')
  )
  WITH CHECK (
    school_id = (SELECT public.current_user_school_id())
    AND sender_id = (SELECT auth.uid())
    AND status = 'cancelled'
  );

DROP POLICY IF EXISTS friend_requests_update_receiver ON public.friend_requests;
CREATE POLICY friend_requests_update_receiver ON public.friend_requests FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_user_school_id())
    AND receiver_id = (SELECT auth.uid())
    AND status IN ('pending', 'accepted')
  )
  WITH CHECK (
    school_id = (SELECT public.current_user_school_id())
    AND receiver_id = (SELECT auth.uid())
    AND status IN ('accepted', 'rejected')
  );

DROP POLICY IF EXISTS friend_requests_delete ON public.friend_requests;
CREATE POLICY friend_requests_delete ON public.friend_requests FOR DELETE TO authenticated
  USING (
    school_id = (SELECT public.current_user_school_id())
    AND (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
    AND status IN ('rejected', 'cancelled')
  );

-- ----------------------------------------------------------------------------
-- 2. Messages: two indexes every insert paid for and no query used
-- ----------------------------------------------------------------------------
-- (conversation_id, created_at DESC) is the leading half of
-- idx_messages_conversation_cursor from 00027, which every thread and every
-- unread count already uses. The full-text index over message bodies dates
-- from 00006 and nothing has searched it since; a GIN index is the most
-- expensive thing a busy class chat can be made to update on every line.
DROP INDEX IF EXISTS public.idx_messages_conversation_created;
DROP INDEX IF EXISTS public.idx_messages_content_search;

-- ----------------------------------------------------------------------------
-- 3. Foreign keys walked on the hot paths
-- ----------------------------------------------------------------------------
-- Role → people: permission checks, the support desk and role editing all go
-- from a role to the people holding it.
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role_id);

-- Attendance by lesson: the register and the parents' bot both read it that way.
CREATE INDEX IF NOT EXISTS idx_attendance_class_subject_date
  ON public.attendance_records(class_subject_id, attendance_date)
  WHERE class_subject_id IS NOT NULL;

-- A chat leaving the bot takes its queued messages with it.
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_chat ON public.telegram_outbox(chat_id);

-- The push log is only ever looked up by its key; old rows are clutter.
-- Messages older than ten minutes can no longer be claimed (00065), so a
-- day's worth is plenty to keep.
CREATE OR REPLACE FUNCTION app.prune_message_push_log()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.message_push_log WHERE pushed_at < now() - interval '1 day'
$$;
REVOKE EXECUTE ON FUNCTION app.prune_message_push_log() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-message-push-log');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('prune-message-push-log', '17 3 * * *', 'SELECT app.prune_message_push_log()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.schedule is not available here; prune message_push_log by hand';
END;
$$;
