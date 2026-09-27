-- ============================================================================
-- 00075 · What the phone app saw.
--
-- The app is the site in a phone's web view, and what goes wrong there — a
-- bridge that never arrived, a plugin that answered "not configured", a page
-- that took seconds to wake — cannot be seen from the server or reproduced on
-- a desktop. The app's pages write a few plain facts here (never a password,
-- an address or a message), so the next "it does not work" can be read
-- instead of guessed.
--
-- Written only through log_app_diagnostics, by anyone (the sign-in page has
-- nobody signed in yet), within limits; read only by the service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_diagnostics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A random id the app keeps on the phone: one installation, not a person.
  device varchar(40) NOT NULL,
  event varchar(40) NOT NULL,
  path varchar(200),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent varchar(300),
  user_id uuid
);
CREATE INDEX IF NOT EXISTS idx_app_diagnostics_created ON public.app_diagnostics(created_at);
CREATE INDEX IF NOT EXISTS idx_app_diagnostics_device ON public.app_diagnostics(device, created_at);

ALTER TABLE public.app_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_diagnostics FROM anon, authenticated;
-- Like every table since 00070, even one nobody signed in can touch.
DROP POLICY IF EXISTS mfa_gate ON public.app_diagnostics;
CREATE POLICY mfa_gate ON public.app_diagnostics AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));

CREATE OR REPLACE FUNCTION public.log_app_diagnostics(p_device text, p_user_agent text, p_events jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event jsonb;
  v_written integer := 0;
BEGIN
  IF p_device IS NULL OR p_device !~ '^[A-Za-z0-9_-]{8,40}$' THEN
    RETURN 0;
  END IF;
  -- Only the app writes here, and only its own kind of page.
  IF p_user_agent IS NULL OR position('MTMU7App' IN p_user_agent) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_typeof(p_events) <> 'array' THEN
    RETURN 0;
  END IF;
  -- A phone that is working says a few things an hour; one that says more is
  -- not telling us anything new.
  IF (SELECT count(*) FROM public.app_diagnostics d
      WHERE d.device = p_device AND d.created_at > now() - interval '1 hour') >= 300 THEN
    RETURN 0;
  END IF;

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) WITH ORDINALITY AS e(value, n) WHERE n <= 25 LOOP
    CONTINUE WHEN jsonb_typeof(v_event) <> 'object'
      OR coalesce(v_event ->> 'event', '') !~ '^[a-z][a-z0-9_.:-]{0,39}$';
    INSERT INTO public.app_diagnostics (device, event, path, detail, user_agent, user_id)
    VALUES (
      p_device,
      v_event ->> 'event',
      left(split_part(coalesce(v_event ->> 'path', ''), '?', 1), 200),
      CASE
        WHEN jsonb_typeof(v_event -> 'detail') = 'object' AND length((v_event -> 'detail')::text) <= 4000
          THEN v_event -> 'detail'
        ELSE '{}'::jsonb
      END,
      left(p_user_agent, 300),
      auth.uid()
    );
    v_written := v_written + 1;
  END LOOP;

  -- Two weeks is enough to look back on a report.
  IF random() < 0.02 THEN
    DELETE FROM public.app_diagnostics WHERE created_at < now() - interval '14 days';
  END IF;
  RETURN v_written;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_app_diagnostics(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_app_diagnostics(text, text, jsonb) TO anon, authenticated;
