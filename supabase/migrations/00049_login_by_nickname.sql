-- Signing in with the name people actually call themselves.
--
-- The school issues MT10001, and that is what goes on the printed slip. But
-- once a pupil has chosen a nickname it is the thing they remember, and asking
-- them for a number they wrote down in September is asking them to lose it.
-- So the same gate now answers to either.
--
-- A nickname is unique within a school, not across the platform, so on a
-- platform holding several schools two pupils may share one. Rather than pick
-- between them the function answers with nothing, exactly as it does for a
-- nickname nobody holds: the identifier is then the public id or the address,
-- both of which are unique everywhere.

CREATE OR REPLACE FUNCTION public.login_lookup(p_login text, p_secret text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
  v_login text := btrim(coalesce(p_login, ''));
  v_email text;
  v_matches int;
BEGIN
  SELECT s.secret_sha256 INTO v_expected FROM public.login_secret s WHERE s.id = 1;
  IF v_expected IS NULL THEN
    RETURN NULL;
  END IF;
  IF encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') IS DISTINCT FROM v_expected THEN
    RETURN NULL;
  END IF;
  IF v_login = '' THEN
    RETURN NULL;
  END IF;

  -- The public id first: it is unique platform-wide and is what the school
  -- printed, so it is never ambiguous.
  SELECT au.email INTO v_email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE upper(u.public_id) = upper(v_login)
    AND u.is_active
    AND u.status NOT IN ('blocked', 'rejected');
  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- Then the nickname, and only when exactly one usable account holds it.
  SELECT count(*) INTO v_matches
  FROM public.users u
  WHERE u.nickname IS NOT NULL
    AND lower(u.nickname) = lower(v_login)
    AND u.is_active
    AND u.status NOT IN ('blocked', 'rejected');
  IF v_matches <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT au.email INTO v_email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE u.nickname IS NOT NULL
    AND lower(u.nickname) = lower(v_login)
    AND u.is_active
    AND u.status NOT IN ('blocked', 'rejected');

  RETURN v_email;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.login_lookup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_lookup(text, text) TO anon, authenticated;
