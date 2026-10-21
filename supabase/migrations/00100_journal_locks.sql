-- ============================================================================
-- 00100: The journal keeps what was approved, and the days to come closed
-- ============================================================================
-- 1. An approved mark is the school's. The journal used to "write over" it by
--    keeping the approved row and adding a second, recorded mark beside it;
--    now a square holding an approved mark is refused (code 'approved') to
--    anybody who does not approve marks themselves (grades.approve).
-- 2. A lesson column cannot be opened for a day still to come, by the journal
--    (rule_journal_column) or directly; nor can a mark go into a lesson's
--    square ahead of its day. A term column — a quarter's or the year's mark,
--    dated at the end of its term — still can, as before.
-- 3. "Excused" is no longer one of the journal's letters (у / e / y): the
--    school marks absent or late. Records already marked excused stay as they
--    are, and are still shown and counted.
--
-- Nothing is dropped and no row is changed: three functions are replaced.

CREATE OR REPLACE FUNCTION app.read_journal_cell(p_value text, p_max numeric)
RETURNS TABLE (kind text, score numeric, status text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := lower(btrim(coalesce(p_value, '')));
  v_score numeric;
BEGIN
  IF v = '' THEN
    RETURN QUERY SELECT 'empty'::text, NULL::numeric, NULL::text;
    RETURN;
  END IF;

  IF v IN ('ғ', 'н', 'a', 'g') THEN
    RETURN QUERY SELECT 'absence'::text, NULL::numeric, 'absent'::text;
    RETURN;
  END IF;
  IF v IN ('д', 'о', 'o', 'l') THEN
    RETURN QUERY SELECT 'absence'::text, NULL::numeric, 'late'::text;
    RETURN;
  END IF;

  BEGIN
    v_score := replace(v, ',', '.')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::numeric, NULL::text;
    RETURN;
  END;

  IF v_score < 0 OR v_score > p_max OR round(v_score * 100) <> v_score * 100 THEN
    RETURN QUERY SELECT 'out_of_range'::text, NULL::numeric, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'score'::text, v_score, NULL::text;
END;
$$;
GRANT EXECUTE ON FUNCTION app.read_journal_cell(text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION app.guard_journal_column_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_school uuid;
  v_term public.academic_terms%ROWTYPE;
BEGIN
  SELECT cs.school_id INTO v_school FROM public.class_subjects cs WHERE cs.id = NEW.class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '22023';
  END IF;
  NEW.school_id := v_school;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = NEW.academic_term_id;
  IF NOT FOUND OR NEW.column_date < v_term.start_date OR NEW.column_date > v_term.end_date THEN
    RAISE EXCEPTION 'date_outside_term' USING ERRCODE = '22023';
  END IF;

  -- A lesson is opened in the journal on its day or after it, never ahead
  -- of it; a term column (a quarter's or the year's mark) may stand at the
  -- end of its term. Columns already there keep their days.
  IF coalesce(NEW.kind, 'lesson') = 'lesson'
     AND (TG_OP = 'INSERT' OR NEW.column_date IS DISTINCT FROM OLD.column_date)
     AND NEW.column_date > app.school_today(v_school) THEN
    RAISE EXCEPTION 'a lesson column cannot be opened for a future date' USING ERRCODE = '22023';
  END IF;

  NEW.label := nullif(btrim(coalesce(NEW.label, '')), '');
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, (SELECT auth.uid()));
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_journal_cells(
  p_class_subject_id uuid,
  p_academic_term_id uuid,
  p_cells jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_class uuid;
  v_actor uuid := (SELECT auth.uid());
  v_locked boolean;
  v_today date;
  v_window int;
  v_may_correct boolean;
  v_may_approve boolean;
  v_cell jsonb;
  v_student uuid;
  v_date date;
  v_type uuid;
  v_max numeric;
  v_read record;
  v_errors jsonb := '[]'::jsonb;
  v_saved int := 0;
  v_cleared int := 0;
  v_marks_removed int;
  v_index int;
BEGIN
  SELECT cs.school_id, cs.class_id INTO v_school, v_class
  FROM public.class_subjects cs WHERE cs.id = p_class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23503';
  END IF;
  IF NOT app.may_keep_journal(p_class_subject_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_cells) > 4000 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;

  SELECT t.is_locked INTO v_locked FROM public.academic_terms t
  WHERE t.id = p_academic_term_id AND t.school_id = v_school;
  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  -- A locked term is closed to the teacher who kept it and open to whoever may
  -- correct the school's marks. Refusing the whole page is right: a teacher
  -- half of whose entries were accepted would not know which half.
  IF v_locked AND NOT app.can(v_school, 'grades.update') THEN
    RAISE EXCEPTION 'term_locked' USING ERRCODE = '42501';
  END IF;

  v_today := app.school_today(v_school);
  v_window := app.school_setting_int(v_school, 'attendance_correction_days', 7);
  v_may_correct := app.can(v_school, 'attendance.update');
  v_may_approve := app.can(v_school, 'grades.approve');

  FOR v_index IN 0 .. jsonb_array_length(p_cells) - 1 LOOP
    v_cell := p_cells -> v_index;
    v_student := (v_cell ->> 'student')::uuid;
    v_date := (v_cell ->> 'date')::date;
    v_type := (v_cell ->> 'type')::uuid;

    SELECT at.max_score INTO v_max FROM public.assessment_types at
    WHERE at.id = v_type AND at.school_id = v_school;
    IF v_max IS NULL THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'invalid');
      CONTINUE;
    END IF;

    SELECT * INTO v_read FROM app.read_journal_cell(v_cell ->> 'value', v_max);

    IF v_read.kind IN ('invalid', 'out_of_range') THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', v_read.kind);
      CONTINUE;
    END IF;

    -- An approved mark is the school's: whoever kept the journal no longer
    -- changes it — not over it, not by clearing it. Only whoever approves
    -- marks does, here. (Before 00100 the square took a second, recorded
    -- mark beside the approved one.)
    IF NOT v_may_approve AND EXISTS (
      SELECT 1 FROM public.grades g
      WHERE g.student_id = v_student AND g.class_subject_id = p_class_subject_id
        AND g.grade_date = v_date AND g.assessment_type_id = v_type AND g.status = 'approved'
    ) THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'approved');
      CONTINUE;
    END IF;

    -- A lesson that has not happened has no mark yet. A quarter's or the
    -- year's mark may stand at the end of its term ahead of the day: its
    -- column is a term column (journal_columns.kind = 'term').
    IF v_read.kind = 'score' AND v_date > v_today AND NOT EXISTS (
      SELECT 1 FROM public.journal_columns jc
      WHERE jc.class_subject_id = p_class_subject_id AND jc.column_date = v_date
        AND jc.assessment_type_id = v_type AND jc.kind = 'term'
    ) THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'future_date');
      CONTINUE;
    END IF;

    -- An absence is a record of a day, so it answers to the calendar.
    IF v_read.kind = 'absence' THEN
      IF v_date > v_today THEN
        v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'future_date');
        CONTINUE;
      END IF;
      IF v_date < v_today - v_window AND NOT v_may_correct THEN
        v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'window_closed');
        CONTINUE;
      END IF;
    END IF;

    -- The rule the triggers keep: a mark belongs to a child who was in the
    -- class that day. Said here too, so that one square from before a pupil
    -- arrived is refused by itself instead of raising and taking the page with
    -- it. An empty square is let through: clearing something is always allowed.
    IF v_read.kind <> 'empty' AND NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = v_student AND e.class_id = v_class
        AND v_date >= e.enrolled_on AND (e.left_on IS NULL OR v_date <= e.left_on)
    ) THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'not_enrolled');
      CONTINUE;
    END IF;

    -- Whatever the square becomes, it stops being what it was: a mark replaced
    -- by a letter must not leave the mark behind it.
    DELETE FROM public.grades
    WHERE student_id = v_student AND class_subject_id = p_class_subject_id
      AND grade_date = v_date AND assessment_type_id = v_type AND (status <> 'approved' OR v_may_approve);
    GET DIAGNOSTICS v_marks_removed = ROW_COUNT;
    -- What the square says about the day's attendance. A letter replaces the
    -- day's record. A mark says the pupil was there: an absence that day goes,
    -- but the roll taken at the lesson ("present", "late") stays. An emptied
    -- square that held a mark loses the mark only; one that held a letter
    -- loses the letter.
    DELETE FROM public.attendance_records
    WHERE student_id = v_student AND attendance_date = v_date AND class_subject_id = p_class_subject_id
      AND (
        v_read.kind = 'absence'
        OR (v_read.kind = 'score' AND status IN ('absent', 'excused'))
        OR (v_read.kind = 'empty' AND v_marks_removed = 0 AND status <> 'present')
      );

    IF v_read.kind = 'empty' THEN
      v_cleared := v_cleared + 1;
      CONTINUE;
    END IF;

    IF v_read.kind = 'score' THEN
      INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id,
                                 score, max_score, grade_date, status, entered_by)
      VALUES (v_school, v_student, p_class_subject_id, p_academic_term_id, v_type,
              v_read.score, v_max, v_date, 'recorded', v_actor);
    ELSE
      INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id,
                                             attendance_date, status, marked_by)
      VALUES (v_school, v_student, v_class, p_class_subject_id, v_date, v_read.status, v_actor);
    END IF;
    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved, 'cleared', v_cleared, 'errors', v_errors);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_journal_cells(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_journal_cells(uuid, uuid, jsonb) TO authenticated;
