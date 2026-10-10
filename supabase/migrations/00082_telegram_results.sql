-- ============================================================================
-- 00082 · The term's results in the Telegram bot.
--
-- A parent can now ask the bot for the term so far as one table: every
-- subject of the child's class, the marks in it, their average on the
-- five-point scale, and the absences and lateness in it. telegram_report
-- gains the kind 'results', which returns that table (and the term it covers)
-- instead of the day's or week's lists; every other kind is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.telegram_report(
  p_chat bigint,
  p_student uuid,
  p_kind text,
  p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_day date;
  v_from date;
  v_term public.academic_terms%ROWTYPE;
  v_class uuid;
BEGIN
  IF NOT app.telegram_may_see(p_chat, p_student) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student;
  v_day := coalesce(p_date, app.school_today(v_school));
  v_from := CASE WHEN p_kind = 'week' THEN v_day - 6 ELSE v_day END;

  IF p_kind = 'results' THEN
    -- The term today falls in; without one, the last two months.
    SELECT * INTO v_term FROM public.academic_terms
    WHERE school_id = v_school AND v_day BETWEEN start_date AND end_date
    ORDER BY start_date DESC LIMIT 1;
    v_from := coalesce(v_term.start_date, v_day - 60);
    SELECT e.class_id INTO v_class FROM public.enrollments e
    WHERE e.student_id = p_student AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1;

    RETURN jsonb_build_object(
      'child', (
        SELECT jsonb_build_object('name', st.last_name || ' ' || st.first_name, 'class', c.name)
        FROM public.students st LEFT JOIN public.classes c ON c.id = v_class
        WHERE st.id = p_student
      ),
      'from', v_from,
      'to', v_day,
      'term', jsonb_build_object('name', v_term.name, 'from', v_from, 'to', coalesce(v_term.end_date, v_day)),
      'grades', '[]'::jsonb,
      'attendance', '[]'::jsonb,
      'timetable', '[]'::jsonb,
      'results', (
        SELECT coalesce(jsonb_agg(row_data ORDER BY sort_name), '[]'::jsonb)
        FROM (
          SELECT s.name_tg AS sort_name,
                 jsonb_build_object(
                   'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
                   'marks', coalesce((
                     SELECT jsonb_agg(jsonb_build_object('score', g.score, 'max', g.max_score) ORDER BY g.grade_date, g.created_at)
                     FROM public.grades g
                     JOIN public.assessment_types at ON at.id = g.assessment_type_id
                     WHERE g.student_id = p_student AND g.class_subject_id = cs.id
                       AND g.grade_date BETWEEN v_from AND v_day AND NOT at.is_final
                   ), '[]'::jsonb),
                   'average', (
                     SELECT round(avg(CASE WHEN g.max_score = 5 THEN g.score ELSE g.score / g.max_score * 5 END)::numeric, 1)
                     FROM public.grades g
                     JOIN public.assessment_types at ON at.id = g.assessment_type_id
                     WHERE g.student_id = p_student AND g.class_subject_id = cs.id
                       AND g.grade_date BETWEEN v_from AND v_day AND NOT at.is_final AND g.max_score > 0
                   ),
                   'absences', (
                     SELECT count(*) FROM public.attendance_records a
                     WHERE a.student_id = p_student AND a.class_subject_id = cs.id
                       AND a.attendance_date BETWEEN v_from AND v_day AND a.status = 'absent'
                   ),
                   'late', (
                     SELECT count(*) FROM public.attendance_records a
                     WHERE a.student_id = p_student AND a.class_subject_id = cs.id
                       AND a.attendance_date BETWEEN v_from AND v_day AND a.status = 'late'
                   )
                 ) AS row_data
          FROM public.class_subjects cs
          JOIN public.subjects s ON s.id = cs.subject_id
          WHERE cs.class_id = v_class AND cs.is_active
        ) subjects
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'child', (
      SELECT jsonb_build_object('name', st.last_name || ' ' || st.first_name, 'class', c.name)
      FROM public.students st
      LEFT JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active'
      LEFT JOIN public.classes c ON c.id = e.class_id
      WHERE st.id = p_student
    ),
    'from', v_from,
    'to', v_day,
    'grades', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', g.grade_date,
        'score', g.score,
        'max', g.max_score,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
        'work', jsonb_build_object('tg', at.name_tg, 'ru', at.name_ru, 'en', at.name_en),
        'final', at.is_final
      ) ORDER BY g.grade_date, s.name_tg), '[]'::jsonb)
      FROM public.grades g
      JOIN public.class_subjects cs ON cs.id = g.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      JOIN public.assessment_types at ON at.id = g.assessment_type_id
      WHERE g.student_id = p_student AND g.grade_date BETWEEN v_from AND v_day
    ),
    'attendance', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', a.attendance_date,
        'status', a.status,
        'period', a.period_number,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en)
      ) ORDER BY a.attendance_date, a.period_number), '[]'::jsonb)
      FROM public.attendance_records a
      LEFT JOIN public.class_subjects cs ON cs.id = a.class_subject_id
      LEFT JOIN public.subjects s ON s.id = cs.subject_id
      WHERE a.student_id = p_student AND a.attendance_date BETWEEN v_from AND v_day
        AND a.status <> 'present'
    ),
    -- Sunday is not a school day here, so a request made on one shows Monday's
    -- lessons rather than an empty page.
    'timetable', CASE WHEN p_kind <> 'timetable' THEN '[]'::jsonb ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'period', te.period_number,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
        'room', r.name,
        'teacher', nullif(btrim(coalesce(t.last_name, '') || ' ' || coalesce(t.first_name, '')), '')
      ) ORDER BY te.period_number), '[]'::jsonb)
      FROM public.timetable_entries te
      JOIN public.class_subjects cs ON cs.id = te.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      JOIN public.enrollments e ON e.class_id = te.class_id AND e.student_id = p_student AND e.status = 'active'
      LEFT JOIN public.rooms r ON r.id = te.room_id
      LEFT JOIN public.staff t ON t.id = te.teacher_id
      WHERE te.day_of_week = least(extract(isodow FROM v_day)::int, 6)
    ) END
  );
END;
$$;
