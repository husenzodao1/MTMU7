-- User settings for personal preferences (language, notification toggles)
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  locale VARCHAR(5) NOT NULL DEFAULT 'tg',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_types JSONB NOT NULL DEFAULT '{"message":true,"grade":true,"homework":true,"schedule":true,"attendance":true,"announcement":true,"document":true,"library":true,"system":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_unique UNIQUE (user_id),
  CONSTRAINT user_settings_locale_check CHECK (locale IN ('tg', 'ru'))
);

CREATE INDEX idx_user_settings_user ON public.user_settings(user_id);

-- RLS: user can only access their own settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON public.user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

-- No DELETE policy — settings are never deleted, only updated

-- Trigger for updated_at
-- FUN-001: this migration originally referenced public.set_updated_at(), which no
-- earlier migration defines, so a fresh database could not be built. The
-- definition below is idempotent and identical in behaviour to
-- public.update_updated_at() from 00010.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
