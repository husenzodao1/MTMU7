-- Letting the installer fill the Vault in, instead of the school.
--
-- app.telegram_tick() reads the dispatch URL and the bearer token from Supabase
-- Vault (migration 00059). Putting them there meant opening the SQL editor and
-- pasting two statements with a secret in them — a step that is easy to get
-- wrong and unpleasant to explain.
--
-- This is the same two statements behind a function the installer can call with
-- the service key, so the secret goes straight from the school's own .env.local
-- to the Vault over their own connection. It is granted to service_role alone:
-- anything that can call it could already read everything.
CREATE OR REPLACE FUNCTION public.telegram_configure(p_url text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_written int := 0;
  v_pair record;
  v_id uuid;
BEGIN
  IF p_url !~ '^https://[a-z0-9.-]+(/[^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'invalid_url' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_secret, '')) < 32 THEN
    RAISE EXCEPTION 'invalid_secret' USING ERRCODE = '22023';
  END IF;

  FOR v_pair IN
    SELECT 'telegram_dispatch_url' AS name, p_url AS value
    UNION ALL
    SELECT 'telegram_cron_secret', p_secret
  LOOP
    SELECT s.id INTO v_id FROM vault.secrets s WHERE s.name = v_pair.name;
    IF v_id IS NULL THEN
      PERFORM vault.create_secret(v_pair.value, v_pair.name, 'the parents bot dispatcher');
    ELSE
      PERFORM vault.update_secret(v_id, v_pair.value, v_pair.name, 'the parents bot dispatcher');
    END IF;
    v_written := v_written + 1;
  END LOOP;

  -- Worth answering, because the installer has no other way to see that the
  -- minute job exists and is switched on.
  RETURN jsonb_build_object(
    'stored', v_written,
    'scheduled', EXISTS (
      SELECT 1 FROM cron.job j WHERE j.jobname = 'telegram-dispatch' AND j.active
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_configure(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_configure(text, text) TO service_role;
