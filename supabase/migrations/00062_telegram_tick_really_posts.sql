-- The minute job was succeeding at nothing.
--
-- Migration 00059 installed pg_net WITH SCHEMA extensions and then called
-- extensions.http_post. pg_net ignores the requested schema — it has its own,
-- called net — so the function did not exist, the EXECUTE raised, and the
-- handler underneath it swallowed the error and returned. cron.job_run_details
-- said "succeeded" every minute for as long as anybody cared to look, and not
-- one request was ever made.
--
-- Two things change. The call goes to net.http_post, where pg_net actually
-- puts it. And the handler stops being a place where mistakes go to be
-- forgotten: whatever happens, good or bad, is written down where the
-- installer can read it back, because a scheduled job nobody can see the
-- inside of is a job that will fail silently again.
--
-- It is still wrapped, and it still does not re-raise: a minute that could not
-- be posted is a minute's delay, and the outbox has lost nothing. The
-- difference is that now it says so.

CREATE TABLE IF NOT EXISTS app.telegram_tick_state (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  ran_at timestamptz,
  request_id bigint,
  error text
);
-- The app schema is not exposed through PostgREST, so this is reachable only by
-- the definer functions below and by anybody who already has the database.
ALTER TABLE app.telegram_tick_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.telegram_tick()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'telegram_dispatch_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'telegram_cron_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    INSERT INTO app.telegram_tick_state (only_row, ran_at, request_id, error)
    VALUES (true, now(), NULL, 'the vault holds no dispatch address or token')
    ON CONFLICT (only_row) DO UPDATE SET ran_at = excluded.ran_at, request_id = NULL, error = excluded.error;
    RETURN;
  END IF;

  BEGIN
    -- Dynamic so that this function still compiles where pg_net is absent, such
    -- as the in-process Postgres the tests run against.
    EXECUTE format(
      'SELECT net.http_post(%L, %L::jsonb, %L::jsonb, %L::jsonb, %s)',
      v_url,
      '{}',
      '{}',
      jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret)::text,
      20000
    ) INTO v_request;

    INSERT INTO app.telegram_tick_state (only_row, ran_at, request_id, error)
    VALUES (true, now(), v_request, NULL)
    ON CONFLICT (only_row) DO UPDATE SET ran_at = excluded.ran_at, request_id = excluded.request_id, error = NULL;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO app.telegram_tick_state (only_row, ran_at, request_id, error)
    VALUES (true, now(), NULL, left(SQLERRM, 300))
    ON CONFLICT (only_row) DO UPDATE SET ran_at = excluded.ran_at, request_id = NULL, error = excluded.error;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.telegram_tick() FROM PUBLIC, anon, authenticated;

/**
 * Stores the dispatcher's address and token, and says what the minute job is
 * actually doing — not merely that it is scheduled, which is what it said last
 * time while doing nothing at all.
 */
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
  v_state app.telegram_tick_state%ROWTYPE;
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

  -- Run it once now rather than leave the school waiting a minute to find out
  -- whether any of this works.
  PERFORM app.telegram_tick();
  SELECT * INTO v_state FROM app.telegram_tick_state;

  RETURN jsonb_build_object(
    'stored', v_written,
    'scheduled', EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'telegram-dispatch' AND j.active),
    'posted', v_state.request_id IS NOT NULL,
    'error', v_state.error
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_configure(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_configure(text, text) TO service_role;
