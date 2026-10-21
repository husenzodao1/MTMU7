-- Who actually calls the sender.
--
-- A parent is promised a message twelve minutes after the mark is entered, so
-- something has to look at the outbox every minute. Vercel's Hobby plan runs a
-- cron once a day, which is no use, so the schedule lives here instead:
-- pg_cron wakes up, pg_net posts to the route, and the route does what it would
-- have done anyway. Vercel keeps a daily run as a backstop for whatever the
-- database missed while it was down.
--
-- The URL and the shared secret are held in Supabase Vault, not in this file
-- and not in a table. Until somebody puts them there the job wakes up, finds
-- nothing to call, and goes back to sleep — see docs/telegram-bot.md for the
-- two statements that fill them in.
--
-- Everything below is written so that a Postgres without pg_cron or pg_net —
-- the in-process one the tests run against — applies this migration quietly
-- and carries on. The bot's own tables and functions do not depend on it.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available here; the schedule will not be created';
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net is not available here; nothing will be posted';
END;
$$;

/**
 * One minute's worth of work: ask the site to flush the outbox.
 *
 * The call is made dynamically so that this function compiles on a server that
 * has never heard of pg_net. It does not wait for the answer — pg_net is
 * asynchronous by design, and a cron job that blocked on a slow deployment
 * would pile up behind itself.
 */
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
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'telegram_dispatch_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'telegram_cron_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT extensions.http_post(%L, %L::jsonb, %L::jsonb, %L::jsonb, %s)',
      v_url,
      '{}',
      '{}',
      jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret)::text,
      20000
    );
  EXCEPTION WHEN OTHERS THEN
    -- A minute that could not be posted is a minute's delay, not a failure
    -- worth waking anybody for: the next minute tries again, and the outbox
    -- still holds everything.
    RAISE NOTICE 'telegram tick could not post';
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.telegram_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-dispatch');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('telegram-dispatch', '* * * * *', 'SELECT app.telegram_tick()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.schedule is not available here; schedule telegram-dispatch by hand';
END;
$$;
