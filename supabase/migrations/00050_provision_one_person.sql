-- Adding one person, the way the workbook adds a thousand.
--
-- A pupil arrives in November; a teacher is hired in January. Neither is worth
-- a spreadsheet, and since the school began issuing logins there is no other
-- way in — so "add a person" has to do everything the import does: the person
-- record, the account, the role, and a login and password to hand over.
--
-- It does it by calling the importer with a single row rather than by repeating
-- it. One description of what a valid person is, one place that writes
-- auth.users, one set of tests. What is added here is only what a form can say
-- and a spreadsheet cannot: which role this person is to hold, and the details
-- of a post that the workbook has no column for.

CREATE OR REPLACE FUNCTION public.provision_person(
  p_kind text,
  p_row jsonb,
  p_role_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_preview jsonb;
  v_result jsonb;
  v_credential jsonb;
  v_login text;
  v_user uuid;
  v_person uuid;
  v_role public.roles%ROWTYPE;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- The role is settled before anything is written: being told afterwards that
  -- the post could not be granted, with an account already made, is the one
  -- outcome that leaves the administrator worse off than before.
  IF p_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public.roles r WHERE r.id = p_role_id;
    IF NOT FOUND OR v_role.school_id <> v_school OR NOT v_role.is_active THEN
      RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
    END IF;
    IF v_role.level <= 1 THEN
      -- The administrator role carries every permission there is; it is granted
      -- from the roles page, deliberately, and never as a side effect of adding
      -- somebody to a list.
      RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
    END IF;
    IF NOT app.can_grant_role(p_role_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_preview := public.import_people(p_kind, jsonb_build_array(p_row), true, 0, 1);
  IF NOT (v_preview ->> 'valid')::boolean THEN
    RETURN jsonb_build_object('valid', false, 'errors', v_preview -> 'errors');
  END IF;

  v_result := public.import_people(p_kind, jsonb_build_array(p_row), false, 0, 1);
  IF NOT (v_result ->> 'valid')::boolean THEN
    RETURN jsonb_build_object('valid', false, 'errors', v_result -> 'errors');
  END IF;

  -- A new person comes back with a password; one the school already held comes
  -- back with neither, because their password is theirs and is not reissued.
  v_credential := (v_result -> 'credentials') -> 0;
  v_login := coalesce(v_credential ->> 'login', nullif(upper(btrim(coalesce(p_row ->> 'login', ''))), ''));

  IF v_login IS NULL THEN
    -- Matched by teacher number or by name: find them the same way the import
    -- did, so the answer names the person the form actually touched.
    IF p_kind = 'staff' THEN
      SELECT s.user_id INTO v_user FROM public.staff s
      WHERE s.school_id = v_school AND s.employee_number = btrim(p_row ->> 'employee_number');
    ELSE
      SELECT u.id INTO v_user FROM public.users u
      WHERE u.school_id = v_school AND u.email = lower(btrim(p_row ->> 'email'));
    END IF;
  ELSE
    SELECT u.id INTO v_user FROM public.users u
    WHERE u.school_id = v_school AND upper(u.public_id) = upper(v_login);
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unexpected' USING ERRCODE = 'P0002';
  END IF;
  SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;

  IF p_role_id IS NOT NULL THEN
    -- One post at a time: a form that adds a role without removing the last one
    -- quietly accumulates them, and nobody notices until someone can do more
    -- than they should.
    DELETE FROM public.user_roles WHERE user_id = v_user AND school_id = v_school;
    INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
    VALUES (v_user, p_role_id, v_school, (SELECT auth.uid()))
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_kind = 'staff' THEN
    SELECT s.id INTO v_person FROM public.staff s WHERE s.user_id = v_user;
    UPDATE public.staff SET
      position = coalesce(nullif(btrim(coalesce(p_row ->> 'position_title', '')), ''), position),
      qualification = coalesce(nullif(btrim(coalesce(p_row ->> 'qualification', '')), ''), qualification),
      hire_date = coalesce(app.try_date(nullif(btrim(coalesce(p_row ->> 'hire_date', '')), '')), hire_date),
      max_weekly_hours = coalesce((nullif(btrim(coalesce(p_row ->> 'max_weekly_hours', '')), ''))::numeric, max_weekly_hours),
      updated_at = now()
    WHERE id = v_person;
  ELSE
    SELECT s.id INTO v_person FROM public.students s WHERE s.user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'userId', v_user,
    'personId', v_person,
    'login', v_login,
    'password', v_credential ->> 'password',
    'created', (v_result ->> 'created')::int
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.provision_person(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_person(text, jsonb, uuid) TO authenticated;

-- The roles an administrator may actually hand out, for the form to offer.
-- Only what they themselves hold: app.can_grant_role refuses the rest, and a
-- list that offers what will be refused is a list that wastes people's time.
CREATE OR REPLACE FUNCTION public.grantable_roles()
RETURNS TABLE (id uuid, slug text, name_tg text, name_ru text, name_en text, level int, permissions bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.slug, r.name_tg, r.name_ru, r.name_en, r.level,
         (SELECT count(*) FROM public.role_permissions rp WHERE rp.role_id = r.id)
  FROM public.roles r
  WHERE r.school_id = app.current_school_id()
    AND r.is_active
    AND r.level > 1
    -- Changing what post somebody holds is governed by users.update; without
    -- it the form offers nothing and the role follows from the post title
    -- written on the form, exactly as it does in the workbook.
    AND app.can(app.current_school_id(), 'users.update')
    AND app.can_grant_role(r.id)
  ORDER BY r.level, r.name_tg
$$;
REVOKE EXECUTE ON FUNCTION public.grantable_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grantable_roles() TO authenticated;

-- What a role lets somebody do, in the words the permission catalogue uses, so
-- the form can say "ҷадвали дарсӣ, импорт, хонандагон" rather than a level.
CREATE OR REPLACE FUNCTION public.role_permission_slugs(p_role_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(p.slug ORDER BY p.slug), ARRAY[]::text[])
  FROM public.roles r
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE r.id = p_role_id AND r.school_id = app.current_school_id()
$$;
REVOKE EXECUTE ON FUNCTION public.role_permission_slugs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_permission_slugs(uuid) TO authenticated;
