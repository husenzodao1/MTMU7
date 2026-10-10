-- Seeded accounts must look to GoTrue exactly like ones it created itself.
--
-- 00015 inserts the platform owner straight into auth.users. Supabase's auth
-- service reads several of that table's columns into non-nullable Go strings
-- and writes empty strings rather than NULL into them. A row that leaves them
-- NULL therefore cannot be read at all: signing in or asking for a code fails
-- with
--
--   error finding user: sql: Scan error on column index 8, name "email_change":
--   converting NULL to string is unsupported
--
-- which names a column nobody set and gives no hint that the account itself is
-- the problem. It is not a rejected login — the lookup never completes.
--
-- 00015 is left alone: it is already applied everywhere, and a migration that
-- has run is not rewritten. This repairs the rows instead, for every install,
-- and is safe to run again.
--
-- Which of these columns exist depends on the auth service's own version, and
-- the local test harness carries only a subset, so the statement is built from
-- the columns actually present.

DO $$
DECLARE
  v_wanted text[] := ARRAY[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
  v_present text[];
  v_sets text;
  v_conds text;
BEGIN
  SELECT coalesce(array_agg(c.column_name::text), ARRAY[]::text[])
  INTO v_present
  FROM information_schema.columns c
  WHERE c.table_schema = 'auth'
    AND c.table_name = 'users'
    AND c.column_name = ANY (v_wanted);

  IF coalesce(array_length(v_present, 1), 0) = 0 THEN
    RETURN;
  END IF;

  SELECT string_agg(format('%I = coalesce(%I, %L)', name, name, ''), ', '),
         string_agg(format('%I IS NULL', name), ' OR ')
  INTO v_sets, v_conds
  FROM unnest(v_present) AS name;

  EXECUTE format('UPDATE auth.users SET %s WHERE %s', v_sets, v_conds);
END $$;
