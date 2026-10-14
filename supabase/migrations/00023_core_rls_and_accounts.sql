-- ============================================================================
-- 00023 · Core RLS rewrite (identity, RBAC, configuration) and account RPCs.
--
-- Every policy is expressed through app.can(school_id, permission) or explicit
-- ownership. Findings addressed: SEC-004 (column privileges), SEC-013,
-- SEC-014, SEC-015, FUN-014.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Guards
-- ----------------------------------------------------------------------------

-- Platform-controlled school columns.
CREATE OR REPLACE FUNCTION app.guard_schools_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT app.is_api_caller() OR app.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'only platform administrators can create schools' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.id_prefix IS DISTINCT FROM OLD.id_prefix
     OR NEW.id_sequence IS DISTINCT FROM OLD.id_sequence
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.region_id IS DISTINCT FROM OLD.region_id
     OR NEW.district_id IS DISTINCT FROM OLD.district_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'this school field is managed by the platform administrator' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_schools_write ON public.schools;
CREATE TRIGGER trg_guard_schools_write
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.guard_schools_write();

-- System roles keep their identity.
CREATE OR REPLACE FUNCTION app.guard_roles_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system THEN
      RAISE EXCEPTION 'system roles are provisioned by the platform' USING ERRCODE = '42501';
    END IF;
    IF NEW.level < 2 THEN
      RAISE EXCEPTION 'custom roles cannot use administrator level' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.is_system IS DISTINCT FROM OLD.is_system
     OR (OLD.is_system AND (NEW.slug IS DISTINCT FROM OLD.slug
                            OR NEW.level IS DISTINCT FROM OLD.level
                            OR NEW.is_active IS DISTINCT FROM OLD.is_active))
     OR (NOT OLD.is_system AND NEW.level < 2) THEN
    RAISE EXCEPTION 'protected role field cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_roles_write ON public.roles;
CREATE TRIGGER trg_guard_roles_write
  BEFORE INSERT OR UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION app.guard_roles_write();

-- Core modules (dashboard) cannot be disabled.
CREATE OR REPLACE FUNCTION app.guard_school_modules_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.is_enabled AND EXISTS (SELECT 1 FROM public.modules m WHERE m.id = NEW.module_id AND m.is_core) THEN
    RAISE EXCEPTION 'core modules cannot be disabled' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_enabled IS DISTINCT FROM OLD.is_enabled THEN
    IF NEW.is_enabled THEN
      NEW.enabled_at := now();
    ELSE
      NEW.disabled_at := now();
    END IF;
    IF app.is_api_caller() THEN
      NEW.updated_by := (SELECT auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_school_modules_write ON public.school_modules;
CREATE TRIGGER trg_guard_school_modules_write
  BEFORE INSERT OR UPDATE ON public.school_modules
  FOR EACH ROW EXECUTE FUNCTION app.guard_school_modules_write();

-- A role may only be granted by someone who already holds all its permissions.
CREATE OR REPLACE FUNCTION app.can_grant_role(p_role_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.roles r WHERE r.id = p_role_id AND r.is_active)
    AND (
      app.is_platform_admin()
      OR NOT EXISTS (
        SELECT 1
        FROM public.roles r
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE r.id = p_role_id
          AND NOT app.can(r.school_id, p.slug)
      )
    )
$$;

-- ----------------------------------------------------------------------------
-- 2. Column privileges on users (minors' contact data is not a directory field)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.users FROM anon, authenticated;
GRANT SELECT (id, school_id, public_id, first_name, last_name, middle_name, avatar_url,
              status, is_active, created_at, updated_at)
  ON public.users TO authenticated;
GRANT UPDATE (phone, avatar_url, first_name, last_name, middle_name, date_of_birth, gender,
              status, is_active)
  ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Policies
-- ----------------------------------------------------------------------------

-- schools ----------------------------------------------------------------------
SELECT app.drop_policies('public', 'schools');
CREATE POLICY schools_public_read ON public.schools FOR SELECT TO anon
  USING (status = 'active');
CREATE POLICY schools_member_read ON public.schools FOR SELECT TO authenticated
  USING (status = 'active' OR app.can_read_school(id) OR app.is_platform_admin());
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING (app.can(id, 'schools.update'))
  WITH CHECK (app.can(id, 'schools.update'));
CREATE POLICY schools_insert_platform ON public.schools FOR INSERT TO authenticated
  WITH CHECK (app.is_platform_admin());

-- regions / districts / domains --------------------------------------------------
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY regions_read ON public.regions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY regions_manage ON public.regions FOR ALL TO authenticated
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());
CREATE POLICY districts_read ON public.districts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY districts_manage ON public.districts FOR ALL TO authenticated
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());
CREATE POLICY school_domains_read ON public.school_domains FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY school_domains_manage ON public.school_domains FOR ALL TO authenticated
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

-- admin scopes -----------------------------------------------------------------------
ALTER TABLE public.admin_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_scopes_read ON public.admin_scopes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR app.is_platform_admin());
CREATE POLICY admin_scopes_manage ON public.admin_scopes FOR ALL TO authenticated
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin() AND user_id <> (SELECT auth.uid()));

-- platform identity ---------------------------------------------------------------------
ALTER TABLE public.platform_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_identity_read ON public.platform_identity FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY platform_identity_update ON public.platform_identity FOR UPDATE TO authenticated
  USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

-- users --------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'users');
CREATE POLICY users_read_self ON public.users FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY users_read_school_directory ON public.users FOR SELECT TO authenticated
  USING (
    (school_id = (SELECT app.current_school_id()) AND is_active)
    OR app.can(school_id, 'users.view')
  );
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR app.can(school_id, 'users.update')
    OR app.can(school_id, 'users.deactivate')
    OR app.can(school_id, 'users.approve')
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR app.can(school_id, 'users.update')
    OR app.can(school_id, 'users.deactivate')
    OR app.can(school_id, 'users.approve')
  );

-- roles ---------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'roles');
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY roles_insert ON public.roles FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'roles.manage'));
CREATE POLICY roles_update ON public.roles FOR UPDATE TO authenticated
  USING (app.can(school_id, 'roles.manage')) WITH CHECK (app.can(school_id, 'roles.manage'));
CREATE POLICY roles_delete ON public.roles FOR DELETE TO authenticated
  USING (app.can(school_id, 'roles.manage') AND NOT is_system);

-- permissions (global catalog) -------------------------------------------------------------
SELECT app.drop_policies('public', 'permissions');
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM anon, authenticated;

-- user_roles ------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'user_roles');
CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR app.can(school_id, 'users.view'));
CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    app.can(school_id, 'users.assign_roles')
    AND user_id <> (SELECT auth.uid())
    AND app.can_grant_role(role_id)
  );
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (
    app.can(school_id, 'users.assign_roles')
    AND user_id <> (SELECT auth.uid())
    AND app.can_grant_role(role_id)
  );
REVOKE UPDATE ON public.user_roles FROM anon, authenticated;

-- role_permissions ---------------------------------------------------------------------------
SELECT app.drop_policies('public', 'role_permissions');
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND app.can_read_school(r.school_id)));
CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.permissions p ON p.id = permission_id
    WHERE r.id = role_id
      AND NOT (r.is_system AND r.slug = 'admin')
      AND NOT p.is_platform
      AND app.can(r.school_id, 'roles.manage')
      AND app.can(r.school_id, p.slug)
  ));
CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.permissions p ON p.id = permission_id
    WHERE r.id = role_id
      AND NOT (r.is_system AND r.slug = 'admin')
      AND app.can(r.school_id, 'roles.manage')
      AND app.can(r.school_id, p.slug)
  ));

-- modules ----------------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'modules');
CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.modules FROM anon, authenticated;

SELECT app.drop_policies('public', 'school_modules');
CREATE POLICY school_modules_read ON public.school_modules FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY school_modules_update ON public.school_modules FOR UPDATE TO authenticated
  USING (app.can(school_id, 'modules.manage')) WITH CHECK (app.can(school_id, 'modules.manage'));
REVOKE INSERT, DELETE ON public.school_modules FROM anon, authenticated;

SELECT app.drop_policies('public', 'module_role_access');
CREATE POLICY module_role_access_read ON public.module_role_access FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY module_role_access_write ON public.module_role_access FOR ALL TO authenticated
  USING (app.can(school_id, 'modules.manage')) WITH CHECK (app.can(school_id, 'modules.manage'));

-- user_settings -----------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'user_settings');
CREATE POLICY user_settings_read ON public.user_settings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id()));
CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id()));

-- invitation codes ------------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'invitation_codes');
CREATE POLICY invitation_codes_read ON public.invitation_codes FOR SELECT TO authenticated
  USING (app.can(school_id, 'invitations.manage'));
CREATE POLICY invitation_codes_insert ON public.invitation_codes FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'invitations.manage') AND created_by = (SELECT auth.uid()) AND app.can_grant_role(role_id));
CREATE POLICY invitation_codes_update ON public.invitation_codes FOR UPDATE TO authenticated
  USING (app.can(school_id, 'invitations.manage')) WITH CHECK (app.can(school_id, 'invitations.manage'));

-- registration requests -----------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'registration_requests');
CREATE POLICY registration_requests_read ON public.registration_requests FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR app.can(school_id, 'users.approve'));
REVOKE INSERT, UPDATE, DELETE ON public.registration_requests FROM anon, authenticated;

-- user status history -----------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'user_status_history');
CREATE POLICY user_status_history_read ON public.user_status_history FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR app.can(school_id, 'users.view'));
REVOKE INSERT, UPDATE, DELETE ON public.user_status_history FROM anon, authenticated;

-- audit logs -----------------------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'audit_logs');
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated
  USING (app.can(school_id, 'audit.view') OR (school_id IS NULL AND app.is_platform_admin()));
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- notification settings ----------------------------------------------------------------------------------------
SELECT app.drop_policies('public', 'notification_settings');
CREATE POLICY notification_settings_read ON public.notification_settings FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY notification_settings_update ON public.notification_settings FOR UPDATE TO authenticated
  USING (app.can(school_id, 'settings.update')) WITH CHECK (app.can(school_id, 'settings.update'));
REVOKE INSERT, DELETE ON public.notification_settings FROM anon, authenticated;

-- directors (public website history of school leadership) -------------------------------------------------------------
SELECT app.drop_policies('public', 'directors');
CREATE POLICY directors_public_read ON public.directors FOR SELECT TO anon
  USING (is_visible AND EXISTS (SELECT 1 FROM public.schools s WHERE s.id = school_id AND s.status = 'active'));
CREATE POLICY directors_member_read ON public.directors FOR SELECT TO authenticated
  USING ((is_visible AND app.can_read_school(school_id)) OR app.can(school_id, 'cms.manage'));
CREATE POLICY directors_manage ON public.directors FOR ALL TO authenticated
  USING (app.can(school_id, 'cms.manage')) WITH CHECK (app.can(school_id, 'cms.manage'));

-- ----------------------------------------------------------------------------
-- 4. Account RPCs
-- ----------------------------------------------------------------------------

-- Current user's own profile including private fields.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'public_id', u.public_id, 'school_id', u.school_id, 'email', u.email,
    'first_name', u.first_name, 'last_name', u.last_name, 'middle_name', u.middle_name,
    'phone', u.phone, 'date_of_birth', u.date_of_birth, 'gender', u.gender,
    'avatar_url', u.avatar_url, 'status', u.status, 'is_active', u.is_active,
    'created_at', u.created_at,
    'school_name', s.short_name,
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id
    ), '[]'::jsonb)
  )
  FROM public.users u
  JOIN public.schools s ON s.id = u.school_id
  WHERE u.id = (SELECT auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Server-backed user administration list with search, filters and pagination.
CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_sort text DEFAULT 'created_desc',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0,
  p_school_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, public_id varchar, email varchar, first_name varchar, last_name varchar,
  middle_name varchar, phone varchar, avatar_url varchar, status text, is_active boolean,
  created_at timestamptz, last_login_at timestamptz, roles jsonb, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := coalesce(p_school_id, app.current_school_id());
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'users.view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  RETURN QUERY
  WITH filtered AS (
    SELECT u.*
    FROM public.users u
    WHERE u.school_id = v_school
      AND (p_status IS NULL OR u.status = p_status)
      AND (p_role IS NULL OR EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.slug = p_role))
      AND (v_query IS NULL
        OR u.first_name ILIKE '%' || v_query || '%'
        OR u.last_name ILIKE '%' || v_query || '%'
        OR u.middle_name ILIKE '%' || v_query || '%'
        OR u.email ILIKE '%' || v_query || '%'
        OR u.public_id ILIKE '%' || v_query || '%')
  )
  SELECT f.id, f.public_id, f.email, f.first_name, f.last_name, f.middle_name, f.phone,
         f.avatar_url, f.status, f.is_active, f.created_at, f.last_login_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg,
             'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
           FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
           WHERE ur.user_id = f.id
         ), '[]'::jsonb),
         count(*) OVER ()
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort = 'name_asc' THEN f.last_name END ASC,
    CASE WHEN p_sort = 'name_asc' THEN f.first_name END ASC,
    CASE WHEN p_sort = 'name_desc' THEN f.last_name END DESC,
    CASE WHEN p_sort = 'created_asc' THEN f.created_at END ASC,
    f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, text, text, text, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, text, text, text, int, int, uuid) TO authenticated;

-- Full account detail for administrators (or self).
CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND OR NOT (v_user.id = (SELECT auth.uid()) OR app.can(v_user.school_id, 'users.view')) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_user.id, 'public_id', v_user.public_id, 'school_id', v_user.school_id,
    'email', v_user.email, 'first_name', v_user.first_name, 'last_name', v_user.last_name,
    'middle_name', v_user.middle_name, 'phone', v_user.phone, 'date_of_birth', v_user.date_of_birth,
    'gender', v_user.gender, 'avatar_url', v_user.avatar_url, 'status', v_user.status,
    'is_active', v_user.is_active, 'created_at', v_user.created_at, 'last_login_at', v_user.last_login_at,
    'graduation_year', v_user.graduation_year,
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg,
        'name_ru', r.name_ru, 'name_en', r.name_en, 'level', r.level) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = v_user.id
    ), '[]'::jsonb),
    'history', coalesce((
      SELECT jsonb_agg(jsonb_build_object('action', h.action, 'old_value', h.old_value, 'new_value', h.new_value,
        'notes', h.notes, 'created_at', h.created_at,
        'performed_by', (SELECT jsonb_build_object('id', pu.id, 'first_name', pu.first_name, 'last_name', pu.last_name)
                         FROM public.users pu WHERE pu.id = h.performed_by))
        ORDER BY h.created_at DESC)
      FROM public.user_status_history h WHERE h.user_id = v_user.id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;

-- Account status transitions with history (block, unblock, deactivate …).
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_action text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_user.school_id, 'users.deactivate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you cannot change the status of your own account' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'blocked') THEN
    RAISE EXCEPTION 'unsupported status' USING ERRCODE = '22023';
  END IF;
  IF v_user.status IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'pending registrations are reviewed through the approvals queue' USING ERRCODE = '22023';
  END IF;
  IF v_user.is_super_admin AND NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user.status = p_status THEN
    RETURN;
  END IF;

  v_action := CASE WHEN p_status = 'blocked' THEN 'blocked' ELSE 'unblocked' END;
  UPDATE public.users SET status = p_status, is_active = (p_status = 'active') WHERE id = p_user_id;
  INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by, notes)
  VALUES (v_user.school_id, p_user_id, v_action, v_user.status, p_status, (SELECT auth.uid()), left(p_reason, 500));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated;

-- Replace a user's role set atomically, with escalation checks.
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(p_user_id uuid, p_role_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
  v_old text;
  v_new text;
  v_role uuid;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_user.school_id, 'users.assign_roles') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'you cannot change your own roles' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_role_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'at least one role is required' USING ERRCODE = '22023';
  END IF;

  FOREACH v_role IN ARRAY p_role_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.id = v_role AND r.school_id = v_user.school_id AND r.is_active)
       OR NOT app.can_grant_role(v_role) THEN
      RAISE EXCEPTION 'role cannot be assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Removing a role also requires being able to grant it.
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role_id <> ALL (p_role_ids) AND NOT app.can_grant_role(ur.role_id)
  ) THEN
    RAISE EXCEPTION 'role cannot be removed' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(r.slug, ',' ORDER BY r.slug) INTO v_old
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p_user_id;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role_id <> ALL (p_role_ids);
  INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
  SELECT p_user_id, rid, v_user.school_id, v_actor FROM unnest(p_role_ids) AS rid
  ON CONFLICT (user_id, role_id, school_id) DO NOTHING;

  SELECT string_agg(r.slug, ',' ORDER BY r.slug) INTO v_new
  FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p_user_id;

  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by)
    VALUES (v_user.school_id, p_user_id, 'role_changed', v_old, v_new, v_actor);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, uuid[]) TO authenticated;

-- Replace a custom role's permission set (system admin role is immutable).
CREATE OR REPLACE FUNCTION public.admin_set_role_permissions(p_role_id uuid, p_permission_slugs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_role.school_id, 'roles.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role.is_system AND v_role.slug = 'admin' THEN
    RAISE EXCEPTION 'the administrator role always has every school permission' USING ERRCODE = '42501';
  END IF;
  FOREACH v_slug IN ARRAY coalesce(p_permission_slugs, ARRAY[]::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.slug = v_slug AND NOT p.is_platform) THEN
      RAISE EXCEPTION 'unknown permission %', v_slug USING ERRCODE = '22023';
    END IF;
    IF NOT app.can(v_role.school_id, v_slug) THEN
      RAISE EXCEPTION 'you cannot grant a permission you do not hold' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  -- Removing permissions you do not hold is also an escalation vector for others.
  IF EXISTS (
    SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = p_role_id AND p.slug <> ALL (coalesce(p_permission_slugs, ARRAY[]::text[]))
      AND NOT app.can(v_role.school_id, p.slug)
  ) THEN
    RAISE EXCEPTION 'you cannot revoke a permission you do not hold' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.role_permissions rp
  USING public.permissions p
  WHERE rp.permission_id = p.id AND rp.role_id = p_role_id
    AND p.slug <> ALL (coalesce(p_permission_slugs, ARRAY[]::text[]));
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, p.id FROM public.permissions p WHERE p.slug = ANY (p_permission_slugs)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_role_permissions(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permissions(uuid, text[]) TO authenticated;

-- Public school directory used by the website and registration.
CREATE OR REPLACE FUNCTION public.list_public_schools()
RETURNS TABLE (id uuid, slug varchar, short_name varchar, full_name varchar, logo_url varchar,
               address varchar, district_id uuid, registration_open boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.slug, s.short_name, s.full_name, s.logo_url, s.address, s.district_id,
         coalesce((s.settings ->> 'registration_open')::boolean, true)
  FROM public.schools s
  WHERE s.status = 'active'
  ORDER BY s.short_name
$$;
GRANT EXECUTE ON FUNCTION public.list_public_schools() TO anon, authenticated;

-- Resolve the public-site tenant from host or slug.
CREATE OR REPLACE FUNCTION public.resolve_public_school(p_host text DEFAULT NULL, p_slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.schools s
  WHERE s.status = 'active'
    AND (
      (p_slug IS NOT NULL AND s.slug = lower(p_slug))
      OR (p_slug IS NULL AND p_host IS NOT NULL AND s.id = (
        SELECT d.school_id FROM public.school_domains d WHERE d.host = lower(p_host)))
    )
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_public_school(text, text) TO anon, authenticated;
