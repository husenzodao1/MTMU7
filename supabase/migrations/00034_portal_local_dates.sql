-- ============================================================================
-- 00034 School-local dates in the portal "today" functions.
--
-- 00031 fixed attendance validation, 00032 the admin dashboard and 00033 the
-- term lookup and cross-school analytics. teacher_today() and
-- student_overview() still defaulted their date argument to the database
-- session's current_date (UTC), so between 19:00 and 24:00 Dushanbe time a
-- caller that did not pass an explicit date saw the previous day's timetable
-- and attendance window. Callers that pass a date are unaffected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.teacher_today(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_staff uuid := app.my_staff_id();
  v_school uuid := app.current_school_id();
  v_date date := coalesce(p_date, app.school_today(v_school));
  v_dow int := extract(isodow FROM v_date)::int;
BEGIN
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('is_teacher', false);
  END IF;
  RETURN jsonb_build_object(
    'is_teacher', true,
    'date', v_date,
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
                                       AND ar.attendance_date = v_date AND ar.period_number = te.period_number),
          'students', (SELECT count(*) FROM public.enrollments e WHERE e.class_id = te.class_id AND e.status = 'active')
        ) AS l
        FROM public.timetable_entries te
        JOIN public.classes c ON c.id = te.class_id
        JOIN public.class_subjects cs ON cs.id = te.class_subject_id
        JOIN public.subjects s ON s.id = cs.subject_id
        LEFT JOIN public.rooms r ON r.id = coalesce(te.room_id, c.room_id)
        LEFT JOIN public.bell_periods bp ON bp.school_id = te.school_id AND bp.shift = te.shift AND bp.period_number = te.period_number
        LEFT JOIN public.substitutions sub ON sub.timetable_entry_id = te.id AND sub.substitution_date = v_date AND sub.status <> 'cancelled'
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
                                           AND ar.class_subject_id IS NULL AND ar.attendance_date = v_date)))
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

CREATE OR REPLACE FUNCTION public.student_overview(p_student_id uuid DEFAULT NULL, p_date date DEFAULT NULL)
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
  v_date date;
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
  -- The school's own calendar day, not the database session's UTC day.
  v_date := coalesce(p_date, app.school_today(v_student.school_id));
  SELECT * INTO v_enrollment FROM public.enrollments
  WHERE student_id = v_student.id AND status = 'active' AND academic_year_id = app.current_year_id(v_student.school_id);
  v_term := app.current_term_id(v_student.school_id);

  RETURN jsonb_build_object(
    'student', jsonb_build_object('id', v_student.id, 'first_name', v_student.first_name, 'last_name', v_student.last_name,
      'status', v_student.status, 'class_id', v_enrollment.class_id,
      'class_name', (SELECT name FROM public.classes WHERE id = v_enrollment.class_id)),
    'date', v_date,
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
      LEFT JOIN public.substitutions sub ON sub.timetable_entry_id = te.id AND sub.substitution_date = v_date AND sub.status <> 'cancelled'
      WHERE te.class_id = v_enrollment.class_id AND te.day_of_week = extract(isodow FROM v_date)::int
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
        AND ar.attendance_date >= coalesce(t.start_date, v_date - 90)
        AND ar.attendance_date <= coalesce(t.end_date, v_date)
    )
  );
END;
$$;
