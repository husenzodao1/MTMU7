-- The timetable, as the deputy head actually writes it.
--
-- One row per class and day, one column per period, and in each cell the
-- subject with the teacher's number after it: «Математика (14)». That number is
-- the one the teachers' sheet gave them, and it is what binds a teacher to a
-- class and a subject — so once the timetable is in, the journal already knows
-- its subject, its pupils and its teacher, and the teacher only writes the
-- topic of the lesson.
--
-- Two shapes the old schema could not hold, and now can:
--
--   * A class split into groups. Half of 8А take English with one teacher while
--     the other half take it with another, in the same period. Both the
--     teacher↔subject binding and the timetable slot were unique per class, so
--     the second group had nowhere to go. Both keys now carry a group label,
--     and a cell may name two lessons: «Англисӣ (14) / Англисӣ (19)».
--   * Two spellings of one subject. subjects had no unique name, so Математика
--     typed twice became two subjects with two sets of marks.

-- ----------------------------------------------------------------------------
-- 1. One subject per name
-- ----------------------------------------------------------------------------

-- Safe to add now: the import is the first thing that will create subjects in
-- bulk, and a school that already has duplicates would have found them by hand.
CREATE UNIQUE INDEX IF NOT EXISTS subjects_school_name_unique
  ON public.subjects (school_id, lower(btrim(name_tg)));

-- ----------------------------------------------------------------------------
-- 2. Groups within a class
-- ----------------------------------------------------------------------------

ALTER TABLE public.class_subjects ADD COLUMN IF NOT EXISTS group_label varchar(20) NOT NULL DEFAULT '';
ALTER TABLE public.timetable_entries ADD COLUMN IF NOT EXISTS group_label varchar(20) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_subjects_unique') THEN
    ALTER TABLE public.class_subjects DROP CONSTRAINT class_subjects_unique;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timetable_class_conflict') THEN
    ALTER TABLE public.timetable_entries DROP CONSTRAINT timetable_class_conflict;
  END IF;
END $$;

-- An undivided class keeps the empty label, so everything written before this
-- migration means exactly what it meant.
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_unique UNIQUE (class_id, subject_id, group_label);
ALTER TABLE public.timetable_entries
  ADD CONSTRAINT timetable_class_conflict UNIQUE (class_id, day_of_week, shift, period_number, group_label);

-- The teacher may still only be in one place at a time, and so may the room;
-- those two indexes are unchanged and still do the work that matters.

-- The slot's group is the subject binding's group: the client never says which,
-- for the same reason it never says who teaches.
CREATE OR REPLACE FUNCTION app.validate_timetable_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cs public.class_subjects%ROWTYPE;
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_cs FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23503';
  END IF;
  IF v_cs.class_id IS DISTINCT FROM NEW.class_id THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = NEW.class_id;
  NEW.school_id := v_class.school_id;
  NEW.academic_year_id := v_class.academic_year_id;
  NEW.shift := v_class.shift;
  NEW.teacher_id := v_cs.teacher_id;
  NEW.group_label := v_cs.group_label;

  IF NEW.room_id IS NOT NULL THEN
    PERFORM app.assert_same_school(NEW.school_id, 'rooms', NEW.room_id);
  END IF;
  IF app.is_api_caller() AND TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Reading a cell
-- ----------------------------------------------------------------------------

-- «Математика (14)» → the subject and the teacher's number. A cell with no
-- parentheses names a subject whose teacher is not settled yet, which is a
-- legitimate state in September.
CREATE OR REPLACE FUNCTION app.parse_lesson_cell(p_cell text)
RETURNS TABLE (subject text, teacher_number text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    btrim((regexp_match(part, '^\s*(.+?)\s*(?:\(([A-Za-z0-9-]{1,32})\))?\s*$'))[1]),
    (regexp_match(part, '^\s*(.+?)\s*\(([A-Za-z0-9-]{1,32})\)\s*$'))[2]
  FROM unnest(string_to_array(coalesce(p_cell, ''), '/')) AS part
  WHERE btrim(part) <> ''
$$;
GRANT EXECUTE ON FUNCTION app.parse_lesson_cell(text) TO authenticated;

-- Душанбе … Шанбе. Sunday is not a school day and has no column.
CREATE OR REPLACE FUNCTION app.parse_weekday(p_value text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(btrim(coalesce(p_value, '')))
    WHEN 'душанбе' THEN 1 WHEN 'понедельник' THEN 1 WHEN 'monday' THEN 1 WHEN '1' THEN 1
    WHEN 'сешанбе' THEN 2 WHEN 'вторник' THEN 2 WHEN 'tuesday' THEN 2 WHEN '2' THEN 2
    WHEN 'чоршанбе' THEN 3 WHEN 'среда' THEN 3 WHEN 'wednesday' THEN 3 WHEN '3' THEN 3
    WHEN 'панҷшанбе' THEN 4 WHEN 'четверг' THEN 4 WHEN 'thursday' THEN 4 WHEN '4' THEN 4
    WHEN 'ҷумъа' THEN 5 WHEN 'пятница' THEN 5 WHEN 'friday' THEN 5 WHEN '5' THEN 5
    WHEN 'шанбе' THEN 6 WHEN 'суббота' THEN 6 WHEN 'saturday' THEN 6 WHEN '6' THEN 6
    ELSE NULL
  END::smallint
$$;
GRANT EXECUTE ON FUNCTION app.parse_weekday(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. The import
-- ----------------------------------------------------------------------------

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

  v_year := app.current_year_id(v_school);
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
    SELECT c.id INTO v_class_id FROM public.classes c
    WHERE c.school_id = v_school AND c.academic_year_id = v_year AND app.normalize_class_name(c.name) = v_class;
    IF v_class_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'unknown_class');
    END IF;
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
            v_key := v_lesson.teacher_number || '|' || v_day || '|' || v_period;
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
    WHERE c.school_id = v_school AND c.academic_year_id = v_year AND app.normalize_class_name(c.name) = v_class;

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
