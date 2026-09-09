-- =============================================================
-- Migration 00021: Messenger realtime fixes + message_extras
--
-- APPLY IN SUPABASE DASHBOARD → SQL Editor
-- Run in order. Each block is idempotent (IF NOT EXISTS / DROP IF EXISTS).
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. message_favorites (from 00020 — safe to re-run)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_favorites_unique UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_favorites_user    ON public.message_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_favorites_message ON public.message_favorites(message_id);

ALTER TABLE public.message_favorites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_favorites' AND policyname = 'msg_favorites_select'
  ) THEN
    EXECUTE 'CREATE POLICY msg_favorites_select ON public.message_favorites FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_favorites' AND policyname = 'msg_favorites_insert'
  ) THEN
    EXECUTE 'CREATE POLICY msg_favorites_insert ON public.message_favorites FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_favorites' AND policyname = 'msg_favorites_delete'
  ) THEN
    EXECUTE 'CREATE POLICY msg_favorites_delete ON public.message_favorites FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 2. message_deletions (from 00020 — safe to re-run)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_deletions (
  user_id    UUID NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_deletions_user ON public.message_deletions(user_id);

ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_deletions' AND policyname = 'msg_deletions_select'
  ) THEN
    EXECUTE 'CREATE POLICY msg_deletions_select ON public.message_deletions FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_deletions' AND policyname = 'msg_deletions_insert'
  ) THEN
    EXECUTE 'CREATE POLICY msg_deletions_insert ON public.message_deletions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_deletions' AND policyname = 'msg_deletions_delete'
  ) THEN
    EXECUTE 'CREATE POLICY msg_deletions_delete ON public.message_deletions FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 3. Fix messages_select RLS: remove is_deleted = false filter
--
-- WHY: Supabase Realtime only delivers UPDATE events when the
-- NEW row passes the subscriber's SELECT policy.  The original
-- policy required is_deleted = false, so when deleteMessageAction
-- sets is_deleted = true, the UPDATE event was silently dropped —
-- B never received the "message deleted" signal.
--
-- SAFE: all server-side fetches already filter is_deleted = false
-- explicitly via application code.  Browser clients never query
-- messages directly (all reads go through Server Actions with the
-- admin client).
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_select ON public.messages;

CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 4. Supabase Realtime publication
--
-- ALTER PUBLICATION ADD TABLE raises ERROR if table already present
-- in pg15. Each block checks pg_publication_tables first.
-- ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_members') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_favorites') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_favorites';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_deletions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_deletions';
  END IF;
END $$;
