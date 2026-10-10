-- ============================================================================
-- 00029 · Operational dashboards, reports and analytics.
--
-- Every number comes from real data. Each function checks its permission in
-- the target school; cross-school overviews are restricted to admin scopes.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.require(p_school uuid, p_permission text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_school IS NULL OR NOT app.can(p_school, p_permission) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN p_school;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.require(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.require(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION app.current_year_id(p_school uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.academic_years WHERE school_id = p_school AND is_current LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.current_term_id(p_school uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id FROM public.academic_terms t
  WHERE t.school_id = p_school AND t.academic_year_id = app.current_year_id(p_school)
    AND t.kind IN ('quarter', 'semester', 'trimester', 'term') AND current_date BETWEEN t.start_date AND t.end_date
  ORDER BY t.start_date LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION app.current_year_id(uuid), app.current_term_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.current_year_id(uuid), app.current_term_id(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Admin dashboard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard(p_school_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'dashboard.view');
  v_year public.academic_years%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NOT (app.can(v_school, 'students.view') OR app.can(v_school, 'users.view') OR app.can(v_school, 'reports.view')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_year FROM public.academic_years WHERE school_id = v_school AND is_current;

  SELECT jsonb_build_object(
    'academic_year', CASE WHEN v_year.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_year.id, 'name', v_year.name,
      'start_date', v_year.start_date, 'end_date', v_year.end_date) END,
    'current_term', (SELECT jsonb_build_object('id', t.id, 'name', t.name, 'end_date', t.end_date, 'is_locked', t.is_locked)
                     FROM public.academic_terms t WHERE t.id = app.current_term_id(v_school)),
    'counts', jsonb_build_object(
      'students_active', (SELECT count(*) FROM public.students WHERE school_id = v_school AND status = 'active'),
      'staff_active', (SELECT count(*) FROM public.staff WHERE school_id = v_school AND status IN ('active', 'on_leave')),
      'teachers_active', (SELECT count(*) FROM public.staff WHERE school_id = v_school AND status = 'active' AND staff_type IN ('teacher', 'director', 'vice_principal')),
      'classes_active', (SELECT count(*) FROM public.classes WHERE school_id = v_school AND is_active AND academic_year_id = v_year.id),
      'guardians', (SELECT count(*) FROM public.guardians WHERE school_id = v_school AND status = 'active'),
      'accounts_active', (SELECT count(*) FROM public.users WHERE school_id = v_school AND status = 'active')
    ),
    'attendance_today', (
      SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE status = 'present'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'excused', count(*) FILTER (WHERE status = 'excused'),
        'students_marked', count(DISTINCT student_id))
      FROM public.attendance_records WHERE school_id = v_school AND attendance_date = current_date
    ),
    'queues', jsonb_build_object(
      'pending_registrations', (SELECT count(*) FROM public.registration_requests WHERE school_id = v_school AND status = 'pending'),
      'news_in_review', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'review'),
      'news_drafts', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'draft'),
      'news_scheduled', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'published' AND publish_at > now()),
      'library_drafts', (SELECT count(*) FROM public.library_items WHERE school_id = v_school AND status = 'draft'),
      'documents_drafts', (SELECT count(*) FROM public.documents WHERE school_id = v_school AND status = 'draft'),
      'open_reports', (SELECT count(*) FROM public.message_reports WHERE school_id = v_school AND status = 'open'),
      'grades_awaiting_approval', (SELECT count(*) FROM public.grades g JOIN public.assessment_types a ON a.id = g.assessment_type_id
                                   WHERE g.school_id = v_school AND a.is_final AND g.status = 'recorded')
    ),
    'upcoming_events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'category', e.category, 'status', e.status) ORDER BY e.starts_at)
      FROM (SELECT * FROM public.events WHERE school_id = v_school AND status = 'published' AND starts_at >= now() ORDER BY starts_at LIMIT 5) e
    ), '[]'::jsonb),
    'recent_announcements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'priority', x.priority, 'publish_at', x.publish_at) ORDER BY x.publish_at DESC)
      FROM (SELECT * FROM public.announcements WHERE school_id = v_school AND status = 'published' ORDER BY publish_at DESC LIMIT 5) x
    ), '[]'::jsonb),
    'recent_activity', CASE WHEN app.can(v_school, 'audit.view') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'entity_type', l.entity_type, 'created_at', l.created_at,
        'actor', (SELECT jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name) FROM public.users u WHERE u.id = l.user_id))
        ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.audit_logs WHERE school_id = v_school ORDER BY created_at DESC LIMIT 8) l
    ), '[]'::jsonb) ELSE NULL END,
    'alerts', to_jsonb(array_remove(ARRAY[
      CASE WHEN v_year.id IS NULL THEN 'no_current_academic_year' END,
      CASE WHEN v_year.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.academic_terms t WHERE t.academic_year_id = v_year.id) THEN 'no_terms_defined' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.classes c WHERE c.school_id = v_school AND c.is_active AND c.academic_year_id = v_year.id AND c.homeroom_staff_id IS NULL) THEN 'classes_without_homeroom_teacher' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.class_subjects cs JOIN public.classes c ON c.id = cs.class_id
                        WHERE cs.school_id = v_school AND cs.is_active AND cs.teacher_id IS NULL AND c.academic_year_id = v_year.id) THEN 'subjects_without_teacher' END,
      CASE WHEN NOT EXISTS (SELECT 1 FROM public.bell_periods b WHERE b.school_id = v_school) THEN 'no_bell_schedule' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.site_sections s WHERE s.school_id = v_school AND s.is_enabled AND NOT s.is_approved
                        AND s.section_key IN ('identity', 'hero', 'footer')) THEN 'official_content_not_approved' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.students s WHERE s.school_id = v_school AND s.status = 'active'
                        AND NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = s.id AND e.status = 'active')) THEN 'students_without_class' END
    ], NULL))
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- Teacher "Today"
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.teacher_today(p_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff uuid := app.my_staff_id();
  v_school uuid := app.current_school_id();
  v_dow int := extract(isodow FROM p_date)::int;
BEGIN
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('is_teacher', false);
  END IF;
  RETURN jsonb_build_object(
    'is_teacher', true,
    'date', p_date,
    'lessons', coalesce((
      SELECT jsonb_agg(l ORDER BY l ->> 'shift', (l ->> 'period_number')::int)
      FROM (
        SELECT jsonb_build_object(
          'timetable_entry_id', te.id, 'class_subject_id', te.class_subject_id, 'class_id', te.class_id,
          'class_name', c.name, 'subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en,
          'shift', te.shift, 'period_number', te.period_number, 'room', r.name,
          'start_time', bp.start_time, 'end_time', bp.end_time,
          'is_substitution', sub.id IS NOT NULL AND sub.substitute_teacher_id = v_staff,
          'cancelled_for_me', sub.id IS NOT NULL AND sub.substitute_teacher_id IS DISTINCT FROM v_staff AND te.teacher_id = v_staff,
          'attendance_marked', EXISTS (SELECT 1 FROM public.attendance_records ar WHERE ar.class_subject_id = te.class_subject_id
                                       AND ar.attendance_date = p_date AND ar.period_number = te.period_number),
          'students', (SELECT count(*) FROM public.enrollments e WHERE e.class_id = te.class_id AND e.status = 'active')
        ) AS l
        FROM public.timetable_entries te
        JOIN public.classes c ON c.id = te.class_id
        JOIN public.class_subjects cs ON cs.id = te.class_subject_id
        JOIN public.subjects s ON s.id = cs.subject_id
        LEFT JOIN public.rooms r ON r.id = coalesce(te.room_id, c.room_id)
        LEFT JOIN public.bell_periods bp ON bp.school_id = te.school_id AND bp.shift = te.shift AND bp.period_number = te.period_number
        LEFT JOIN public.substitutions sub ON sub.timetable_entry_id = te.id AND sub.substitution_date = p_date AND sub.status <> 'cancelled'
        WHERE te.school_id = v_school AND te.day_of_week = v_dow AND te.academic_year_id = app.current_year_id(v_school)
          AND (te.teacher_id = v_staff OR sub.substitute_teacher_id = v_staff)
      ) x
    ), '[]'::jsonb),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('class_subject_id', cs.id, 'class_id', c.id, 'class_name', c.name,
        'subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en) ORDER BY c.grade_level, c.name, s.name_tg)
      FROM public.class_subjects cs JOIN public.classes c ON c.id = cs.class_id AND c.is_active
      JOIN public.subjects s ON s.id = cs.subject_id
      WHERE cs.teacher_id = v_staff AND cs.is_active AND c.academic_year_id = app.current_year_id(v_school)
    ), '[]'::jsonb),
    'homeroom_classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('class_id', c.id, 'class_name', c.name,
        'daily_attendance_marked', EXISTS (SELECT 1 FROM public.attendance_records ar WHERE ar.class_id = c.id
                                           AND ar.class_subject_id IS NULL AND ar.attendance_date = p_date)))
      FROM public.classes c WHERE c.homeroom_staff_id = v_staff AND c.is_active
    ), '[]'::jsonb),
    'submissions_to_review', (
      SELECT count(*) FROM public.homework_submissions hs
      JOIN public.homework_assignments h ON h.id = hs.assignment_id
      JOIN public.class_subjects cs ON cs.id = h.class_subject_id
      WHERE cs.teacher_id = v_staff AND hs.status IN ('submitted', 'late')
    ),
    'homework_due_soon', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'due_at', h.due_at, 'class_name', c.name) ORDER BY h.due_at)
      FROM public.homework_assignments h JOIN public.class_subjects cs ON cs.id = h.class_subject_id
      JOIN public.classes c ON c.id = cs.class_id
      WHERE cs.teacher_id = v_staff AND h.status = 'published' AND h.due_at BETWEEN now() AND now() + interval '7 days'
    ), '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Student / guardian "Today" (a guardian passes the child's student id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_overview(p_student_id uuid DEFAULT NULL, p_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_term uuid;
BEGIN
  SELECT * INTO v_student FROM public.students
  WHERE id = coalesce(p_student_id, app.my_student_id());
  IF NOT FOUND OR NOT coalesce(
    v_student.id IS NOT DISTINCT FROM app.my_student_id()
    OR v_student.id = ANY (app.my_child_ids())
    OR app.can(v_student.school_id, 'students.view'),
    false
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_enrollment FROM public.enrollments
  WHERE student_id = v_student.id AND status = 'active' AND academic_year_id = app.current_year_id(v_student.school_id);
  v_term := app.current_term_id(v_student.school_id);

  RETURN jsonb_build_object(
    'student', jsonb_build_object('id', v_student.id, 'first_name', v_student.first_name, 'last_name', v_student.last_name,
      'status', v_student.status, 'class_id', v_enrollment.class_id,
      'class_name', (SELECT name FROM public.classes WHERE id = v_enrollment.class_id)),
    'date', p_date,
    'lessons', coalesce((
      SELECT jsonb_agg(jsonb_build_object('period_number', te.period_number, 'shift', te.shift,
        'subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en,
        'teacher', (SELECT btrim(st.last_name || ' ' || st.first_name) FROM public.staff st
                    WHERE st.id = coalesce(sub.substitute_teacher_id, te.teacher_id)),
        'room', (SELECT name FROM public.rooms WHERE id = coalesce(sub.room_id, te.room_id)),
        'start_time', bp.start_time, 'end_time', bp.end_time, 'is_substitution', sub.id IS NOT NULL)
        ORDER BY te.shift, te.period_number)
      FROM public.timetable_entries te
      JOIN public.class_subjects cs ON cs.id = te.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      LEFT JOIN public.bell_periods bp ON bp.school_id = te.school_id AND bp.shift = te.shift AND bp.period_number = te.period_number
      LEFT JOIN public.substitutions sub ON sub.timetable_entry_id = te.id AND sub.substitution_date = p_date AND sub.status <> 'cancelled'
      WHERE te.class_id = v_enrollment.class_id AND te.day_of_week = extract(isodow FROM p_date)::int
    ), '[]'::jsonb),
    'homework_due', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'due_at', h.due_at,
        'subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en,
        'submission_status', hs.status) ORDER BY h.due_at NULLS LAST)
      FROM public.homework_assignments h
      JOIN public.class_subjects cs ON cs.id = h.class_subject_id AND cs.class_id = v_enrollment.class_id
      JOIN public.subjects s ON s.id = cs.subject_id
      LEFT JOIN public.homework_submissions hs ON hs.assignment_id = h.id AND hs.student_id = v_student.id
      WHERE h.status = 'published' AND (h.due_at IS NULL OR h.due_at >= now() - interval '1 day')
        AND (hs.id IS NULL OR hs.status IN ('returned'))
    ), '[]'::jsonb),
    'latest_grades', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'score', g.score, 'max_score', g.max_score, 'grade_date', g.grade_date,
        'subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en,
        'assessment_tg', a.name_tg, 'assessment_ru', a.name_ru, 'assessment_en', a.name_en) ORDER BY g.grade_date DESC, g.created_at DESC)
      FROM (SELECT * FROM public.grades WHERE student_id = v_student.id ORDER BY grade_date DESC, created_at DESC LIMIT 8) g
      JOIN public.class_subjects cs ON cs.id = g.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      JOIN public.assessment_types a ON a.id = g.assessment_type_id
    ), '[]'::jsonb),
    'attendance_term', (
      SELECT jsonb_build_object('present', count(*) FILTER (WHERE ar.status = 'present'),
        'late', count(*) FILTER (WHERE ar.status = 'late'), 'absent', count(*) FILTER (WHERE ar.status = 'absent'),
        'excused', count(*) FILTER (WHERE ar.status = 'excused'), 'total', count(*))
      FROM public.attendance_records ar
      LEFT JOIN public.academic_terms t ON t.id = v_term
      WHERE ar.student_id = v_student.id
        AND ar.attendance_date >= coalesce(t.start_date, current_date - 90)
        AND ar.attendance_date <= coalesce(t.end_date, current_date)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_children()
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, class_name varchar, relationship varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.first_name, s.last_name,
         (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
          WHERE e.student_id = s.id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1),
         sg.relationship
  FROM public.guardians g
  JOIN public.student_guardians sg ON sg.guardian_id = g.id
  JOIN public.students s ON s.id = sg.student_id
  WHERE g.user_id = (SELECT auth.uid()) AND g.school_id = app.current_school_id() AND g.status = 'active'
  ORDER BY s.last_name, s.first_name
$$;

-- ----------------------------------------------------------------------------
-- Reports
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_enrollment(p_academic_year_id uuid DEFAULT NULL, p_school_id uuid DEFAULT NULL)
RETURNS TABLE (class_id uuid, class_name varchar, grade_level int, homeroom_teacher text, capacity int,
               active_count bigint, male_count bigint, female_count bigint, transferred_count bigint, completed_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
  v_year uuid := coalesce(p_academic_year_id, app.current_year_id(v_school));
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.grade_level,
         (SELECT btrim(st.last_name || ' ' || st.first_name || ' ' || coalesce(st.middle_name, '')) FROM public.staff st WHERE st.id = c.homeroom_staff_id),
         c.capacity,
         count(e.id) FILTER (WHERE e.status = 'active'),
         count(e.id) FILTER (WHERE e.status = 'active' AND s.gender = 'male'),
         count(e.id) FILTER (WHERE e.status = 'active' AND s.gender = 'female'),
         count(e.id) FILTER (WHERE e.status = 'transferred'),
         count(e.id) FILTER (WHERE e.status = 'completed')
  FROM public.classes c
  LEFT JOIN public.enrollments e ON e.class_id = c.id
  LEFT JOIN public.students s ON s.id = e.student_id
  WHERE c.school_id = v_school AND c.academic_year_id = v_year
  GROUP BY c.id
  ORDER BY c.grade_level, c.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_attendance(
  p_from date, p_to date, p_class_id uuid DEFAULT NULL, p_school_id uuid DEFAULT NULL
)
RETURNS TABLE (student_id uuid, student_name text, class_name varchar, present bigint, late bigint, absent bigint,
               excused bigint, total bigint, attendance_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
BEGIN
  IF p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT s.id, btrim(s.last_name || ' ' || s.first_name || ' ' || coalesce(s.middle_name, '')), c.name,
         count(*) FILTER (WHERE ar.status = 'present'), count(*) FILTER (WHERE ar.status = 'late'),
         count(*) FILTER (WHERE ar.status = 'absent'), count(*) FILTER (WHERE ar.status = 'excused'), count(*),
         round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / nullif(count(*), 0), 1)
  FROM public.attendance_records ar
  JOIN public.students s ON s.id = ar.student_id
  JOIN public.classes c ON c.id = ar.class_id
  WHERE ar.school_id = v_school AND ar.attendance_date BETWEEN p_from AND p_to
    AND (p_class_id IS NULL OR ar.class_id = p_class_id)
  GROUP BY s.id, c.name
  ORDER BY c.name, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_grades(p_class_id uuid, p_term_id uuid DEFAULT NULL, p_school_id uuid DEFAULT NULL)
RETURNS TABLE (student_id uuid, student_name text, subject_id uuid, subject_name varchar, grade_count bigint,
               average_percent numeric, final_score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT st.id, btrim(st.last_name || ' ' || st.first_name), sb.id, sb.name_tg,
         count(g.id) FILTER (WHERE NOT a.is_final),
         round(sum(100.0 * g.score / g.max_score * a.weight) FILTER (WHERE NOT a.is_final)
               / nullif(sum(a.weight) FILTER (WHERE NOT a.is_final), 0), 1),
         max(g.score) FILTER (WHERE a.is_final)
  FROM public.enrollments e
  JOIN public.students st ON st.id = e.student_id
  JOIN public.class_subjects cs ON cs.class_id = e.class_id
  JOIN public.subjects sb ON sb.id = cs.subject_id
  LEFT JOIN public.grades g ON g.student_id = st.id AND g.class_subject_id = cs.id
       AND (p_term_id IS NULL OR g.academic_term_id = p_term_id)
  LEFT JOIN public.assessment_types a ON a.id = g.assessment_type_id
  WHERE e.class_id = p_class_id AND e.status IN ('active', 'completed')
  GROUP BY st.id, sb.id
  ORDER BY 2, sb.name_tg;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_teacher_workload(p_academic_year_id uuid DEFAULT NULL, p_school_id uuid DEFAULT NULL)
RETURNS TABLE (staff_id uuid, teacher_name text, staff_type varchar, planned_weekly_hours numeric,
               scheduled_lessons_per_week bigint, max_weekly_hours numeric, classes bigint, subjects bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
  v_year uuid := coalesce(p_academic_year_id, app.current_year_id(v_school));
BEGIN
  RETURN QUERY
  SELECT st.id, btrim(st.last_name || ' ' || st.first_name || ' ' || coalesce(st.middle_name, '')), st.staff_type,
         coalesce(sum(cs.weekly_hours), 0),
         (SELECT count(*) FROM public.timetable_entries te WHERE te.teacher_id = st.id AND te.academic_year_id = v_year),
         st.max_weekly_hours,
         count(DISTINCT cs.class_id), count(DISTINCT cs.subject_id)
  FROM public.staff st
  LEFT JOIN public.class_subjects cs ON cs.teacher_id = st.id AND cs.is_active
       AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = cs.class_id AND c.academic_year_id = v_year)
  WHERE st.school_id = v_school AND st.status IN ('active', 'on_leave')
    AND (st.staff_type IN ('teacher', 'director', 'vice_principal') OR cs.id IS NOT NULL)
  GROUP BY st.id
  ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_library(p_school_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
BEGIN
  RETURN jsonb_build_object(
    'by_status', coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.library_items WHERE school_id = v_school GROUP BY status) x), '{}'::jsonb),
    'by_category', coalesce((SELECT jsonb_agg(jsonb_build_object('category', coalesce(c.name_tg, '—'), 'count', x.n) ORDER BY x.n DESC)
      FROM (SELECT category_id, count(*) n FROM public.library_items WHERE school_id = v_school AND status = 'published' GROUP BY category_id) x
      LEFT JOIN public.library_categories c ON c.id = x.category_id), '[]'::jsonb),
    'most_viewed', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'views', i.view_count,
        'readers', (SELECT count(*) FROM public.library_reading_history h WHERE h.item_id = i.id)) ORDER BY i.view_count DESC)
      FROM (SELECT * FROM public.library_items WHERE school_id = v_school AND status = 'published' ORDER BY view_count DESC LIMIT 10) i), '[]'::jsonb),
    'copies', (SELECT jsonb_build_object('total', coalesce(sum(quantity), 0), 'available', coalesce(sum(available_quantity), 0))
               FROM public.library_items WHERE school_id = v_school AND status = 'published'),
    'active_readers_30d', (SELECT count(DISTINCT user_id) FROM public.library_reading_history WHERE school_id = v_school AND updated_at > now() - interval '30 days')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_content_activity(p_from date, p_to date, p_school_id uuid DEFAULT NULL)
RETURNS TABLE (month date, news_published bigint, announcements_published bigint, events_held bigint,
               documents_published bigint, books_published bigint, registrations bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'reports.view');
BEGIN
  IF p_to < p_from OR p_to - p_from > 1100 THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT m::date,
    (SELECT count(*) FROM public.news_articles n WHERE n.school_id = v_school AND n.published_at >= m AND n.published_at < m + interval '1 month'),
    (SELECT count(*) FROM public.announcements a WHERE a.school_id = v_school AND a.published_at >= m AND a.published_at < m + interval '1 month'),
    (SELECT count(*) FROM public.events e WHERE e.school_id = v_school AND e.status = 'published' AND e.starts_at >= m AND e.starts_at < m + interval '1 month'),
    (SELECT count(*) FROM public.documents d WHERE d.school_id = v_school AND d.published_at >= m AND d.published_at < m + interval '1 month'),
    (SELECT count(*) FROM public.library_items l WHERE l.school_id = v_school AND l.published_at >= m AND l.published_at < m + interval '1 month'),
    (SELECT count(*) FROM public.registration_requests r WHERE r.school_id = v_school AND r.created_at >= m AND r.created_at < m + interval '1 month')
  FROM generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') AS m
  ORDER BY 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- Analytics (each chart answers an administrative question)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_overview(p_school_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'analytics.view');
BEGIN
  RETURN jsonb_build_object(
    -- Is attendance improving or declining over the last 12 weeks?
    'attendance_weekly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('week', w, 'rate', rate, 'records', n) ORDER BY w)
      FROM (
        SELECT date_trunc('week', attendance_date)::date AS w, count(*) AS n,
               round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / nullif(count(*), 0), 1) AS rate
        FROM public.attendance_records
        WHERE school_id = v_school AND attendance_date >= current_date - 84
        GROUP BY 1
      ) x
    ), '[]'::jsonb),
    -- Which grade levels have the most students, year over year?
    'enrollment_by_year', coalesce((
      SELECT jsonb_agg(jsonb_build_object('year', y.name, 'students', n) ORDER BY y.start_date)
      FROM (SELECT academic_year_id, count(DISTINCT student_id) n FROM public.enrollments WHERE school_id = v_school GROUP BY 1) e
      JOIN public.academic_years y ON y.id = e.academic_year_id
    ), '[]'::jsonb),
    -- Where do academic results fall this term?
    'grade_distribution', coalesce((
      SELECT jsonb_agg(jsonb_build_object('band', band, 'count', n) ORDER BY band)
      FROM (
        SELECT width_bucket(100.0 * score / max_score, 0, 100.0001, 5) AS band, count(*) n
        FROM public.grades
        WHERE school_id = v_school AND (academic_term_id = app.current_term_id(v_school) OR app.current_term_id(v_school) IS NULL)
        GROUP BY 1
      ) x
    ), '[]'::jsonb),
    -- Which subjects have the lowest average this term?
    'subject_averages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('subject', name_tg, 'average_percent', avg_pct, 'grades', n) ORDER BY avg_pct)
      FROM (
        SELECT s.name_tg, count(*) n, round(avg(100.0 * g.score / g.max_score), 1) avg_pct
        FROM public.grades g JOIN public.class_subjects cs ON cs.id = g.class_subject_id JOIN public.subjects s ON s.id = cs.subject_id
        WHERE g.school_id = v_school AND (g.academic_term_id = app.current_term_id(v_school) OR app.current_term_id(v_school) IS NULL)
        GROUP BY s.name_tg
      ) x
    ), '[]'::jsonb),
    -- Are account registrations keeping pace (last 12 months)?
    'registrations_monthly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m)
      FROM (SELECT date_trunc('month', created_at)::date m, count(*) n FROM public.registration_requests
            WHERE school_id = v_school AND created_at > now() - interval '12 months' GROUP BY 1) x
    ), '[]'::jsonb)
  );
END;
$$;

-- Cross-school oversight for district / regional / ministry administrators.
CREATE OR REPLACE FUNCTION public.scope_school_overview()
RETURNS TABLE (school_id uuid, short_name varchar, district_id uuid, status varchar, students bigint, staff bigint,
               classes bigint, attendance_rate_30d numeric, pending_registrations bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.has_admin_scope() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.short_name, s.district_id, s.status,
    (SELECT count(*) FROM public.students x WHERE x.school_id = s.id AND x.status = 'active'),
    (SELECT count(*) FROM public.staff x WHERE x.school_id = s.id AND x.status = 'active'),
    (SELECT count(*) FROM public.classes x WHERE x.school_id = s.id AND x.is_active AND x.academic_year_id = app.current_year_id(s.id)),
    (SELECT round(100.0 * count(*) FILTER (WHERE a.status IN ('present', 'late')) / nullif(count(*), 0), 1)
     FROM public.attendance_records a WHERE a.school_id = s.id AND a.attendance_date >= current_date - 30),
    (SELECT count(*) FROM public.registration_requests r WHERE r.school_id = s.id AND r.status = 'pending')
  FROM public.schools s
  WHERE app.scope_permission(s.id, 'reports.view')
  ORDER BY s.short_name;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_dashboard(uuid)', 'public.teacher_today(date)', 'public.student_overview(uuid, date)', 'public.my_children()',
    'public.report_enrollment(uuid, uuid)', 'public.report_attendance(date, date, uuid, uuid)', 'public.report_grades(uuid, uuid, uuid)',
    'public.report_teacher_workload(uuid, uuid)', 'public.report_library(uuid)', 'public.report_content_activity(date, date, uuid)',
    'public.analytics_overview(uuid)', 'public.scope_school_overview()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
