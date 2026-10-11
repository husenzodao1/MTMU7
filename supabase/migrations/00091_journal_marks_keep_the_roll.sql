-- A mark in the journal no longer wipes the lesson's roll.
--
-- save_journal_cells (00053, last 00056) cleared every attendance record of the
-- pupil's day in that subject before writing a square, whatever the square
-- held. So a teacher who took the roll at the lesson ("present", "late") and
-- then gave a mark in the journal erased the roll: the lesson dropped out of
-- the pupil's attendance, and the parents' figures with it.
--
-- Now a letter still replaces the day's record; a mark takes away only an
-- absence (a pupil who was marked was there); and emptying a square removes
-- what the square showed — the mark, or else the letter — and never the roll.
-- Everything else is 00056's function as it was.

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

    -- An absence is a record of a day, so it answers to the calendar. A mark is
    -- not: a quarter column is dated at the end of the term, which has not
    -- happened yet, and that is exactly where a quarter mark belongs.
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
      AND grade_date = v_date AND assessment_type_id = v_type AND status <> 'approved';
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
