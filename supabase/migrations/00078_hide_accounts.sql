-- ============================================================================
-- 00078 · Hiding an account.
--
-- An account the school no longer wants seen — a pupil who left, a teacher who
-- moved, a test account — could be blocked, but it stayed in every list. It
-- can now be hidden: blocked, so it cannot sign in, and moved out of the
-- directory onto a tab of its own, from where it can be brought back. Nothing
-- is deleted: marks, messages and history stay where they were.
-- ============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
-- Readable where the rest of the row is (row level security decides whose).
GRANT SELECT (hidden_at) ON public.users TO authenticated;

ALTER TABLE public.user_status_history DROP CONSTRAINT IF EXISTS user_status_history_action_check;
ALTER TABLE public.user_status_history ADD CONSTRAINT user_status_history_action_check CHECK (action = ANY (ARRAY[
  'registered', 'approved', 'rejected', 'role_changed', 'class_changed', 'graduated', 'blocked', 'unblocked', 'reactivated',
  'hidden', 'unhidden'
]));

/**
 * Hides an account (p_hidden) or brings it back. Hiding blocks it too;
 * bringing it back makes it active again. Whoever may block accounts may hide
 * them, never their own.
 */
CREATE OR REPLACE FUNCTION public.set_account_hidden(p_user_id uuid, p_hidden boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_user.school_id, 'users.deactivate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you cannot change the status of your own account' USING ERRCODE = '42501';
  END IF;
  IF v_user.is_super_admin AND NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_user.status IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'pending registrations are reviewed through the approvals queue' USING ERRCODE = '22023';
  END IF;
  IF (v_user.hidden_at IS NOT NULL) = coalesce(p_hidden, false) THEN
    RETURN;
  END IF;

  IF p_hidden THEN
    UPDATE public.users SET hidden_at = now(), status = CASE WHEN status = 'graduated' THEN status ELSE 'blocked' END, is_active = false
    WHERE id = p_user_id;
  ELSE
    UPDATE public.users SET hidden_at = NULL, status = CASE WHEN status = 'graduated' THEN status ELSE 'active' END,
      is_active = (status <> 'graduated')
    WHERE id = p_user_id;
  END IF;
  INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by, notes)
  VALUES (v_user.school_id, p_user_id, CASE WHEN p_hidden THEN 'hidden' ELSE 'unhidden' END, v_user.status,
          CASE WHEN p_hidden THEN 'hidden' ELSE 'active' END, (SELECT auth.uid()), left(p_reason, 500));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_account_hidden(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_hidden(uuid, boolean, text) TO authenticated;

/**
 * The directory (00072), with hidden accounts on a tab of their own
 * (p_category 'hidden') and counted there, and nowhere else.
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
  v_category text := CASE WHEN p_category IN ('students', 'teachers', 'directors', 'parents', 'admins', 'staff', 'hidden') THEN p_category ELSE 'all' END;
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
           u.date_of_birth, u.status, u.is_active, u.credentials_issued_at, u.last_login_at, u.created_at, u.hidden_at,
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
    -- Hidden accounts are only on their own tab, and only there.
    WHERE (b.hidden_at IS NOT NULL) = (v_category = 'hidden')
      AND (v_category IN ('all', 'hidden')
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
    'counts', coalesce((SELECT jsonb_object_agg(x.category, x.n) FROM (SELECT b.category, count(*) AS n FROM base b WHERE b.hidden_at IS NULL GROUP BY b.category) x), '{}'::jsonb)
              || jsonb_build_object('hidden', (SELECT count(*) FROM base b WHERE b.hidden_at IS NOT NULL)),
    'scope', CASE WHEN v_all THEN 'school' ELSE 'homeroom' END,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'public_id', p.public_id, 'first_name', p.first_name, 'last_name', p.last_name,
        'middle_name', p.middle_name, 'nickname', p.nickname, 'avatar_url', p.avatar_url,
        'email', CASE WHEN p.email LIKE '%.invalid' THEN NULL ELSE p.email END,
        'phone', p.phone, 'date_of_birth', p.date_of_birth, 'status', p.status, 'is_active', p.is_active, 'hidden', p.hidden_at IS NOT NULL,
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
