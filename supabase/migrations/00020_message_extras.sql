-- Message favorites (per user — saved messages)
CREATE TABLE IF NOT EXISTS public.message_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_favorites_unique UNIQUE (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_msg_favorites_user ON public.message_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_favorites_message ON public.message_favorites(message_id);

ALTER TABLE public.message_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_favorites_select ON public.message_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY msg_favorites_insert ON public.message_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY msg_favorites_delete ON public.message_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Per-user soft delete ("Delete for me")
CREATE TABLE IF NOT EXISTS public.message_deletions (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_msg_deletions_user ON public.message_deletions(user_id);

ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_deletions_select ON public.message_deletions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY msg_deletions_insert ON public.message_deletions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY msg_deletions_delete ON public.message_deletions FOR DELETE TO authenticated
  USING (user_id = auth.uid());
