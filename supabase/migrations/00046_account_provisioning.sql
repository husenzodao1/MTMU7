-- Issuing an account, rather than waiting for somebody to ask for one.
--
-- The school hands the portal its register and expects working logins back. So
-- the platform creates the accounts itself: the GoTrue row, its identity, and
-- the platform row, in one transaction. Doing it in SQL rather than through the
-- auth admin API keeps the service-role key out of an administrator-facing
-- workflow, makes a half-created account impossible, and — because the whole
-- thing runs inside the migrations — lets the tests prove the row is shaped the
-- way GoTrue shapes its own.
--
-- The shape is the risky part. 00044 exists because 00015 left four of GoTrue's
-- token columns NULL, and an account with a NULL there cannot be read at all:
-- signing in fails with "converting NULL to string is unsupported", naming a
-- column nobody set. Every one of them is written here, and a test compares a
-- created row against the repaired one column by column, so a column added to
-- auth.users that this forgets fails by construction rather than in production.

-- ----------------------------------------------------------------------------
-- 1. When credentials were last issued
-- ----------------------------------------------------------------------------

-- The password itself is never stored — it exists in the workbook the office
-- downloads and nowhere else. This is how the administration can still see who
-- is working from the password they were handed, without recording what it was.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credentials_issued_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. A password worth typing off a printed sheet
-- ----------------------------------------------------------------------------

-- Ten characters from an alphabet of thirty-two: about fifty bits, which is far
-- beyond guessing, and no character that a tired secretary can mistake for
-- another. There is no l and no o, because there is a 1 and a 0; no capitals,
-- because the sheet is read aloud; and nothing that a spreadsheet could read as
-- a formula.
CREATE OR REPLACE FUNCTION app.random_password(p_length int DEFAULT 10)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alphabet constant text := '23456789abcdefghijkmnpqrstuvwxyz';  -- exactly 32
  v_bytes bytea := extensions.gen_random_bytes(greatest(p_length, 8));
  v_out text := '';
  i int;
BEGIN
  FOR i IN 0 .. greatest(p_length, 8) - 1 LOOP
    -- 256 is a whole multiple of 32, so masking is unbiased.
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.random_password(int) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The account itself
-- ----------------------------------------------------------------------------

-- The only place in this codebase that writes auth.users. The address is left
-- unconfirmed on purpose: the school wrote it down, and the person still has to
-- show they can read it before the portal opens.
CREATE OR REPLACE FUNCTION app.create_login(p_email text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    email_change_confirm_status, is_sso_user, is_anonymous,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    -- Cost 10 is what GoTrue itself uses, so a password the school issued is
    -- indistinguishable from one its owner later chooses.
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '',
    '', '',
    '', '', '',
    0, false, false,
    now(), now()
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    NULL, now(), now()
  );

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.create_login(text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Class names as they will actually be typed
-- ----------------------------------------------------------------------------

-- 1А and 1A are the same class to everyone who reads them and two different
-- classes to a database. Both will be typed, often in the same file, because
-- the Cyrillic and Latin letters sit on the same key. The Latin ones that have
-- an identical-looking Cyrillic twin are folded into it.
CREATE OR REPLACE FUNCTION app.normalize_class_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(translate(upper(btrim(coalesce(p_name, ''))), 'ABCEHKMOPTXY', 'АВСЕНКМОРТХУ'), '')
$$;
GRANT EXECUTE ON FUNCTION app.normalize_class_name(text) TO authenticated;
