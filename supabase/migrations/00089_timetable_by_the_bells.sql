-- ============================================================================
-- 00089 · The timetable by the school's bells.
--
-- The bells are fixed now (00086): five lessons in each of two shifts. The
-- timetable workbook says which shift each class studies in, in a «Баст»
-- column (1 or 2; empty keeps what the class had), and a lesson written
-- after the last bell of its shift is pointed out instead of being saved with
-- no time to be held in. A teacher may be in the first shift's first lesson
-- and the second shift's first lesson on the same day: those are hours apart.
--
-- A lesson can also be put in by hand from the timetable page by naming the
-- subject and the teacher; the subject is attached to the class on the way,
-- so nothing has to be set up on the class first. And a class's shift is
-- changed in one place, with its lessons following it.
-- ============================================================================

-- The same teacher, the same day and period number, in different shifts.
DROP INDEX IF EXISTS public.timetable_teacher_conflict;
CREATE UNIQUE INDEX timetable_teacher_conflict
  ON public.timetable_entries(teacher_id, academic_year_id, day_of_week, shift, period_number)
  WHERE teacher_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_timetable(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_total int;
  v_errors jsonb := '[]'::jsonb;
  v_new_subjects text[] := ARRAY[]::text[];
  v_written int := 0;

  v_row jsonb; v_index int; v_number int; v_period int;
  v_class text; v_class_id uuid; v_day smallint; v_cell text;
  v_lesson record; v_group text; v_slot int;
  v_subject_id uuid; v_staff_id uuid; v_cs_id uuid;
  v_seen text[] := ARRAY[]::text[]; v_teacher_slots text[] := ARRAY[]::text[]; v_key text;
  v_touched uuid[] := ARRAY[]::uuid[];
  v_shift_text text;
  v_shift int;
  v_class_shift int;
  v_last_bell int;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'timetable.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023'; END IF;
  IF v_total > 2400 THEN RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023'; END IF;

  -- The year, its 1А … 11Д and the bells are there before any lesson is.
  v_year := app.ensure_school_basics(v_school);
  IF v_year IS NULL THEN RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023'; END IF;

  -- ---------------------------------------------------------------- validate
  FOR v_index IN 0 .. v_total - 1 LOOP
    v_number := v_index + 1;
    v_row := p_rows -> v_index;
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_day := app.parse_weekday(v_row ->> 'day');

    IF v_class IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'required');
      CONTINUE;
    END IF;
    v_class_id := NULL;
    SELECT c.id, c.shift INTO v_class_id, v_class_shift FROM public.classes c
    WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
      AND app.class_name_key(c.name) = app.class_name_key(v_class);
    IF v_class_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'unknown_class');
    END IF;

    -- «Баст»: the shift the class studies in, 1 or 2. Empty keeps the class's.
    v_shift_text := nullif(btrim(coalesce(v_row ->> 'shift', '')), '');
    v_shift := coalesce(v_class_shift, 1);
    IF v_shift_text IS NOT NULL THEN
      IF v_shift_text ~ '^[12]$' THEN
        v_shift := v_shift_text::int;
      ELSE
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'shift', 'code', 'invalid_shift');
      END IF;
    END IF;
    SELECT max(b.period_number) INTO v_last_bell FROM public.bell_periods b WHERE b.school_id = v_school AND b.shift = v_shift;
    IF v_day IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'day', 'code', 'invalid_enum');
      CONTINUE;
    END IF;

    v_key := coalesce(v_class, '') || '|' || v_day;
    IF v_key = ANY (v_seen) THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'day', 'code', 'duplicate_in_file');
    ELSE
      v_seen := v_seen || v_key;
    END IF;

    FOR v_period IN 1 .. 12 LOOP
      v_cell := nullif(btrim(coalesce(v_row ->> ('p' || v_period), '')), '');
      CONTINUE WHEN v_cell IS NULL;
      IF v_last_bell IS NOT NULL AND v_period > v_last_bell THEN
        -- A lesson after the last bell of the shift has no time to be held in.
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'p' || v_period, 'code', 'no_bell', 'detail', v_last_bell::text);
        CONTINUE;
      END IF;
      v_slot := 0;
      FOR v_lesson IN SELECT * FROM app.parse_lesson_cell(v_cell) LOOP
        v_slot := v_slot + 1;
        IF v_lesson.subject IS NULL OR v_lesson.subject = '' THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'p' || v_period, 'code', 'invalid_cell');
          CONTINUE;
        END IF;
        IF v_lesson.teacher_number IS NOT NULL THEN
          SELECT s.id INTO v_staff_id FROM public.staff s
          WHERE s.school_id = v_school AND s.employee_number = v_lesson.teacher_number;
          IF v_staff_id IS NULL THEN
            v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'p' || v_period, 'code', 'unknown_teacher');
          ELSE
            -- One teacher cannot be in two classrooms at once. Caught here, so
            -- the message can name both places rather than a constraint.
            v_key := v_lesson.teacher_number || '|' || v_day || '|' || v_shift || '|' || v_period;
            IF v_key = ANY (v_teacher_slots) THEN
              v_errors := v_errors || jsonb_build_object(
                'row', v_number, 'field', 'p' || v_period, 'code', 'teacher_busy', 'detail', v_lesson.teacher_number);
            ELSE
              v_teacher_slots := v_teacher_slots || v_key;
            END IF;
          END IF;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.subjects s
          WHERE s.school_id = v_school AND lower(btrim(s.name_tg)) = lower(btrim(v_lesson.subject))
        ) AND NOT (v_lesson.subject = ANY (v_new_subjects)) THEN
          v_new_subjects := v_new_subjects || v_lesson.subject;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', jsonb_array_length(v_errors) = 0, 'total', v_total,
      'errors', v_errors, 'written', 0, 'newSubjects', to_jsonb(v_new_subjects));
  END IF;

  -- ------------------------------------------------------------------- write
  FOR v_index IN 0 .. v_total - 1 LOOP
    v_row := p_rows -> v_index;
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_day := app.parse_weekday(v_row ->> 'day');
    SELECT c.id INTO v_class_id FROM public.classes c
    WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
      AND app.class_name_key(c.name) = app.class_name_key(v_class);
    v_shift_text := nullif(btrim(coalesce(v_row ->> 'shift', '')), '');
    IF v_shift_text ~ '^[12]$' THEN
      UPDATE public.classes SET shift = v_shift_text::int, updated_at = now() WHERE id = v_class_id AND shift <> v_shift_text::int;
      UPDATE public.timetable_entries SET shift = v_shift_text::int WHERE class_id = v_class_id AND shift <> v_shift_text::int;
    END IF;

    -- The file is the whole truth for the class-days it covers; a lesson the
    -- deputy head removed has to disappear, not linger.
    DELETE FROM public.timetable_entries WHERE class_id = v_class_id AND day_of_week = v_day;
    IF NOT (v_class_id = ANY (v_touched)) THEN v_touched := v_touched || v_class_id; END IF;

    FOR v_period IN 1 .. 12 LOOP
      v_cell := nullif(btrim(coalesce(v_row ->> ('p' || v_period), '')), '');
      CONTINUE WHEN v_cell IS NULL;
      v_slot := 0;
      FOR v_lesson IN SELECT * FROM app.parse_lesson_cell(v_cell) LOOP
        v_slot := v_slot + 1;
        -- A cell naming one lesson is an undivided class and keeps the empty
        -- label, so nothing that already exists changes meaning.
        v_group := CASE WHEN v_slot = 1 AND (SELECT count(*) FROM app.parse_lesson_cell(v_cell)) = 1 THEN '' ELSE v_slot::text END;

        INSERT INTO public.subjects (school_id, name_tg)
        VALUES (v_school, btrim(v_lesson.subject))
        ON CONFLICT (school_id, lower(btrim(name_tg))) DO NOTHING;
        SELECT s.id INTO v_subject_id FROM public.subjects s
        WHERE s.school_id = v_school AND lower(btrim(s.name_tg)) = lower(btrim(v_lesson.subject));

        v_staff_id := NULL;
        IF v_lesson.teacher_number IS NOT NULL THEN
          SELECT s.id INTO v_staff_id FROM public.staff s
          WHERE s.school_id = v_school AND s.employee_number = v_lesson.teacher_number;
        END IF;

        -- The timetable is what decides who teaches what, so an existing
        -- binding is brought into line with it rather than left behind.
        INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id)
        VALUES (v_school, v_class_id, v_subject_id, v_group, v_staff_id)
        ON CONFLICT (class_id, subject_id, group_label)
          DO UPDATE SET teacher_id = coalesce(EXCLUDED.teacher_id, public.class_subjects.teacher_id),
                        is_active = true, updated_at = now()
        RETURNING id INTO v_cs_id;

        INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number)
        VALUES (v_school, v_year, v_class_id, v_cs_id, v_day, v_period);
        v_written := v_written + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  PERFORM app.write_audit(v_school, 'import', 'timetable', NULL, NULL, NULL,
    jsonb_build_object('rows', v_total, 'lessons', v_written, 'classes', array_length(v_touched, 1)));

  RETURN jsonb_build_object('valid', true, 'total', v_total, 'errors', '[]'::jsonb,
    'written', v_written, 'newSubjects', to_jsonb(v_new_subjects));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_timetable(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_timetable(jsonb, boolean) TO authenticated;

/**
 * One lesson put in by hand: the subject (attached to the class if it is not
 * yet), the teacher who gives it, the day and the period. Answers the new
 * entry's id.
 */
CREATE OR REPLACE FUNCTION public.save_timetable_lesson(
  p_class_id uuid,
  p_subject_id uuid,
  p_teacher_id uuid,
  p_day int,
  p_period int,
  p_room_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class public.classes%ROWTYPE;
  v_cs uuid;
  v_id uuid;
  v_last_bell int;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND OR v_class.school_id IS DISTINCT FROM app.current_school_id() OR NOT app.can(v_class.school_id, 'timetable.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_day NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  SELECT max(b.period_number) INTO v_last_bell FROM public.bell_periods b WHERE b.school_id = v_class.school_id AND b.shift = v_class.shift;
  IF p_period < 1 OR p_period > coalesce(v_last_bell, 12) THEN
    RAISE EXCEPTION 'no_bell' USING ERRCODE = '22023';
  END IF;
  PERFORM app.assert_same_school(v_class.school_id, 'subjects', p_subject_id);
  IF p_teacher_id IS NOT NULL THEN
    PERFORM app.assert_same_school(v_class.school_id, 'staff', p_teacher_id);
  END IF;

  INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id)
  VALUES (v_class.school_id, p_class_id, p_subject_id, '', p_teacher_id)
  ON CONFLICT (class_id, subject_id, group_label)
    DO UPDATE SET teacher_id = coalesce(EXCLUDED.teacher_id, public.class_subjects.teacher_id), is_active = true, updated_at = now()
  RETURNING id INTO v_cs;

  INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, room_id, day_of_week, period_number)
  VALUES (v_class.school_id, v_class.academic_year_id, p_class_id, v_cs, p_room_id, p_day, p_period)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_timetable_lesson(uuid, uuid, uuid, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_timetable_lesson(uuid, uuid, uuid, int, int, uuid) TO authenticated;

/** The shift a class studies in; its lessons follow it. */
CREATE OR REPLACE FUNCTION public.set_class_shift(p_class_id uuid, p_shift int)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND OR v_class.school_id IS DISTINCT FROM app.current_school_id()
     OR NOT (app.can(v_class.school_id, 'timetable.manage') OR app.can(v_class.school_id, 'classes.update')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_shift NOT IN (1, 2) THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.classes SET shift = p_shift, updated_at = now() WHERE id = p_class_id AND shift <> p_shift;
  UPDATE public.timetable_entries SET shift = p_shift WHERE class_id = p_class_id AND shift <> p_shift;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_class_shift(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_shift(uuid, int) TO authenticated;
