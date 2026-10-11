-- МТМУ: навсозии база, қисми 4 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 4) THEN
RAISE EXCEPTION 'Қисми 4 аллакай иҷро шудааст. Қисми 5-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 3) THEN
RAISE EXCEPTION 'Аввал қисми 3-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
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
v_year := app.ensure_school_basics(v_school);
IF v_year IS NULL THEN RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023'; END IF;
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
DELETE FROM public.timetable_entries WHERE class_id = v_class_id AND day_of_week = v_day;
IF NOT (v_class_id = ANY (v_touched)) THEN v_touched := v_touched || v_class_id; END IF;
FOR v_period IN 1 .. 12 LOOP
v_cell := nullif(btrim(coalesce(v_row ->> ('p' || v_period), '')), '');
CONTINUE WHEN v_cell IS NULL;
v_slot := 0;
FOR v_lesson IN SELECT * FROM app.parse_lesson_cell(v_cell) LOOP
v_slot := v_slot + 1;
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
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180089', '00089_timetable_by_the_bells') ON CONFLICT (version) DO NOTHING;
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
IF v_read.kind <> 'empty' AND NOT EXISTS (
SELECT 1 FROM public.enrollments e
WHERE e.student_id = v_student AND e.class_id = v_class
AND v_date >= e.enrolled_on AND (e.left_on IS NULL OR v_date <= e.left_on)
) THEN
v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'not_enrolled');
CONTINUE;
END IF;
DELETE FROM public.grades
WHERE student_id = v_student AND class_subject_id = p_class_subject_id
AND grade_date = v_date AND assessment_type_id = v_type AND status <> 'approved';
GET DIAGNOSTICS v_marks_removed = ROW_COUNT;
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
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180091', '00091_journal_marks_keep_the_roll') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (4);
COMMIT;
SELECT 'Қисми 4 аз 7 иҷро шуд' AS natija;
