-- A register kept the way registers are kept read as nought per cent.
--
-- The attendance figure was the share of *attendance records* that said the
-- pupil was there. That is right for a school that calls the roll every lesson
-- and writes down all thirty answers. It is wrong for the class journal, which
-- is what this portal actually gives teachers: a journal records the
-- exceptions, and a blank square means the child was in their seat. So a pupil
-- with one late mark and nothing else had one record, none of them 'present',
-- and the portal told them their attendance was 0%.
--
-- The denominator is the number of lessons, which the register knows: one
-- ruled column is one lesson. Where a school does call the roll, there are
-- more records than columns, and the larger of the two is the truth either way.
-- Being late is still being there.
--
-- attendance_term gains `lessons`; nothing is taken away, so anything reading
-- the old fields keeps working.

CREATE OR REPLACE FUNCTION app.lessons_held(p_student uuid, p_from date, p_to date)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::int
  FROM public.journal_columns jc
  JOIN public.class_subjects cs ON cs.id = jc.class_subject_id
  JOIN public.enrollments e
    ON e.class_id = cs.class_id
   AND e.student_id = p_student
   AND e.status = 'active'
  WHERE jc.kind = 'lesson'
    AND jc.column_date BETWEEN p_from AND p_to
    AND jc.column_date >= e.enrolled_on
    AND (e.left_on IS NULL OR jc.column_date <= e.left_on);
$$;
REVOKE EXECUTE ON FUNCTION app.lessons_held(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.lessons_held(uuid, date, date) TO authenticated;

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
  v_from date;
  v_to date;
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

  -- The term runs past today; a lesson that has not happened cannot be missed.
  SELECT coalesce(t.start_date, v_date - 90), least(coalesce(t.end_date, v_date), v_date)
    INTO v_from, v_to
  FROM (SELECT 1) AS one
  LEFT JOIN public.academic_terms t ON t.id = v_term;

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
        'excused', count(*) FILTER (WHERE ar.status = 'excused'), 'total', count(*),
        'lessons', app.lessons_held(v_student.id, v_from, v_to))
      FROM public.attendance_records ar
      WHERE ar.student_id = v_student.id
        AND ar.attendance_date >= v_from
        AND ar.attendance_date <= v_to
    )
  );
END;
$$;
