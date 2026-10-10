-- ============================================================================
-- 00069 · Notifications to the phone app.
--
-- The portal's own app for Android and iPhone shows the same site, but a
-- phone app is not a browser tab: Web Push does not reach it. It is reached
-- through Firebase Cloud Messaging, which knows each installed app by a token.
-- This is where those tokens live, and claim_message_push (00065) now hands
-- them out alongside the browsers, from one decision about who should hear.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- The FCM registration token: one installed app on one phone. Unguessable,
  -- and the only thing that identifies the phone, so it is the natural key.
  token text NOT NULL,
  platform varchar(10) NOT NULL,
  locale varchar(5) NOT NULL DEFAULT 'tg',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_token_unique UNIQUE (token),
  CONSTRAINT device_tokens_token_check CHECK (token ~ '^[A-Za-z0-9:_-]+$' AND length(token) BETWEEN 20 AND 4096),
  CONSTRAINT device_tokens_platform_check CHECK (platform IN ('android', 'ios')),
  CONSTRAINT device_tokens_locale_check CHECK (locale IN ('tg', 'ru', 'en'))
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_school ON public.device_tokens(school_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_tokens_read_own ON public.device_tokens;
CREATE POLICY device_tokens_read_own ON public.device_tokens FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS device_tokens_delete_own ON public.device_tokens;
CREATE POLICY device_tokens_delete_own ON public.device_tokens FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
-- Written only through save_device_token, which decides whose it is.
REVOKE INSERT, UPDATE ON public.device_tokens FROM anon, authenticated;

/**
 * Remembers this phone for the caller, the way save_push_subscription
 * remembers a browser: a token that was somebody else's moves to whoever is
 * signed in now, and ten phones a person is plenty.
 */
CREATE OR REPLACE FUNCTION public.save_device_token(p_token text, p_platform text, p_locale text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
BEGIN
  IF v_uid IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9:_-]+$' OR length(p_token) NOT BETWEEN 20 AND 4096
     OR coalesce(p_platform, '') NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'invalid_device' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_tokens (user_id, school_id, token, platform, locale)
  VALUES (v_uid, v_school, p_token, p_platform, CASE WHEN p_locale IN ('tg', 'ru', 'en') THEN p_locale ELSE 'tg' END)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, school_id = EXCLUDED.school_id, platform = EXCLUDED.platform,
        locale = EXCLUDED.locale, last_seen_at = now();

  DELETE FROM public.device_tokens
  WHERE id IN (
    SELECT d.id FROM public.device_tokens d WHERE d.user_id = v_uid ORDER BY d.last_seen_at DESC OFFSET 10
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_device_token(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_device_token(text, text, text) TO authenticated;

/** Signing out on a phone: its notifications stop with the session. */
CREATE OR REPLACE FUNCTION public.forget_my_device_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.device_tokens WHERE token = p_token AND user_id = (SELECT auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.forget_my_device_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forget_my_device_token(text) TO authenticated;

/** Tokens Firebase says are gone: the app was uninstalled or its data cleared. */
CREATE OR REPLACE FUNCTION public.forget_device_tokens(p_tokens text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.device_tokens WHERE token = ANY (coalesce(p_tokens, ARRAY[]::text[]));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.forget_device_tokens(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forget_device_tokens(text[]) TO service_role;

/**
 * claim_message_push, as in 00065, deciding once who should hear and handing
 * out both kinds of device: `targets` are browsers, `devices` are phone apps.
 */
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
  SELECT m.id, m.conversation_id, m.sender_id, m.school_id, m.type, m.content, m.created_at,
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
    'preview', left(v_msg.content, 160),
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
