-- Signing in with the number the school issued, and closing self-registration.
--
-- The school hands every pupil and teacher a login and a password. The login is
-- the public id the platform already generates — MT10001 — because it is short,
-- it is printed on everything, and a seven-year-old can copy it. Supabase signs
-- people in by email, so something has to turn one into the other before the
-- password is checked.
--
-- Doing that in the obvious way — a function mapping a login to an address —
-- would hand anyone holding the publishable key every pupil's email address, one
-- sequential number at a time. Gating the same function on the password instead
-- is worse: at sign-in there is no session, so the function must be callable by
-- anon, and it would then answer "is this the right password?" without ever
-- reaching GoTrue, which is where the rate limits are.
--
-- So the mapping is gated on a secret only the server knows. A wrong secret
-- returns nothing for every login, including real ones. No password is ever
-- compared here, and GoTrue still does the signing in.

-- ----------------------------------------------------------------------------
-- 1. The shared secret
-- ----------------------------------------------------------------------------

-- One row. RLS is on and there are no policies at all, so nothing reachable
-- through the API can read it — only SECURITY DEFINER code owned by the
-- platform.
CREATE TABLE IF NOT EXISTS public.login_secret (
  id smallint PRIMARY KEY DEFAULT 1,
  secret_sha256 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT login_secret_single_row CHECK (id = 1),
  CONSTRAINT login_secret_hash_shape CHECK (secret_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.login_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_secret FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_secret FROM PUBLIC, anon, authenticated;

-- Set from an operator script holding the service-role key; see
-- scripts/admin/set-login-secret.mts. The secret itself is never stored.
CREATE OR REPLACE FUNCTION public.set_login_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RAISE EXCEPTION 'weak_secret' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.login_secret (id, secret_sha256, updated_at)
  VALUES (1, encode(extensions.digest(p_secret, 'sha256'), 'hex'), now())
  ON CONFLICT (id) DO UPDATE
    SET secret_sha256 = EXCLUDED.secret_sha256, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_login_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_login_secret(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Login to address, for the sign-in action only
-- ----------------------------------------------------------------------------

-- Returns NULL for everything when the secret is wrong or unset, so a caller
-- without it learns nothing at all — not even whether a login exists. Comparing
-- digests rather than the secrets themselves means a timing difference cannot be
-- walked back into the secret.
--
-- A blocked or rejected account answers NULL too, so it fails at the same step
-- as every other unusable login rather than one step later.
CREATE OR REPLACE FUNCTION public.login_lookup(p_login text, p_secret text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
  v_email text;
BEGIN
  SELECT s.secret_sha256 INTO v_expected FROM public.login_secret s WHERE s.id = 1;
  IF v_expected IS NULL THEN
    RETURN NULL;
  END IF;
  IF encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') IS DISTINCT FROM v_expected THEN
    RETURN NULL;
  END IF;

  SELECT au.email INTO v_email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE upper(btrim(u.public_id)) = upper(btrim(coalesce(p_login, '')))
    AND u.is_active
    AND u.status NOT IN ('blocked', 'rejected');

  RETURN v_email;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.login_lookup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_lookup(text, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The session snapshot says whether the address has been proved
-- ----------------------------------------------------------------------------

-- Nothing in public.users records it; GoTrue does, in a schema the portal cannot
-- read under RLS. This function already runs as the platform, so it is the one
-- round trip that can answer it without adding another.
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_user public.users%ROWTYPE;
  v_verified boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user', NULL);
  END IF;

  SELECT au.email_confirmed_at IS NOT NULL INTO v_verified FROM auth.users au WHERE au.id = v_uid;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id, 'school_id', v_user.school_id, 'public_id', v_user.public_id,
      'email', v_user.email, 'first_name', v_user.first_name, 'last_name', v_user.last_name,
      'middle_name', v_user.middle_name, 'avatar_url', v_user.avatar_url, 'phone', v_user.phone,
      'status', v_user.status, 'is_active', v_user.is_active,
      'email_verified', coalesce(v_verified, false)
    ),
    'school', (
      SELECT jsonb_build_object('id', s.id, 'slug', s.slug, 'short_name', s.short_name, 'full_name', s.full_name,
        'official_name_tg', s.official_name_tg, 'official_name_ru', s.official_name_ru,
        'official_name_en', s.official_name_en, 'logo_url', s.logo_url, 'status', s.status,
        'timezone', s.timezone, 'default_locale', s.default_locale)
      FROM public.schools s WHERE s.id = v_user.school_id
    ),
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru,
        'name_en', r.name_en, 'level', r.level, 'is_system', r.is_system) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      WHERE ur.user_id = v_uid AND ur.school_id = v_user.school_id
    ), '[]'::jsonb),
    'permissions', CASE WHEN app.current_school_id() IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(DISTINCT p.slug)
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = v_uid AND ur.school_id = v_user.school_id
    ), '[]'::jsonb) END,
    'modules', CASE WHEN app.current_school_id() IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(DISTINCT m.slug)
      FROM public.school_modules sm
      JOIN public.modules m ON m.id = sm.module_id
      WHERE sm.school_id = v_user.school_id AND sm.is_enabled
        AND (m.is_core OR EXISTS (
          SELECT 1 FROM public.module_role_access mra
          JOIN public.user_roles ur ON ur.role_id = mra.role_id AND ur.user_id = v_uid
          WHERE mra.school_id = sm.school_id AND mra.module_id = m.id AND mra.is_visible
        ))
    ), '[]'::jsonb) END,
    'scopes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('scope_type', s.scope_type, 'scope_role', s.scope_role,
        'region_id', s.region_id, 'district_id', s.district_id, 'school_id', s.school_id))
      FROM public.admin_scopes s WHERE s.user_id = v_uid
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Confirming an address on someone's behalf
-- ----------------------------------------------------------------------------

-- A first-year pupil may have no address of their own, and the family address
-- may already belong to an older sibling. Those accounts would otherwise stand
-- for ever at a screen asking for a code that can never arrive, so someone who
-- may edit accounts can vouch for them instead. It is written to the audit log
-- under its own action, because it is a judgement and not a proof.
CREATE OR REPLACE FUNCTION public.confirm_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT u.school_id INTO v_school FROM public.users u WHERE u.id = p_user_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app.can(v_school, 'users.update') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.users SET email_confirmed_at = now(), updated_at = now()
  WHERE id = p_user_id AND email_confirmed_at IS NULL;

  PERFORM app.write_audit(v_school, 'confirm_account', 'users', p_user_id, NULL, NULL, NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.confirm_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_account(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Self-registration is closed
-- ----------------------------------------------------------------------------

-- The door is closed, not demolished. registration_requests and invitation_codes
-- keep the history of everyone who joined the old way, review_registration can
-- still settle anything left pending, and nothing destructive runs against a
-- live database.
REVOKE EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) FROM authenticated;

UPDATE public.schools
SET settings = coalesce(settings, '{}'::jsonb) || '{"registration_open": false}'::jsonb
WHERE coalesce((settings ->> 'registration_open')::boolean, true);
