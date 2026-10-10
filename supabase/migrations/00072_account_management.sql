-- ============================================================================
-- 00072 · Every account in one place.
--
-- Until now a pupil was added on one page, a teacher on another, a parent on
-- a third, and a role changed on a fourth — and clicking a person in a list
-- did not open anything that could change them. This gathers it:
--
--   1. account_directory: everybody the caller may see, by kind (pupils,
--      teachers, directors, parents, administrators, other staff), with what
--      identifies them — class, homeroom, children, parents on Telegram.
--   2. account_details / save_account: one form's worth of reading and
--      writing, for any kind of account, new or existing, in one transaction:
--      the account, the person record, the class and its transfer, the posts a
--      pupil holds in their class, the parents, the homeroom, the role.
--   3. The homeroom teacher runs their own class: the same functions answer
--      them for the pupils of the class they lead, and for nobody else.
--   4. The youngest pupils belong to their parents. Below a grade the school
--      sets (4 by default) a pupil is not added without a parent; up to
--      another (5) their accounts need no e-mail of their own, and their
--      logins can be sent to the parents' Telegram.
--   5. Posts in a class: monitor, assistant monitor, the cleanliness
--      committee and the rest.
--   6. An administrator is made here too — by an administrator only, and with
--      nothing asked but what an administrator needs.
--   7. A new password, and a second step switched off for somebody who lost
--      their phone, without the service key ever leaving the server.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Small pieces
-- ----------------------------------------------------------------------------

/** A uuid, or NULL for anything that is not one — never an error. */
CREATE OR REPLACE FUNCTION app.try_uuid(p_value text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p_value::uuid;
  END IF;
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION app.try_uuid(text) TO authenticated;

/** Holds a role of the highest level (the administrator's) in their school. */
CREATE OR REPLACE FUNCTION app.is_admin_user(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    WHERE ur.user_id = p_user AND r.level <= 1
  )
$$;

CREATE OR REPLACE FUNCTION app.i_am_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.current_school_id() IS NOT NULL
     AND (app.is_admin_user((SELECT auth.uid())) OR app.is_platform_admin())
$$;

/** What kind of account this is, by the most senior role it holds. */
CREATE OR REPLACE FUNCTION app.account_category(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN coalesce(bool_or(r.level <= 1), false) THEN 'admin'
    WHEN coalesce(bool_or(r.slug IN ('director', 'vice_principal')), false) THEN 'director'
    WHEN coalesce(bool_or(r.slug = 'teacher'), false) THEN 'teacher'
    WHEN coalesce(bool_or(r.slug = 'student'), false) THEN 'student'
    WHEN coalesce(bool_or(r.slug = 'parent'), false) THEN 'parent'
    ELSE 'staff'
  END
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  WHERE ur.user_id = p_user
$$;

/** The class a pupil is in this year, if any. */
CREATE OR REPLACE FUNCTION app.student_current_class(p_student uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.class_id FROM public.enrollments e
  JOIN public.students s ON s.id = e.student_id
  WHERE e.student_id = p_student AND e.status = 'active'
    AND e.academic_year_id = app.current_year_id(s.school_id)
  ORDER BY e.enrolled_on DESC
  LIMIT 1
$$;

/** Below this grade a pupil is added only with a parent. */
CREATE OR REPLACE FUNCTION app.parent_required_max_grade(p_school uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.school_setting_int(p_school, 'parent_required_max_grade', 4)
$$;

/** Up to this grade a pupil's account is the parents' to run. */
CREATE OR REPLACE FUNCTION app.parent_managed_max_grade(p_school uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.school_setting_int(p_school, 'parent_managed_max_grade', 5)
$$;

/** The caller runs the school's register, or only their own class. */
CREATE OR REPLACE FUNCTION app.may_manage_student(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student AND s.school_id = app.current_school_id()
      AND (app.can(s.school_id, 'students.update')
           OR app.student_current_class(s.id) = ANY (app.my_homeroom_class_ids()))
  )
$$;

/**
 * May the caller change this account? Somebody who runs accounts may change
 * any in their school but an administrator's, which takes an administrator;
 * a homeroom teacher may change the pupils of their own class.
 */
CREATE OR REPLACE FUNCTION app.may_manage_account(p_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_student uuid;
BEGIN
  IF v_school IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.school_id = v_school) THEN
    RETURN false;
  END IF;
  IF app.is_admin_user(p_user) AND p_user <> (SELECT auth.uid()) AND NOT app.i_am_admin() THEN
    RETURN false;
  END IF;
  IF app.can(v_school, 'users.update') THEN
    RETURN true;
  END IF;
  SELECT s.id INTO v_student FROM public.students s WHERE s.user_id = p_user;
  RETURN v_student IS NOT NULL AND app.may_manage_student(v_student);
END;
$$;

GRANT EXECUTE ON FUNCTION app.is_admin_user(uuid), app.i_am_admin(), app.account_category(uuid),
  app.student_current_class(uuid), app.parent_required_max_grade(uuid), app.parent_managed_max_grade(uuid),
  app.may_manage_student(uuid), app.may_manage_account(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 1. Posts in a class
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  position varchar(24) NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_positions_position_check CHECK (
    position IN ('monitor', 'assistant_monitor', 'cleanliness', 'studies', 'culture', 'sports', 'health', 'press')
  ),
  CONSTRAINT class_positions_unique UNIQUE (class_id, student_id, position)
);
-- One monitor and one assistant per class; committees take as many as they need.
CREATE UNIQUE INDEX IF NOT EXISTS class_positions_one_monitor
  ON public.class_positions(class_id, position) WHERE position IN ('monitor', 'assistant_monitor');
CREATE INDEX IF NOT EXISTS idx_class_positions_student ON public.class_positions(student_id);

ALTER TABLE public.class_positions ENABLE ROW LEVEL SECURITY;
-- Who the class monitor is, is the kind of thing anybody in the corridor knows.
DROP POLICY IF EXISTS class_positions_read ON public.class_positions;
CREATE POLICY class_positions_read ON public.class_positions FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()));
DROP POLICY IF EXISTS mfa_gate ON public.class_positions;
CREATE POLICY mfa_gate ON public.class_positions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));
REVOKE INSERT, UPDATE, DELETE ON public.class_positions FROM anon, authenticated;
GRANT SELECT ON public.class_positions TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The directory
-- ----------------------------------------------------------------------------
/**
 * Everybody the caller may see, a page at a time, with how many of each kind
 * there are. Somebody who may view accounts sees the school; a homeroom
 * teacher sees the pupils of their own class.
 *
 * p_category: all | students | teachers | directors | parents | admins | staff
 */
CREATE OR REPLACE FUNCTION public.account_directory(
  p_category text DEFAULT 'all',
  p_query text DEFAULT NULL,
  p_class_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_all boolean;
  v_homeroom uuid[];
  v_year uuid;
  v_query text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_category text := CASE WHEN p_category IN ('students', 'teachers', 'directors', 'parents', 'admins', 'staff') THEN p_category ELSE 'all' END;
  v_result jsonb;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_all := app.can(v_school, 'users.view');
  v_homeroom := app.my_homeroom_class_ids();
  IF NOT v_all AND cardinality(v_homeroom) = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_year := app.current_year_id(v_school);

  WITH base AS (
    SELECT u.id, u.public_id, u.first_name, u.last_name, u.middle_name, u.nickname, u.avatar_url, u.email, u.phone,
           u.date_of_birth, u.status, u.is_active, u.credentials_issued_at, u.last_login_at, u.created_at,
           app.account_category(u.id) AS category,
           st.id AS student_id, cl.id AS class_id, cl.name AS class_name, cl.grade_level
    FROM public.users u
    LEFT JOIN public.students st ON st.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT c.id, c.name, c.grade_level FROM public.enrollments e
      JOIN public.classes c ON c.id = e.class_id
      WHERE e.student_id = st.id AND e.status = 'active' AND e.academic_year_id = v_year
      ORDER BY e.enrolled_on DESC LIMIT 1
    ) cl ON true
    WHERE u.school_id = v_school
      AND u.status <> 'rejected'
      AND (v_all OR cl.id = ANY (v_homeroom))
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (v_category = 'all'
           OR (v_category = 'students' AND b.category = 'student')
           OR (v_category = 'teachers' AND b.category = 'teacher')
           OR (v_category = 'directors' AND b.category = 'director')
           OR (v_category = 'parents' AND b.category = 'parent')
           OR (v_category = 'admins' AND b.category = 'admin')
           OR (v_category = 'staff' AND b.category = 'staff'))
      AND (p_class_id IS NULL OR b.class_id = p_class_id)
      AND (v_query IS NULL OR strpos(lower(concat_ws(' ', b.last_name, b.first_name, b.middle_name, b.public_id, b.email,
                                                     b.nickname, b.phone, b.class_name)), v_query) > 0)
  ),
  page AS (
    SELECT f.*,
           CASE f.category WHEN 'admin' THEN 0 WHEN 'director' THEN 1 WHEN 'teacher' THEN 2 WHEN 'staff' THEN 3
                           WHEN 'student' THEN 4 ELSE 5 END AS rank
    FROM filtered f
    ORDER BY rank, f.grade_level NULLS FIRST, f.class_name NULLS FIRST, lower(f.last_name), lower(f.first_name), f.id
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 500) OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'counts', coalesce((SELECT jsonb_object_agg(x.category, x.n) FROM (SELECT b.category, count(*) AS n FROM base b GROUP BY b.category) x), '{}'::jsonb),
    'scope', CASE WHEN v_all THEN 'school' ELSE 'homeroom' END,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'public_id', p.public_id, 'first_name', p.first_name, 'last_name', p.last_name,
        'middle_name', p.middle_name, 'nickname', p.nickname, 'avatar_url', p.avatar_url,
        'email', CASE WHEN p.email LIKE '%.invalid' THEN NULL ELSE p.email END,
        'phone', p.phone, 'date_of_birth', p.date_of_birth, 'status', p.status, 'is_active', p.is_active,
        'credentials_issued_at', p.credentials_issued_at, 'last_login_at', p.last_login_at,
        'category', p.category, 'class_id', p.class_id, 'class_name', p.class_name, 'grade_level', p.grade_level,
        'roles', coalesce((
          SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
          FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active WHERE ur.user_id = p.id
        ), '[]'::jsonb),
        'homeroom', (
          SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM public.staff sf
          JOIN public.classes c ON c.homeroom_staff_id = sf.id AND c.academic_year_id = v_year
          WHERE sf.user_id = p.id
        ),
        'children', (
          SELECT string_agg(btrim(s.last_name || ' ' || s.first_name), ', ' ORDER BY s.last_name)
          FROM public.guardians g
          JOIN public.student_guardians sg ON sg.guardian_id = g.id
          JOIN public.students s ON s.id = sg.student_id
          WHERE g.user_id = p.id
        ),
        'parents', CASE WHEN p.student_id IS NULL THEN NULL ELSE (
          SELECT count(*) FROM public.student_guardians sg WHERE sg.student_id = p.student_id
        ) END,
        'telegram', CASE WHEN p.student_id IS NULL THEN NULL ELSE (
          SELECT count(*) FROM public.telegram_children tc WHERE tc.student_id = p.student_id
        ) END,
        'positions', CASE WHEN p.student_id IS NULL THEN '[]'::jsonb ELSE coalesce((
          SELECT jsonb_agg(cp.position ORDER BY cp.position) FROM public.class_positions cp
          WHERE cp.student_id = p.student_id AND cp.class_id = p.class_id
        ), '[]'::jsonb) END
      ) ORDER BY p.rank, p.grade_level NULLS FIRST, p.class_name NULLS FIRST, lower(p.last_name), lower(p.first_name), p.id)
      FROM page p
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.account_directory(text, text, uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_directory(text, text, uuid, int, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. One account, read
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_user public.users%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_staff public.staff%ROWTYPE;
  v_guardian public.guardians%ROWTYPE;
  v_class public.classes%ROWTYPE;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM public.users u WHERE u.id = p_user_id AND u.school_id = v_school;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (app.can(v_school, 'users.view') OR app.may_manage_account(p_user_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_year := app.current_year_id(v_school);

  SELECT * INTO v_student FROM public.students s WHERE s.user_id = p_user_id;
  IF v_student.id IS NOT NULL THEN
    SELECT * INTO v_class FROM public.classes c WHERE c.id = app.student_current_class(v_student.id);
  END IF;
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = p_user_id;
  SELECT * INTO v_guardian FROM public.guardians g WHERE g.user_id = p_user_id;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'public_id', v_user.public_id,
    'first_name', v_user.first_name,
    'last_name', v_user.last_name,
    'middle_name', v_user.middle_name,
    'nickname', v_user.nickname,
    'avatar_url', v_user.avatar_url,
    'email', CASE WHEN v_user.email LIKE '%.invalid' THEN NULL ELSE v_user.email END,
    'phone', v_user.phone,
    'date_of_birth', v_user.date_of_birth,
    'gender', v_user.gender,
    'status', v_user.status,
    'is_active', v_user.is_active,
    'created_at', v_user.created_at,
    'last_login_at', v_user.last_login_at,
    'credentials_issued_at', v_user.credentials_issued_at,
    'category', app.account_category(v_user.id),
    'is_self', v_user.id = (SELECT auth.uid()),
    'can_edit', app.may_manage_account(v_user.id),
    'mfa', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_user.id AND f.status::text = 'verified'),
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru,
                                          'name_en', r.name_en, 'level', r.level) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = v_user.id
    ), '[]'::jsonb),
    'student', CASE WHEN v_student.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_student.id,
      'student_number', v_student.student_number,
      'address', v_student.address,
      'class_id', v_class.id,
      'class_name', v_class.name,
      'grade_level', v_class.grade_level,
      'parent_required', coalesce(v_class.grade_level <= app.parent_required_max_grade(v_school), false),
      'parent_managed', coalesce(v_class.grade_level <= app.parent_managed_max_grade(v_school), false),
      'positions', coalesce((
        SELECT jsonb_agg(cp.position ORDER BY cp.position) FROM public.class_positions cp
        WHERE cp.student_id = v_student.id AND cp.class_id = v_class.id
      ), '[]'::jsonb),
      'telegram', (SELECT count(*) FROM public.telegram_children tc WHERE tc.student_id = v_student.id),
      'guardians', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'middle_name', g.middle_name,
          'phone', g.phone, 'relationship', sg.relationship, 'is_primary', sg.is_primary, 'user_id', g.user_id
        ) ORDER BY sg.is_primary DESC, g.last_name)
        FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = v_student.id
      ), '[]'::jsonb)
    ) END,
    'staff', CASE WHEN v_staff.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_staff.id,
      'employee_number', v_staff.employee_number,
      'staff_type', v_staff.staff_type,
      'position', v_staff.position,
      'qualification', v_staff.qualification,
      'hire_date', v_staff.hire_date,
      'homeroom_class_id', (SELECT c.id FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
      'homeroom_class_name', (SELECT c.name FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
      'subjects', coalesce((
        SELECT jsonb_agg(DISTINCT sj.name_tg)
        FROM public.class_subjects cs
        JOIN public.classes c ON c.id = cs.class_id AND c.academic_year_id = v_year
        JOIN public.subjects sj ON sj.id = cs.subject_id
        WHERE cs.teacher_id = v_staff.id AND cs.is_active
      ), '[]'::jsonb)
    ) END,
    'guardian', CASE WHEN v_guardian.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_guardian.id,
      'children', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
          'relationship', sg.relationship, 'class_name', (SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(s.id))
        ) ORDER BY s.last_name)
        FROM public.student_guardians sg JOIN public.students s ON s.id = sg.student_id
        WHERE sg.guardian_id = v_guardian.id
      ), '[]'::jsonb)
    ) END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.account_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_details(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. One account, written
-- ----------------------------------------------------------------------------
/** Digits only, so +992 17 902 17 17 and 179021717 find the same parent. */
CREATE OR REPLACE FUNCTION app.phone_key(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9), '')
$$;

/**
 * Creates (p_user_id NULL) or changes an account, from what one form says.
 *
 * p_data: { kind, last_name, first_name, middle_name, nickname, date_of_birth,
 *   gender, phone, email,
 *   student: { class_id, student_number, address, positions[],
 *              guardians[{ id | last_name, first_name, middle_name, phone, relationship }] },
 *   staff: { employee_number, position, qualification, hire_date, homeroom_class_id },
 *   parent: { children[student_id], relationship } }
 *
 * kind: student | teacher | director | vice_principal | librarian | staff | parent | admin
 *
 * Answers { valid, errors[{field, code}] } or { valid, userId, login,
 * password } — the password only when one was just issued, and only here.
 */
CREATE OR REPLACE FUNCTION public.save_account(p_user_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_actor uuid := (SELECT auth.uid());
  v_year uuid;
  v_year_start date;
  v_kind text := coalesce(p_data ->> 'kind', '');
  v_new boolean := p_user_id IS NULL;
  v_user uuid := p_user_id;
  v_existing public.users%ROWTYPE;
  v_old_kind text;
  v_errors jsonb := '[]'::jsonb;

  v_last text := nullif(btrim(coalesce(p_data ->> 'last_name', '')), '');
  v_first text := nullif(btrim(coalesce(p_data ->> 'first_name', '')), '');
  v_middle text := nullif(btrim(coalesce(p_data ->> 'middle_name', '')), '');
  v_nick text := nullif(btrim(coalesce(p_data ->> 'nickname', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_data ->> 'phone', '')), '');
  v_dob date;
  v_gender text := nullif(app.parse_gender(p_data ->> 'gender'), 'invalid');

  v_st jsonb := coalesce(p_data -> 'student', '{}'::jsonb);
  v_sf jsonb := coalesce(p_data -> 'staff', '{}'::jsonb);
  v_pa jsonb := coalesce(p_data -> 'parent', '{}'::jsonb);

  v_full boolean;
  v_homeroom uuid[];
  v_class_id uuid;
  v_class public.classes%ROWTYPE;
  v_homeroom_class uuid;
  v_role_id uuid;
  v_role_slug text;
  v_placeholder boolean := false;
  v_password text;
  v_login text;
  v_student uuid;
  v_staff uuid;
  v_guardian uuid;
  v_moved int;
  v_employee text;
  v_guardians_count int := 0;
  v_item jsonb;
  v_gid uuid;
  v_rel text;
  v_keep uuid[] := ARRAY[]::uuid[];
  v_child uuid;
  v_position text;
  v_positions text[];
BEGIN
  IF v_school IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kind NOT IN ('student', 'teacher', 'director', 'vice_principal', 'librarian', 'staff', 'parent', 'admin') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  v_year := app.current_year_id(v_school);
  SELECT y.start_date INTO v_year_start FROM public.academic_years y WHERE y.id = v_year;
  v_full := app.can(v_school, 'users.update');
  v_homeroom := app.my_homeroom_class_ids();

  -- ------------------------------------------------------------- who may
  IF NOT v_new THEN
    SELECT * INTO v_existing FROM public.users u WHERE u.id = v_user AND u.school_id = v_school;
    IF NOT FOUND OR NOT app.may_manage_account(v_user) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_old_kind := app.account_category(v_user);
    -- A pupil stays a pupil and a parent a parent; posts among the staff and
    -- the administration may change. Somebody who holds no role yet may
    -- become anything.
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user)
       AND (v_old_kind IN ('student', 'parent') OR v_kind IN ('student', 'parent'))
       AND v_old_kind <> v_kind THEN
      v_errors := v_errors || jsonb_build_object('field', 'kind', 'code', 'kind_locked');
    END IF;
  END IF;

  IF v_kind = 'admin' OR (NOT v_new AND v_old_kind = 'admin') THEN
    IF NOT app.i_am_admin() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'student' THEN
    IF NOT (v_full OR app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
            OR cardinality(v_homeroom) > 0) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'parent' THEN
    IF NOT (v_full OR app.can(v_school, 'guardians.manage') OR cardinality(v_homeroom) > 0) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_full AND app.can(v_school, CASE WHEN v_new THEN 'staff.create' ELSE 'staff.update' END)) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The role this kind of account holds, and whether the caller may hand it out.
  v_role_slug := CASE v_kind WHEN 'staff' THEN 'staff' ELSE v_kind END;
  SELECT r.id INTO v_role_id FROM public.roles r
  WHERE r.school_id = v_school AND r.is_active
    AND r.slug = v_role_slug
  ORDER BY r.level LIMIT 1;
  IF v_role_id IS NULL AND v_kind = 'admin' THEN
    SELECT r.id INTO v_role_id FROM public.roles r WHERE r.school_id = v_school AND r.is_active AND r.level <= 1 ORDER BY r.level LIMIT 1;
  END IF;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;
  -- A homeroom teacher adds pupils and parents to their own class without
  -- holding every permission a pupil's role has; everyone else hands out only
  -- what they hold themselves.
  IF v_kind NOT IN ('student', 'parent') AND NOT app.can_grant_role(v_role_id) AND NOT app.i_am_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------- check
  IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'required'); END IF;
  IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'first_name', 'code', 'required'); END IF;
  IF char_length(coalesce(v_last, '')) > 100 OR char_length(coalesce(v_first, '')) > 100 OR char_length(coalesce(v_middle, '')) > 100 THEN
    v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'too_long');
  END IF;
  IF app.parse_gender(p_data ->> 'gender') = 'invalid' THEN
    v_errors := v_errors || jsonb_build_object('field', 'gender', 'code', 'invalid_enum');
  END IF;
  IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$') THEN
    v_errors := v_errors || jsonb_build_object('field', 'phone', 'code', 'invalid_phone');
  END IF;

  BEGIN
    v_dob := app.try_date(nullif(btrim(coalesce(p_data ->> 'date_of_birth', '')), ''));
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
    v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'invalid_date');
  END;
  IF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '100 years') THEN
    v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'out_of_range');
  END IF;

  IF v_nick IS NOT NULL THEN
    IF v_nick !~ '^[A-Za-z0-9._]{3,30}$' THEN
      v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'invalid_nickname');
    ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.school_id = v_school AND lower(u.nickname) = lower(v_nick) AND u.id IS DISTINCT FROM v_user) THEN
      v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'duplicate_existing');
    END IF;
  END IF;

  IF v_kind = 'student' THEN
    v_class_id := app.try_uuid(v_st ->> 'class_id');
    IF v_class_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'required');
    ELSE
      SELECT * INTO v_class FROM public.classes c WHERE c.id = v_class_id AND c.school_id = v_school AND c.academic_year_id = v_year;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'unknown_class');
      ELSIF NOT v_full AND NOT app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
            AND NOT (v_class_id = ANY (v_homeroom)) THEN
        -- A homeroom teacher moves nobody into, or out of, somebody else's class.
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_dob IS NULL AND v_new THEN
      v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'required');
    END IF;
    -- The youngest are added with a parent: new ones listed here, or ones
    -- already linked and not being taken away.
    SELECT count(*) INTO v_guardians_count FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) x
    WHERE app.try_uuid(x ->> 'id') IS NOT NULL
       OR (nullif(btrim(coalesce(x ->> 'first_name', '')), '') IS NOT NULL AND app.phone_key(x ->> 'phone') IS NOT NULL);
    IF NOT (v_st ? 'guardians') AND NOT v_new THEN
      SELECT count(*) INTO v_guardians_count FROM public.student_guardians sg
      JOIN public.students s ON s.id = sg.student_id WHERE s.user_id = v_user;
    END IF;
    IF v_class.id IS NOT NULL AND v_class.grade_level <= app.parent_required_max_grade(v_school) AND v_guardians_count = 0 THEN
      v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_required');
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) LOOP
      IF app.try_uuid(v_item ->> 'id') IS NULL THEN
        IF nullif(btrim(coalesce(v_item ->> 'first_name', '')), '') IS NULL OR nullif(btrim(coalesce(v_item ->> 'last_name', '')), '') IS NULL THEN
          v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_name');
        END IF;
        IF app.phone_key(v_item ->> 'phone') IS NULL OR (v_item ->> 'phone') !~ '^[+0-9 ()-]{5,30}$' THEN
          v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_phone');
        END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = app.try_uuid(v_item ->> 'id') AND g.school_id = v_school) THEN
        v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'unknown_guardian');
      END IF;
    END LOOP;
    SELECT array_agg(DISTINCT p) INTO v_positions
    FROM jsonb_array_elements_text(coalesce(v_st -> 'positions', '[]'::jsonb)) p;
    IF EXISTS (SELECT 1 FROM unnest(coalesce(v_positions, ARRAY[]::text[])) p
               WHERE p NOT IN ('monitor', 'assistant_monitor', 'cleanliness', 'studies', 'culture', 'sports', 'health', 'press')) THEN
      v_errors := v_errors || jsonb_build_object('field', 'positions', 'code', 'invalid_enum');
    END IF;
  ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    v_employee := nullif(btrim(coalesce(v_sf ->> 'employee_number', '')), '');
    IF v_employee IS NOT NULL THEN
      IF v_employee !~ '^[A-Za-z0-9-]{1,32}$' THEN
        v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'invalid_number');
      ELSIF EXISTS (SELECT 1 FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee
                    AND s.user_id IS DISTINCT FROM v_user) THEN
        v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'duplicate_existing');
      END IF;
    END IF;
    v_homeroom_class := app.try_uuid(v_sf ->> 'homeroom_class_id');
    IF v_homeroom_class IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.classes c WHERE c.id = v_homeroom_class AND c.school_id = v_school AND c.academic_year_id = v_year
    ) THEN
      v_errors := v_errors || jsonb_build_object('field', 'homeroom_class_id', 'code', 'unknown_class');
    END IF;
  ELSIF v_kind = 'parent' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
      v_child := app.try_uuid(v_item #>> '{}');
      IF v_child IS NULL OR NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_child AND s.school_id = v_school) THEN
        v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'unknown_student');
      ELSIF NOT app.may_manage_student(v_child) AND NOT app.can(v_school, 'guardians.manage') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(v_pa -> 'children', '[]'::jsonb)) = 0 THEN
      v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'required');
    END IF;
  END IF;

  -- An address of their own, except for the youngest pupils and parents,
  -- whose accounts are reached through the school and the parents' bot.
  IF v_email IS NOT NULL THEN
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' OR v_email LIKE '%.invalid' THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'invalid_email');
    ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.email = v_email AND u.id IS DISTINCT FROM v_user)
       OR EXISTS (SELECT 1 FROM auth.users au WHERE au.email = v_email AND au.id IS DISTINCT FROM v_user) THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'duplicate_existing');
    END IF;
  ELSIF v_new OR coalesce(v_existing.email, '') NOT LIKE '%.invalid' THEN
    IF v_kind = 'parent' OR (v_kind = 'student' AND v_class.id IS NOT NULL AND v_class.grade_level <= app.parent_managed_max_grade(v_school)) THEN
      v_placeholder := v_new OR v_existing.email IS NULL;
    ELSIF v_new OR v_existing.email IS NULL THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'required');
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'errors', v_errors);
  END IF;

  -- --------------------------------------------------------------- write
  IF v_new THEN
    IF v_placeholder OR v_email IS NULL THEN
      -- An address that can never receive mail (RFC 2606), confirmed by the
      -- school: the account signs in with its login.
      v_email := CASE v_kind WHEN 'parent' THEN 'p' ELSE 's' END || app.random_password(12)
                 || '@' || CASE v_kind WHEN 'parent' THEN 'parents' ELSE 'pupils' END || '.invalid';
      v_placeholder := true;
    END IF;
    v_password := app.random_password();
    v_user := app.create_login(v_email, v_password);
    IF v_placeholder THEN
      UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
    END IF;
    INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
                              nickname, status, is_active, credentials_issued_at)
    VALUES (v_user, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, v_nick, 'active', true, now());
  ELSE
    IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_existing.email THEN
      UPDATE auth.users SET email = v_email, email_confirmed_at = NULL, updated_at = now() WHERE id = v_user;
      UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
      WHERE user_id = v_user AND provider = 'email';
    ELSE
      v_email := v_existing.email;
    END IF;
    UPDATE public.users SET
      email = v_email, first_name = v_first, last_name = v_last, middle_name = v_middle, phone = v_phone,
      date_of_birth = coalesce(v_dob, date_of_birth), gender = v_gender, nickname = v_nick, updated_at = now()
    WHERE id = v_user;
  END IF;
  SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;

  -- The role. A changed kind swaps the post it came from for the new one;
  -- anything else the person holds stays.
  IF NOT v_new AND v_old_kind <> v_kind THEN
    DELETE FROM public.user_roles ur USING public.roles r
    WHERE ur.user_id = v_user AND ur.role_id = r.id AND ur.school_id = v_school
      AND (r.level <= 1 OR r.slug IN ('director', 'vice_principal', 'teacher', 'librarian', 'staff'))
      AND r.id <> v_role_id;
  END IF;
  INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
  VALUES (v_user, v_role_id, v_school, v_actor)
  ON CONFLICT DO NOTHING;

  -- The person behind the account.
  IF v_kind = 'student' THEN
    SELECT s.id INTO v_student FROM public.students s WHERE s.user_id = v_user;
    IF v_student IS NULL THEN
      INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, phone,
                                   admission_date, student_number, address, created_by)
      VALUES (v_school, v_user, v_first, v_last, v_middle, v_gender, v_dob, v_phone, current_date,
              nullif(btrim(coalesce(v_st ->> 'student_number', '')), ''), nullif(btrim(coalesce(v_st ->> 'address', '')), ''), v_actor)
      RETURNING id INTO v_student;
    ELSE
      UPDATE public.students SET
        first_name = v_first, last_name = v_last, middle_name = v_middle, gender = v_gender,
        date_of_birth = coalesce(v_dob, date_of_birth), phone = v_phone,
        student_number = CASE WHEN v_st ? 'student_number' THEN nullif(btrim(coalesce(v_st ->> 'student_number', '')), '') ELSE student_number END,
        address = CASE WHEN v_st ? 'address' THEN nullif(btrim(coalesce(v_st ->> 'address', '')), '') ELSE address END,
        updated_at = now()
      WHERE id = v_student;
    END IF;

    -- A move is a transfer, not an overwrite: the class they left stays on record.
    UPDATE public.enrollments SET status = 'transferred', left_on = current_date, updated_at = now()
    WHERE student_id = v_student AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = v_student AND e.academic_year_id = v_year AND e.status = 'active') THEN
      INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on, created_by)
      VALUES (v_school, v_student, v_class_id, v_year,
              CASE WHEN v_moved > 0 OR NOT v_new THEN current_date ELSE least(current_date, coalesce(v_year_start, current_date)) END,
              v_actor);
    END IF;

    -- Posts: those of the class they are in now, as listed.
    IF v_st ? 'positions' OR v_moved > 0 THEN
      DELETE FROM public.class_positions cp
      WHERE cp.student_id = v_student
        AND (cp.class_id <> v_class_id OR NOT (cp.position = ANY (coalesce(v_positions, ARRAY[]::text[]))));
      FOREACH v_position IN ARRAY coalesce(v_positions, ARRAY[]::text[]) LOOP
        IF v_position IN ('monitor', 'assistant_monitor') THEN
          -- A new monitor replaces the old one.
          DELETE FROM public.class_positions cp WHERE cp.class_id = v_class_id AND cp.position = v_position AND cp.student_id <> v_student;
        END IF;
        INSERT INTO public.class_positions (school_id, class_id, student_id, position, created_by)
        VALUES (v_school, v_class_id, v_student, v_position, v_actor)
        ON CONFLICT (class_id, student_id, position) DO NOTHING;
      END LOOP;
    END IF;

    -- Parents: the ones listed, found by telephone when the school already
    -- knows them (brothers and sisters share parents), made when it does not.
    IF v_st ? 'guardians' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) LOOP
        v_gid := app.try_uuid(v_item ->> 'id');
        v_rel := CASE WHEN (v_item ->> 'relationship') IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')
                      THEN v_item ->> 'relationship' ELSE 'guardian' END;
        IF v_gid IS NULL THEN
          SELECT g.id INTO v_gid FROM public.guardians g
          WHERE g.school_id = v_school AND app.phone_key(g.phone) = app.phone_key(v_item ->> 'phone')
            AND lower(g.first_name) = lower(btrim(v_item ->> 'first_name'))
          LIMIT 1;
        END IF;
        IF v_gid IS NULL THEN
          INSERT INTO public.guardians (school_id, first_name, last_name, middle_name, phone)
          VALUES (v_school, btrim(v_item ->> 'first_name'), btrim(v_item ->> 'last_name'),
                  nullif(btrim(coalesce(v_item ->> 'middle_name', '')), ''), btrim(v_item ->> 'phone'))
          RETURNING id INTO v_gid;
        END IF;
        v_keep := v_keep || v_gid;
        INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
        VALUES (v_student, v_gid, v_school, v_rel, cardinality(v_keep) = 1)
        ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship, is_primary = EXCLUDED.is_primary;
      END LOOP;
      DELETE FROM public.student_guardians sg WHERE sg.student_id = v_student AND NOT (sg.guardian_id = ANY (v_keep));
    END IF;

  ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    SELECT s.id INTO v_staff FROM public.staff s WHERE s.user_id = v_user;
    IF v_employee IS NULL THEN
      SELECT s.employee_number INTO v_employee FROM public.staff s WHERE s.id = v_staff;
    END IF;
    IF v_employee IS NULL THEN
      -- The next free number: what the timetable will call them.
      SELECT (coalesce(max(nullif(regexp_replace(s.employee_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text
      INTO v_employee FROM public.staff s WHERE s.school_id = v_school AND s.employee_number ~ '^\d{1,12}$';
    END IF;
    IF v_staff IS NULL THEN
      INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender, date_of_birth,
                                staff_type, position, qualification, hire_date, phone, email, created_by)
      VALUES (v_school, v_user, v_employee, v_first, v_last, v_middle, v_gender, v_dob,
              CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
              nullif(btrim(coalesce(v_sf ->> 'position', '')), ''), nullif(btrim(coalesce(v_sf ->> 'qualification', '')), ''),
              coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), current_date),
              v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, v_actor)
      RETURNING id INTO v_staff;
    ELSE
      UPDATE public.staff SET
        employee_number = v_employee, first_name = v_first, last_name = v_last, middle_name = v_middle,
        gender = v_gender, date_of_birth = coalesce(v_dob, date_of_birth),
        staff_type = CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
        position = CASE WHEN v_sf ? 'position' THEN nullif(btrim(coalesce(v_sf ->> 'position', '')), '') ELSE position END,
        qualification = CASE WHEN v_sf ? 'qualification' THEN nullif(btrim(coalesce(v_sf ->> 'qualification', '')), '') ELSE qualification END,
        hire_date = coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), hire_date),
        phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END,
        status = CASE WHEN status = 'archived' THEN 'active' ELSE status END,
        updated_at = now()
      WHERE id = v_staff;
    END IF;
    IF v_sf ? 'homeroom_class_id' THEN
      UPDATE public.classes SET homeroom_staff_id = NULL, updated_at = now()
      WHERE homeroom_staff_id = v_staff AND academic_year_id = v_year AND id IS DISTINCT FROM v_homeroom_class;
      IF v_homeroom_class IS NOT NULL THEN
        UPDATE public.classes SET homeroom_staff_id = v_staff, updated_at = now() WHERE id = v_homeroom_class;
      END IF;
    END IF;

  ELSIF v_kind = 'parent' THEN
    SELECT g.id INTO v_guardian FROM public.guardians g WHERE g.user_id = v_user;
    IF v_guardian IS NULL THEN
      SELECT g.id INTO v_guardian FROM public.guardians g
      WHERE g.school_id = v_school AND g.user_id IS NULL AND app.phone_key(g.phone) = app.phone_key(v_phone)
        AND lower(g.first_name) = lower(v_first)
      LIMIT 1;
    END IF;
    IF v_guardian IS NULL THEN
      INSERT INTO public.guardians (school_id, user_id, first_name, last_name, middle_name, phone, email)
      VALUES (v_school, v_user, v_first, v_last, v_middle, v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END)
      RETURNING id INTO v_guardian;
    ELSE
      UPDATE public.guardians SET user_id = v_user, first_name = v_first, last_name = v_last, middle_name = v_middle,
        phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, updated_at = now()
      WHERE id = v_guardian;
    END IF;
    v_rel := CASE WHEN (v_pa ->> 'relationship') IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')
                  THEN v_pa ->> 'relationship' ELSE 'guardian' END;
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
      v_child := app.try_uuid(v_item #>> '{}');
      v_keep := v_keep || v_child;
      INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
      VALUES (v_child, v_guardian, v_school, v_rel,
              NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = v_child AND x.is_primary))
      ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship;
    END LOOP;
    IF app.can(v_school, 'guardians.manage') OR v_full THEN
      DELETE FROM public.student_guardians sg WHERE sg.guardian_id = v_guardian AND NOT (sg.student_id = ANY (v_keep));
    END IF;
  END IF;

  PERFORM app.write_audit(v_school, CASE WHEN v_new THEN 'create_account' ELSE 'update_account' END, 'user', v_user,
    NULL, NULL, jsonb_build_object('kind', v_kind));
  IF v_password IS NOT NULL THEN
    PERFORM app.write_audit(v_school, 'issue_credentials', 'user', v_user, NULL, NULL, jsonb_build_object('count', 1));
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'userId', v_user,
    'login', v_login,
    'password', v_password,
    'created', v_new
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_account(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. A new password, and the second step switched off
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_account_password(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_password text;
  v_login text;
BEGIN
  IF v_school IS NULL OR p_user_id = (SELECT auth.uid()) OR NOT app.may_manage_account(p_user_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_password := app.random_password();
  UPDATE auth.users SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf', 10)), updated_at = now()
  WHERE id = p_user_id;
  -- Whoever was signed in with the old password is signed out.
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING p_user_id;
  END IF;
  UPDATE public.users SET credentials_issued_at = now(), updated_at = now() WHERE id = p_user_id
  RETURNING public_id INTO v_login;
  PERFORM app.write_audit(v_school, 'reset_password', 'user', p_user_id, NULL, NULL, NULL);
  RETURN jsonb_build_object('login', v_login, 'password', v_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reset_account_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_account_password(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_account_mfa(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
BEGIN
  IF v_school IS NULL OR p_user_id = (SELECT auth.uid()) OR NOT app.can(v_school, 'users.update')
     OR NOT app.may_manage_account(p_user_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  PERFORM app.write_audit(v_school, 'reset_mfa', 'user', p_user_id, NULL, NULL, NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reset_account_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_account_mfa(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Logins to the parents' Telegram
-- ----------------------------------------------------------------------------
/**
 * For the logins just handed out, the young pupils among them whose parents
 * follow them in the bot: who they are, and which chats to tell. Only pupils
 * the caller may manage, and only up to the grade the school's parents run.
 */
CREATE OR REPLACE FUNCTION public.account_credentials_recipients(p_logins text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'login', u.public_id,
    'first_name', u.first_name,
    'last_name', u.last_name,
    'middle_name', u.middle_name,
    'nickname', u.nickname,
    'class_name', c.name,
    'chats', (
      SELECT jsonb_agg(jsonb_build_object('chat_id', tc.chat_id, 'locale', ch.locale))
      FROM public.telegram_children tc JOIN public.telegram_chats ch ON ch.chat_id = tc.chat_id
      WHERE tc.student_id = s.id
    )
  )), '[]'::jsonb)
  FROM public.users u
  JOIN public.students s ON s.user_id = u.id
  JOIN public.classes c ON c.id = app.student_current_class(s.id)
  WHERE u.school_id = app.current_school_id()
    AND upper(u.public_id) = ANY (SELECT upper(x) FROM unnest(coalesce(p_logins, ARRAY[]::text[])) x)
    AND c.grade_level <= app.parent_managed_max_grade(u.school_id)
    AND app.may_manage_student(s.id)
    AND EXISTS (SELECT 1 FROM public.telegram_children tc WHERE tc.student_id = s.id)
$$;
REVOKE EXECUTE ON FUNCTION public.account_credentials_recipients(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_credentials_recipients(text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Parents from the register workbook
-- ----------------------------------------------------------------------------
/**
 * After the pupils' workbook is imported: the parent written beside each
 * pupil ("Насаб Ном", and a telephone), found or made, and linked.
 */
CREATE OR REPLACE FUNCTION public.import_guardians(p_rows jsonb)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_row jsonb;
  v_student uuid;
  v_guardian uuid;
  v_parts text[];
  v_linked int := 0;
  v_rel text;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'students.import') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_year := app.current_year_id(v_school);
  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    CONTINUE WHEN nullif(btrim(coalesce(v_row ->> 'guardian_name', '')), '') IS NULL OR app.phone_key(v_row ->> 'guardian_phone') IS NULL;
    v_student := NULL;
    IF nullif(btrim(coalesce(v_row ->> 'login', '')), '') IS NOT NULL THEN
      SELECT s.id INTO v_student FROM public.students s JOIN public.users u ON u.id = s.user_id
      WHERE u.school_id = v_school AND upper(u.public_id) = upper(btrim(v_row ->> 'login'));
    END IF;
    IF v_student IS NULL THEN
      SELECT st.id INTO v_student FROM public.students st
      JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active' AND e.academic_year_id = v_year
      JOIN public.classes c ON c.id = e.class_id
      WHERE st.school_id = v_school
        AND app.normalize_class_name(c.name) = app.normalize_class_name(v_row ->> 'class_name')
        AND lower(st.last_name) = lower(btrim(v_row ->> 'last_name'))
        AND lower(st.first_name) = lower(btrim(v_row ->> 'first_name'))
      LIMIT 1;
    END IF;
    CONTINUE WHEN v_student IS NULL;

    v_parts := regexp_split_to_array(btrim(v_row ->> 'guardian_name'), '\s+');
    SELECT g.id INTO v_guardian FROM public.guardians g
    WHERE g.school_id = v_school AND app.phone_key(g.phone) = app.phone_key(v_row ->> 'guardian_phone')
    LIMIT 1;
    IF v_guardian IS NULL THEN
      INSERT INTO public.guardians (school_id, last_name, first_name, middle_name, phone)
      VALUES (v_school, v_parts[1], coalesce(v_parts[2], v_parts[1]), nullif(array_to_string(v_parts[3:], ' '), ''),
              btrim(v_row ->> 'guardian_phone'))
      RETURNING id INTO v_guardian;
    END IF;
    v_rel := CASE lower(btrim(coalesce(v_row ->> 'guardian_relationship', '')))
      WHEN 'модар' THEN 'mother' WHEN 'мать' THEN 'mother' WHEN 'mother' THEN 'mother'
      WHEN 'падар' THEN 'father' WHEN 'отец' THEN 'father' WHEN 'father' THEN 'father'
      ELSE 'guardian' END;
    INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
    VALUES (v_student, v_guardian, v_school, v_rel,
            NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = v_student AND x.is_primary))
    ON CONFLICT (student_id, guardian_id) DO NOTHING;
    v_linked := v_linked + 1;
  END LOOP;
  RETURN v_linked;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_guardians(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guardians(jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. The member card says what post a pupil holds in their class
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_user public.users%ROWTYPE;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM public.users u
  WHERE u.id = p_user_id AND u.school_id = v_school AND u.is_active AND u.status IN ('active', 'graduated');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'first_name', v_user.first_name,
    'last_name', v_user.last_name,
    'middle_name', v_user.middle_name,
    'avatar_url', v_user.avatar_url,
    'nickname', v_user.nickname,
    'status', v_user.status,
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      WHERE ur.user_id = v_user.id AND ur.school_id = v_school
    ), '[]'::jsonb),
    'class', (
      SELECT c.name FROM public.students s
      JOIN public.enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN public.academic_years y ON y.id = e.academic_year_id AND y.is_current
      JOIN public.classes c ON c.id = e.class_id
      WHERE s.user_id = v_user.id
      LIMIT 1
    ),
    'positions', coalesce((
      SELECT jsonb_agg(cp.position ORDER BY cp.position)
      FROM public.students s
      JOIN public.class_positions cp ON cp.student_id = s.id AND cp.class_id = app.student_current_class(s.id)
      WHERE s.user_id = v_user.id
    ), '[]'::jsonb),
    'subjects', coalesce((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('tg', sj.name_tg, 'ru', sj.name_ru, 'en', sj.name_en))
      FROM public.staff st
      JOIN public.class_subjects cs ON cs.teacher_id = st.id AND cs.is_active
      JOIN public.classes c ON c.id = cs.class_id
      JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
      JOIN public.subjects sj ON sj.id = cs.subject_id
      WHERE st.user_id = v_user.id
    ), '[]'::jsonb),
    'homeroom', (
      SELECT c.name FROM public.staff st
      JOIN public.classes c ON c.homeroom_staff_id = st.id
      JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
      WHERE st.user_id = v_user.id
      LIMIT 1
    )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_card(uuid) TO authenticated;
