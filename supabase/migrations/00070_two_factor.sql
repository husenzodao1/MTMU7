-- ============================================================================
-- 00070 · Two-step sign-in, enforced where the data is.
--
-- A person may turn on a second step (a six-digit code from an authenticator
-- app) from their settings. The portal then asks for it after the password —
-- but a page that asks is only a page. Here the database itself refuses: while
-- somebody who has a verified second factor is signed in with the password
-- alone (the JWT says aal1), every table answers nothing and accepts nothing,
-- and every function that decides who somebody is sees nobody. A stolen
-- password is a stolen password, and still not the account.
--
-- People without a second factor are exactly as before.
-- ============================================================================

/** True unless the caller has a verified second factor and has not passed it in this session. */
CREATE OR REPLACE FUNCTION app.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = (SELECT auth.uid()) AND f.status::text = 'verified'
      )
$$;
REVOKE EXECUTE ON FUNCTION app.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mfa_satisfied() TO anon, authenticated, service_role;

-- Every function that authorises by school goes through this one: while the
-- second step is owed, the caller belongs to no school.
CREATE OR REPLACE FUNCTION app.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.school_id
  FROM public.users u
  JOIN public.schools s ON s.id = u.school_id
  WHERE u.id = (SELECT auth.uid())
    AND u.is_active
    AND u.status IN ('active', 'graduated')
    AND s.status <> 'archived'
    AND (SELECT app.mfa_satisfied())
$$;

-- The portal's first question on every page says so plainly, rather than
-- looking like somebody with no account.
CREATE OR REPLACE FUNCTION public.mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND NOT (SELECT app.mfa_satisfied())
$$;
REVOKE EXECUTE ON FUNCTION public.mfa_required() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_required() TO authenticated;

-- A restrictive policy on every table: it is ANDed with whatever the table's
-- own policies allow, so it can only take access away, and only from somebody
-- whose second step is owed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relrowsecurity
      AND (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS mfa_gate ON %I.%I', r.nspname, r.relname);
    EXECUTE format(
      'CREATE POLICY mfa_gate ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()))',
      r.nspname, r.relname
    );
  END LOOP;
END;
$$;

-- get_my_access, as before, but for somebody whose second step is owed it
-- answers only that — not even their own name.
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
  IF NOT app.mfa_satisfied() THEN
    RETURN jsonb_build_object('mfa_required', true);
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
