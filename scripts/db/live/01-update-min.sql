BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
CREATE OR REPLACE FUNCTION app.school_year_span(p_day date)
RETURNS TABLE (name text, start_date date, end_date date)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT y::text || '-' || (y + 1)::text, make_date(y, 8, 1), make_date(y + 1, 7, 31)
FROM (SELECT extract(year FROM p_day)::int - CASE WHEN extract(month FROM p_day) < 8 THEN 1 ELSE 0 END AS y) AS s
$$;
GRANT EXECUTE ON FUNCTION app.school_year_span(date) TO authenticated;
CREATE OR REPLACE FUNCTION app.year_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT regexp_replace(coalesce(p_name, ''), '[[:space:]–—-]+', '-', 'g')
$$;
CREATE OR REPLACE FUNCTION app.standard_bells()
RETURNS TABLE (shift smallint, period_number smallint, start_time time, end_time time)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT b.shift::smallint, b.period_number::smallint, b.start_time::time, b.end_time::time
FROM (VALUES
(1, 1, '08:05', '08:45'),
(1, 2, '08:50', '09:35'),
(1, 3, '09:40', '10:25'),
(1, 4, '10:35', '11:20'),
(1, 5, '11:25', '12:10'),
(2, 1, '13:00', '13:45'),
(2, 2, '13:50', '14:35'),
(2, 3, '14:40', '15:25'),
(2, 4, '15:35', '16:20'),
(2, 5, '16:25', '17:10')
) AS b(shift, period_number, start_time, end_time)
$$;
GRANT EXECUTE ON FUNCTION app.standard_bells() TO authenticated;
CREATE OR REPLACE FUNCTION app.ensure_standard_bells(p_school uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
DELETE FROM public.bell_periods bp
WHERE bp.school_id = p_school
AND NOT EXISTS (
SELECT 1 FROM app.standard_bells() s
WHERE s.shift = bp.shift AND s.period_number = bp.period_number
AND s.start_time = bp.start_time AND s.end_time = bp.end_time
);
INSERT INTO public.bell_periods (school_id, shift, period_number, start_time, end_time)
SELECT p_school, s.shift, s.period_number, s.start_time, s.end_time
FROM app.standard_bells() s
ON CONFLICT (school_id, shift, period_number) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_standard_bells(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.standard_class_letters()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT ARRAY['А', 'Б', 'В', 'Г', 'Ғ', 'Д']
$$;
GRANT EXECUTE ON FUNCTION app.standard_class_letters() TO authenticated;
CREATE OR REPLACE FUNCTION app.ensure_standard_classes(p_school uuid, p_year uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_count int;
BEGIN
IF p_year IS NULL THEN
RETURN 0;
END IF;
UPDATE public.classes c
SET grade_level = (regexp_match(app.normalize_class_name(c.name), '^(\d{1,2})'))[1]::int, updated_at = now()
WHERE c.school_id = p_school AND c.academic_year_id = p_year
AND app.normalize_class_name(c.name) ~ '^(1[01]|[1-9])\D*$'
AND c.grade_level IS DISTINCT FROM (regexp_match(app.normalize_class_name(c.name), '^(\d{1,2})'))[1]::int;
INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
SELECT p_school, p_year, g::text || l, g
FROM generate_series(1, 11) AS g
CROSS JOIN unnest(app.standard_class_letters()) AS l
WHERE NOT EXISTS (
SELECT 1 FROM public.classes c
WHERE c.school_id = p_school AND c.academic_year_id = p_year AND c.is_active
AND app.class_name_key(c.name) = app.class_name_key(g::text || l)
)
ORDER BY g, array_position(app.standard_class_letters(), l);
GET DIAGNOSTICS v_count = ROW_COUNT;
RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_standard_classes(uuid, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.ensure_year_term(p_year uuid, p_stretch boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_year public.academic_years%ROWTYPE;
v_span record;
v_term uuid;
BEGIN
SELECT * INTO v_year FROM public.academic_years WHERE id = p_year;
IF NOT FOUND THEN
RETURN NULL;
END IF;
SELECT * INTO v_span FROM app.school_year_span(v_year.start_date);
IF p_stretch AND (v_year.start_date > v_span.start_date OR v_year.end_date < v_span.end_date) THEN
UPDATE public.academic_years
SET start_date = least(start_date, v_span.start_date), end_date = greatest(end_date, v_span.end_date), updated_at = now()
WHERE id = p_year
RETURNING * INTO v_year;
END IF;
SELECT t.id INTO v_term FROM public.academic_terms t
WHERE t.academic_year_id = p_year
ORDER BY (t.start_date = v_year.start_date AND t.end_date = v_year.end_date) DESC, t.start_date
LIMIT 1;
IF v_term IS NULL THEN
INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, sort_order)
VALUES (v_year.school_id, p_year, 'Соли таҳсил ' || v_year.name, 'term', v_year.start_date, v_year.end_date, 0)
RETURNING id INTO v_term;
ELSIF p_stretch THEN
UPDATE public.academic_terms t
SET start_date = v_year.start_date, end_date = v_year.end_date, updated_at = now()
WHERE t.academic_year_id = p_year AND t.kind = 'term' AND t.name = 'Соли таҳсил ' || v_year.name
AND (t.start_date <> v_year.start_date OR t.end_date <> v_year.end_date)
AND NOT EXISTS (SELECT 1 FROM public.academic_terms o WHERE o.academic_year_id = p_year AND o.id <> t.id);
END IF;
RETURN v_term;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_year_term(uuid, boolean) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.ensure_school_basics(p_school uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_year uuid;
v_span record;
BEGIN
IF p_school IS NULL THEN
RETURN NULL;
END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('school_year:' || p_school::text, 0));
SELECT id INTO v_year FROM public.academic_years WHERE school_id = p_school AND is_current;
IF v_year IS NULL THEN
SELECT * INTO v_span FROM app.school_year_span(app.school_today(p_school));
SELECT id INTO v_year FROM public.academic_years
WHERE school_id = p_school AND app.year_name_key(name) = v_span.name;
IF v_year IS NULL THEN
INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current, status)
VALUES (p_school, v_span.name, v_span.start_date, v_span.end_date, true, 'active')
RETURNING id INTO v_year;
ELSE
UPDATE public.academic_years SET is_current = true, status = 'active', updated_at = now() WHERE id = v_year;
END IF;
END IF;
PERFORM app.ensure_year_term(v_year);
PERFORM app.ensure_standard_classes(p_school, v_year);
PERFORM app.ensure_standard_bells(p_school);
RETURN v_year;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_school_basics(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.promote_school_year(p_school uuid, p_old uuid, p_name text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_new uuid;
v_class public.classes%ROWTYPE;
v_target uuid;
v_next_name text;
v_moved int := 0;
v_inserted int := 0;
v_graduated int := 0;
v_subjects int := 0;
BEGIN
SELECT id INTO v_new FROM public.academic_years
WHERE school_id = p_school AND app.year_name_key(name) = app.year_name_key(p_name);
IF v_new IS NULL THEN
INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current, status)
VALUES (p_school, p_name, p_start, p_end, true, 'active')
RETURNING id INTO v_new;
ELSE
UPDATE public.academic_years SET is_current = true, status = 'active', updated_at = now() WHERE id = v_new;
END IF;
IF v_new = p_old THEN
RETURN jsonb_build_object('yearId', v_new, 'alreadyDone', true);
END IF;
UPDATE public.academic_years SET status = 'closed', updated_at = now() WHERE id = p_old AND status <> 'closed';
PERFORM app.ensure_year_term(v_new, true);
PERFORM app.ensure_standard_classes(p_school, v_new);
FOR v_class IN
SELECT * FROM public.classes
WHERE school_id = p_school AND academic_year_id = p_old AND is_active
ORDER BY grade_level, name
LOOP
IF v_class.grade_level >= 11 THEN
UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start - 1, enrolled_on), updated_at = now()
WHERE class_id = v_class.id AND status = 'active';
UPDATE public.students SET status = 'graduated', status_changed_at = now(), updated_at = now()
WHERE id IN (SELECT student_id FROM public.enrollments WHERE class_id = v_class.id)
AND status = 'active';
GET DIAGNOSTICS v_inserted = ROW_COUNT;
v_graduated := v_graduated + v_inserted;
UPDATE public.users SET status = 'graduated', updated_at = now()
WHERE id IN (
SELECT s.user_id FROM public.students s
JOIN public.enrollments e ON e.student_id = s.id AND e.class_id = v_class.id
WHERE s.user_id IS NOT NULL
) AND status = 'active';
CONTINUE;
END IF;
v_next_name := app.normalize_class_name((v_class.grade_level + 1)::text || regexp_replace(v_class.name, '^\s*\d+', ''));
SELECT id INTO v_target FROM public.classes
WHERE school_id = p_school AND academic_year_id = v_new AND is_active
AND app.class_name_key(name) = app.class_name_key(v_next_name);
IF v_target IS NULL THEN
INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, shift, homeroom_staff_id, room_id, capacity)
VALUES (p_school, v_new, v_next_name, v_class.grade_level + 1, v_class.shift, v_class.homeroom_staff_id, v_class.room_id, v_class.capacity)
RETURNING id INTO v_target;
ELSE
UPDATE public.classes
SET homeroom_staff_id = coalesce(homeroom_staff_id, v_class.homeroom_staff_id),
shift = CASE WHEN EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = v_target) THEN shift ELSE v_class.shift END,
updated_at = now()
WHERE id = v_target;
END IF;
UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start - 1, enrolled_on), updated_at = now()
WHERE class_id = v_class.id AND status = 'active';
INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
SELECT p_school, e.student_id, v_target, v_new, p_start
FROM public.enrollments e
JOIN public.students s ON s.id = e.student_id AND s.status = 'active'
WHERE e.class_id = v_class.id
AND NOT EXISTS (
SELECT 1 FROM public.enrollments x
WHERE x.student_id = e.student_id AND x.academic_year_id = v_new AND x.status = 'active'
)
GROUP BY e.student_id;
GET DIAGNOSTICS v_inserted = ROW_COUNT;
v_moved := v_moved + v_inserted;
END LOOP;
INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id)
SELECT p_school, n.id, cs.subject_id, cs.group_label, CASE WHEN st.status = 'active' THEN cs.teacher_id END
FROM public.classes n
JOIN public.classes o
ON o.school_id = p_school AND o.academic_year_id = p_old
AND app.class_name_key(o.name) = app.class_name_key(n.name)
JOIN public.class_subjects cs ON cs.class_id = o.id AND cs.is_active
LEFT JOIN public.staff st ON st.id = cs.teacher_id
WHERE n.school_id = p_school AND n.academic_year_id = v_new
ON CONFLICT (class_id, subject_id, group_label) DO NOTHING;
GET DIAGNOSTICS v_subjects = ROW_COUNT;
PERFORM app.write_audit(p_school, 'advance_year', 'academic_years', v_new, NULL, NULL,
jsonb_build_object('moved', v_moved, 'graduated', v_graduated, 'subjectsCopied', v_subjects, 'automatic', true));
RETURN jsonb_build_object('yearId', v_new, 'moved', v_moved, 'graduated', v_graduated, 'subjectsCopied', v_subjects);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.promote_school_year(uuid, uuid, text, date, date) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.ensure_school_year(p_school uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_current public.academic_years%ROWTYPE;
v_span record;
BEGIN
IF p_school IS NULL THEN
RETURN NULL;
END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('school_year:' || p_school::text, 0));
SELECT * INTO v_span FROM app.school_year_span(app.school_today(p_school));
SELECT * INTO v_current FROM public.academic_years WHERE school_id = p_school AND is_current;
IF v_current.id IS NOT NULL
AND app.year_name_key(v_current.name) <> v_span.name
AND (SELECT s.start_date FROM app.school_year_span(v_current.start_date) s) < v_span.start_date THEN
PERFORM app.ensure_year_term(v_current.id);
PERFORM app.promote_school_year(p_school, v_current.id, v_span.name, v_span.start_date, v_span.end_date);
END IF;
SELECT * INTO v_current FROM public.academic_years WHERE school_id = p_school AND is_current;
IF v_current.id IS NOT NULL THEN
PERFORM app.ensure_year_term(v_current.id, true);
END IF;
RETURN app.ensure_school_basics(p_school);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_school_year(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.ensure_all_school_years()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid;
v_count int := 0;
BEGIN
FOR v_school IN SELECT id FROM public.schools LOOP
BEGIN
PERFORM app.ensure_school_year(v_school);
v_count := v_count + 1;
EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'school year for % failed: %', v_school, SQLERRM;
END;
END LOOP;
RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_all_school_years() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.ensure_school_year()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid := app.current_school_id();
v_current public.academic_years%ROWTYPE;
v_span record;
BEGIN
IF v_school IS NULL THEN
RETURN NULL;
END IF;
SELECT * INTO v_current FROM public.academic_years WHERE school_id = v_school AND is_current;
SELECT * INTO v_span FROM app.school_year_span(app.school_today(v_school));
IF v_current.id IS NOT NULL
AND app.year_name_key(v_current.name) = v_span.name
AND v_current.start_date <= v_span.start_date AND v_current.end_date >= v_span.end_date
AND EXISTS (SELECT 1 FROM public.academic_terms t WHERE t.academic_year_id = v_current.id)
AND (SELECT count(*) FROM public.classes c WHERE c.academic_year_id = v_current.id AND c.is_active) >= 66
AND (SELECT count(*) FROM public.bell_periods b WHERE b.school_id = v_school) = 10 THEN
RETURN v_current.id;
END IF;
RETURN app.ensure_school_year(v_school);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_school_year() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_school_year() TO authenticated;
DROP POLICY IF EXISTS bell_periods_write ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_insert ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_update ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_delete ON public.bell_periods;
REVOKE INSERT, UPDATE, DELETE ON public.bell_periods FROM authenticated;
CREATE OR REPLACE FUNCTION public.rule_journal_column(
p_class_subject_id uuid,
p_academic_term_id uuid,
p_kind text,
p_date date DEFAULT NULL,
p_assessment_type_id uuid DEFAULT NULL,
p_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid;
v_term public.academic_terms%ROWTYPE;
v_type uuid := p_assessment_type_id;
v_date date := p_date;
v_id uuid;
BEGIN
SELECT cs.school_id INTO v_school FROM public.class_subjects cs WHERE cs.id = p_class_subject_id;
IF v_school IS NULL THEN
RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23503';
END IF;
IF NOT app.may_keep_journal(p_class_subject_id) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
SELECT * INTO v_term FROM public.academic_terms WHERE id = p_academic_term_id;
IF NOT FOUND OR v_term.school_id <> v_school THEN
RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
END IF;
IF p_kind = 'term' THEN
v_date := coalesce(v_date, least(greatest(app.school_today(v_school), v_term.start_date), v_term.end_date));
IF v_type IS NULL THEN
SELECT at.id INTO v_type FROM public.assessment_types at
WHERE at.school_id = v_school AND at.is_final AND at.is_active
ORDER BY (at.code = CASE WHEN lower(btrim(coalesce(p_label, ''))) LIKE 'солона%' OR lower(btrim(coalesce(p_label, ''))) LIKE 'годов%'
OR lower(btrim(coalesce(p_label, ''))) LIKE 'year%' THEN 'year_final' ELSE 'term_final' END) DESC,
at.sort_order
LIMIT 1;
END IF;
IF p_label IS NULL OR btrim(p_label) = '' THEN
RAISE EXCEPTION 'label_required' USING ERRCODE = '22023';
END IF;
ELSE
IF v_date IS NULL THEN
RAISE EXCEPTION 'date_required' USING ERRCODE = '22023';
END IF;
IF v_type IS NULL THEN
SELECT at.id INTO v_type FROM public.assessment_types at
WHERE at.school_id = v_school AND at.is_active AND NOT at.is_final
ORDER BY at.sort_order LIMIT 1;
END IF;
END IF;
IF v_type IS NULL THEN
RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
END IF;
INSERT INTO public.journal_columns (school_id, class_subject_id, academic_term_id, column_date, assessment_type_id, label, kind)
VALUES (v_school, p_class_subject_id, p_academic_term_id, v_date, v_type, nullif(btrim(coalesce(p_label, '')), ''),
CASE WHEN p_kind = 'term' THEN 'term' ELSE 'lesson' END)
ON CONFLICT ON CONSTRAINT journal_columns_unique DO UPDATE
SET label = coalesce(EXCLUDED.label, public.journal_columns.label),
kind = CASE WHEN EXCLUDED.kind = 'term' THEN 'term' ELSE public.journal_columns.kind END,
updated_at = now()
RETURNING id INTO v_id;
RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) TO authenticated;
DROP FUNCTION IF EXISTS public.report_card_marks(uuid);
CREATE FUNCTION public.report_card_marks(p_class_id uuid)
RETURNS TABLE (
student_id uuid, class_subject_id uuid, academic_term_id uuid,
kind text, mark numeric, approved boolean, marks_count int,
label text, marked_on date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT g.student_id, g.class_subject_id, g.academic_term_id,
at.code::text, round(g.score / g.max_score * 5, 1), g.status = 'approved', 1,
(SELECT jc.label::text FROM public.journal_columns jc
WHERE jc.class_subject_id = g.class_subject_id AND jc.column_date = g.grade_date
AND jc.assessment_type_id = g.assessment_type_id
LIMIT 1),
g.grade_date
FROM public.grades g
JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
JOIN public.assessment_types at ON at.id = g.assessment_type_id
WHERE at.is_final
UNION ALL
SELECT g.student_id, g.class_subject_id, g.academic_term_id,
'average', round(sum(g.score / g.max_score * 5 * at.weight) / nullif(sum(at.weight), 0), 1), true, count(*)::int,
NULL::text, max(g.grade_date)
FROM public.grades g
JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
JOIN public.assessment_types at ON at.id = g.assessment_type_id
WHERE NOT at.is_final AND g.academic_term_id IS NOT NULL
GROUP BY g.student_id, g.class_subject_id, g.academic_term_id
$$;
REVOKE EXECUTE ON FUNCTION public.report_card_marks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_card_marks(uuid) TO authenticated;
DO $$
BEGIN
PERFORM cron.unschedule('school-year');
EXCEPTION WHEN OTHERS THEN
NULL;
END;
$$;
DO $$
BEGIN
PERFORM cron.schedule('school-year', '5 19 * * *', 'SELECT app.ensure_all_school_years()');
EXCEPTION WHEN OTHERS THEN
RAISE NOTICE 'cron.schedule is not available here; the office pages turn the year over instead';
END;
$$;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180086', '00086_the_school_year_runs_itself') ON CONFLICT (version) DO NOTHING;
CREATE OR REPLACE FUNCTION app.subject_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT btrim(regexp_replace(
translate(lower(coalesce(p_name, '')), 'ӢӮҶҲҚҒӣӯҷҳқғ', 'иучхкгиучхкг'),
'[[:space:][:punct:]«»“”„–—]+', ' ', 'g'))
$$;
GRANT EXECUTE ON FUNCTION app.subject_key(text) TO authenticated;
CREATE OR REPLACE FUNCTION app.subject_translation(p_name text, p_lang text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
v_key text := app.subject_key(p_name);
v_ru text;
v_en text;
v_rest text;
BEGIN
IF v_key = '' THEN
RETURN NULL;
END IF;
SELECT d.ru, d.en INTO v_ru, v_en
FROM (VALUES
('математика', 'Математика', 'Mathematics'),
('алгебра', 'Алгебра', 'Algebra'),
('геометрия', 'Геометрия', 'Geometry'),
('алгебра ва ибтидои анализ', 'Алгебра и начала анализа', 'Algebra and calculus'),
('физика', 'Физика', 'Physics'),
('химия', 'Химия', 'Chemistry'),
('биология', 'Биология', 'Biology'),
('информатика', 'Информатика', 'Computer science'),
('информатика ва технологияи иттилооти', 'Информатика и ИКТ', 'Computer science and ICT'),
('чугрофия', 'География', 'Geography'),
('география', 'География', 'Geography'),
('таърих', 'История', 'History'),
('таърихи халки точик', 'История таджикского народа', 'History of the Tajik people'),
('таърихи точик', 'История таджикского народа', 'History of the Tajik people'),
('таърихи умуми', 'Всеобщая история', 'World history'),
('таърихи чахон', 'Всемирная история', 'World history'),
('таърихи дин', 'История религий', 'History of religions'),
('хониш', 'Чтение', 'Reading'),
('хониши адаби', 'Литературное чтение', 'Literary reading'),
('хониши синфи', 'Классное чтение', 'Class reading'),
('алифбо', 'Букварь', 'ABC book'),
('савод', 'Обучение грамоте', 'Literacy'),
('саводи хат', 'Обучение грамоте', 'Literacy'),
('хуснавис', 'Чистописание', 'Penmanship'),
('хуснависи', 'Чистописание', 'Penmanship'),
('хатнавис', 'Чистописание', 'Penmanship'),
('хатнависи', 'Чистописание', 'Penmanship'),
('табиатшиноси', 'Природоведение', 'Natural science'),
('олами атроф', 'Окружающий мир', 'The world around us'),
('тарбияи чисмони', 'Физическая культура', 'Physical education'),
('варзиш', 'Физическая культура', 'Physical education'),
('мусики', 'Музыка', 'Music'),
('мусики ва суруд', 'Музыка и пение', 'Music and singing'),
('санъати тасвири', 'Изобразительное искусство', 'Fine arts'),
('расмкаши', 'Рисование', 'Drawing'),
('накшакаши', 'Черчение', 'Technical drawing'),
('технология', 'Технология', 'Technology'),
('мехнат', 'Трудовое обучение', 'Handicraft'),
('таълими мехнат', 'Трудовое обучение', 'Handicraft'),
('тарбияи мехнати', 'Трудовое обучение', 'Handicraft'),
('хукук', 'Право', 'Law'),
('асосхои давлат ва хукук', 'Основы государства и права', 'Fundamentals of state and law'),
('асосхои давлатдори ва хукук', 'Основы государства и права', 'Fundamentals of state and law'),
('чомеашиноси', 'Обществознание', 'Social studies'),
('инсон ва чомеа', 'Человек и общество', 'Man and society'),
('иктисод', 'Экономика', 'Economics'),
('асосхои иктисод', 'Основы экономики', 'Fundamentals of economics'),
('одоб', 'Этика', 'Ethics'),
('ахлок', 'Этика', 'Ethics'),
('мантик', 'Логика', 'Logic'),
('астрономия', 'Астрономия', 'Astronomy'),
('экология', 'Экология', 'Ecology'),
('омодагии ибтидоии харби', 'Начальная военная подготовка', 'Pre-military training'),
('тайёрии ибтидоии харби', 'Начальная военная подготовка', 'Pre-military training'),
('тайёрии харби', 'Начальная военная подготовка', 'Pre-military training'),
('асосхои бехатарии фаъолияти хаёти', 'Основы безопасности жизнедеятельности', 'Life safety'),
('бехатарии хаёт', 'Основы безопасности жизнедеятельности', 'Life safety'),
('соати синфи', 'Классный час', 'Class hour'),
('соати тарбияви', 'Воспитательный час', 'Pastoral hour'),
('забон ва адабиёт', 'Язык и литература', 'Language and literature'),
('забони точики ва адабиёт', 'Таджикский язык и литература', 'Tajik language and literature'),
('адабиёт', 'Литература', 'Literature'),
('адабиёти чахон', 'Мировая литература', 'World literature'),
('адабиёти чахони', 'Мировая литература', 'World literature'),
('арифметика', 'Арифметика', 'Arithmetic'),
('хисоб', 'Арифметика', 'Arithmetic'),
('табиатшиноси ва олами атроф', 'Окружающий мир', 'The world around us'),
('робототехника', 'Робототехника', 'Robotics'),
('асосхои ислом', 'Основы ислама', 'Fundamentals of Islam'),
('корхои амали', 'Практические работы', 'Practical work')
) AS d(key, ru, en)
WHERE d.key = v_key;
IF v_ru IS NULL AND v_key LIKE 'забони %' THEN
v_rest := substr(v_key, 8);
SELECT l.ru || ' язык', l.en INTO v_ru, v_en
FROM (VALUES
('точики', 'Таджикский', 'Tajik language'),
('руси', 'Русский', 'Russian language'),
('англиси', 'Английский', 'English'),
('олмони', 'Немецкий', 'German'),
('фаронсави', 'Французский', 'French'),
('араби', 'Арабский', 'Arabic'),
('хитои', 'Китайский', 'Chinese'),
('форси', 'Персидский', 'Persian'),
('турки', 'Турецкий', 'Turkish'),
('узбеки', 'Узбекский', 'Uzbek'),
('испани', 'Испанский', 'Spanish'),
('корея', 'Корейский', 'Korean'),
('корейги', 'Корейский', 'Korean'),
('япони', 'Японский', 'Japanese'),
('итолиёви', 'Итальянский', 'Italian'),
('хинди', 'Хинди', 'Hindi'),
('модари', 'Родной', 'Mother tongue'),
('давлати', 'Государственный', 'State language'),
('хоричи', 'Иностранный', 'Foreign language')
) AS l(key, ru, en)
WHERE l.key = v_rest;
END IF;
IF v_ru IS NULL AND v_key LIKE 'адабиёти %' THEN
v_rest := substr(v_key, 10);
SELECT l.ru, l.en INTO v_ru, v_en
FROM (VALUES
('точик', 'Таджикская литература', 'Tajik literature'),
('точики', 'Таджикская литература', 'Tajik literature'),
('классики', 'Классическая литература', 'Classical literature'),
('рус', 'Русская литература', 'Russian literature'),
('руси', 'Русская литература', 'Russian literature'),
('англис', 'Английская литература', 'English literature'),
('англиси', 'Английская литература', 'English literature'),
('форс', 'Персидская литература', 'Persian literature'),
('чахон', 'Мировая литература', 'World literature'),
('чахони', 'Мировая литература', 'World literature')
) AS l(key, ru, en)
WHERE l.key = v_rest;
END IF;
RETURN CASE lower(coalesce(p_lang, '')) WHEN 'ru' THEN v_ru WHEN 'en' THEN v_en ELSE NULL END;
END;
$$;
GRANT EXECUTE ON FUNCTION app.subject_translation(text, text) TO authenticated;
CREATE OR REPLACE FUNCTION app.latin(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
translate(upper(coalesce(p_text, '')), 'АБВГҒДЕЗИӢЙКҚЛМНОПРСТУӮФҲЦЫЭЪ', 'ABVGGDEZIIYKQLMNOPRSTUUFHCYE'''),
'Ё', 'YO'), 'Ж', 'ZH'), 'Ҷ', 'J'), 'Ч', 'CH'), 'Ш', 'SH'), 'Щ', 'SH'), 'Х', 'KH'), 'Ю', 'YU'), 'Я', 'YA'), 'Ь', '')
$$;
CREATE OR REPLACE FUNCTION app.subject_code_for(p_school uuid, p_name text, p_except uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_source text := coalesce(app.subject_translation(p_name, 'en'), app.latin(p_name));
v_words text[];
v_base text;
v_code text;
v_n int := 1;
BEGIN
SELECT array_agg(w ORDER BY o) INTO v_words
FROM regexp_split_to_table(upper(regexp_replace(v_source, '[^A-Za-z ]+', ' ', 'g')), '\s+') WITH ORDINALITY AS t(w, o)
WHERE w <> '' AND w NOT IN ('OF', 'THE', 'AND', 'VA', 'A', 'AN');
IF v_words IS NULL OR cardinality(v_words) = 0 THEN
v_base := 'SUB';
ELSE
v_base := left(v_words[1], 3);
IF cardinality(v_words) > 1 THEN
v_base := v_base || (SELECT string_agg(left(w, 1), '') FROM unnest(v_words[2:4]) AS w);
END IF;
END IF;
v_code := v_base;
WHILE EXISTS (
SELECT 1 FROM public.subjects s
WHERE s.school_id = p_school AND upper(s.code) = v_code AND s.id IS DISTINCT FROM p_except
) LOOP
v_n := v_n + 1;
v_code := v_base || v_n::text;
END LOOP;
RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.subject_code_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.complete_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
NEW.name_tg := regexp_replace(btrim(NEW.name_tg), '\s+', ' ', 'g');
IF TG_OP = 'UPDATE' AND NEW.name_tg IS DISTINCT FROM OLD.name_tg THEN
IF OLD.name_ru IS NOT DISTINCT FROM app.subject_translation(OLD.name_tg, 'ru') AND NEW.name_ru IS NOT DISTINCT FROM OLD.name_ru THEN
NEW.name_ru := NULL;
END IF;
IF OLD.name_en IS NOT DISTINCT FROM app.subject_translation(OLD.name_tg, 'en') AND NEW.name_en IS NOT DISTINCT FROM OLD.name_en THEN
NEW.name_en := NULL;
END IF;
END IF;
NEW.name_ru := coalesce(nullif(btrim(NEW.name_ru), ''), app.subject_translation(NEW.name_tg, 'ru'));
NEW.name_en := coalesce(nullif(btrim(NEW.name_en), ''), app.subject_translation(NEW.name_tg, 'en'));
IF nullif(btrim(coalesce(NEW.code, '')), '') IS NULL THEN
NEW.code := app.subject_code_for(NEW.school_id, NEW.name_tg, NEW.id);
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_complete_subject ON public.subjects;
CREATE TRIGGER trg_complete_subject
BEFORE INSERT OR UPDATE OF name_tg, name_ru, name_en, code ON public.subjects
FOR EACH ROW EXECUTE FUNCTION app.complete_subject();
DO $$
DECLARE
v_id uuid;
BEGIN
FOR v_id IN
SELECT id FROM public.subjects
WHERE name_ru IS NULL OR name_en IS NULL OR nullif(btrim(coalesce(code, '')), '') IS NULL
ORDER BY created_at, id
LOOP
UPDATE public.subjects SET name_tg = name_tg WHERE id = v_id;
END LOOP;
END;
$$;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180087', '00087_subjects_by_their_name') ON CONFLICT (version) DO NOTHING;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS subjects_note varchar(500);
COMMENT ON COLUMN public.staff.subjects_note IS
'The subjects the teachers'' workbook lists for this person: information only; the timetable decides who teaches what.';
ALTER TABLE public.guardians ADD COLUMN IF NOT EXISTS telegram_confirmed_at timestamptz;
ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS pending_guardian uuid REFERENCES public.guardians(id) ON DELETE SET NULL;
ALTER TABLE public.telegram_outbox DROP CONSTRAINT IF EXISTS telegram_outbox_kind_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_kind_check
CHECK (kind IN ('grade', 'absence', 'digest', 'note'));
CREATE OR REPLACE FUNCTION app.random_parent_password()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_letters constant text := 'abcdefghijkmnpqrstuvwxyz';
v_bytes bytea := extensions.gen_random_bytes(16);
v_out text := '';
i int;
BEGIN
FOR i IN 0 .. 1 LOOP
v_out := v_out || substr(v_letters, (get_byte(v_bytes, i) % 24) + 1, 1);
END LOOP;
FOR i IN 2 .. 7 LOOP
v_out := v_out || ((get_byte(v_bytes, i) * 256 + get_byte(v_bytes, i + 8)) % 10)::text;
END LOOP;
RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.random_parent_password() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.attach_parent(
p_school uuid,
p_student uuid,
p_relationship text,
p_name text,
p_phone text,
p_workplace text,
p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_parts text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
v_last text;
v_first text;
v_middle text;
v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
v_workplace text := nullif(btrim(coalesce(p_workplace, '')), '');
v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
v_rel text := CASE WHEN p_relationship IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other') THEN p_relationship ELSE 'guardian' END;
v_guardian public.guardians%ROWTYPE;
v_user uuid;
v_holder uuid;
v_holder_is_pupil boolean;
v_password text;
v_login text;
v_role uuid;
BEGIN
v_last := v_parts[1];
v_first := coalesce(v_parts[2], v_parts[1]);
v_middle := nullif(array_to_string(v_parts[3:], ' '), '');
SELECT * INTO v_guardian FROM public.guardians g
WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
LIMIT 1;
IF v_guardian.id IS NULL THEN
INSERT INTO public.guardians (school_id, first_name, last_name, middle_name, phone, email, workplace)
VALUES (p_school, v_first, v_last, v_middle, v_phone, v_email, v_workplace)
RETURNING * INTO v_guardian;
ELSE
UPDATE public.guardians SET
first_name = coalesce(v_first, first_name),
last_name = coalesce(v_last, last_name),
middle_name = coalesce(v_middle, middle_name),
email = coalesce(v_email, email),
workplace = coalesce(v_workplace, workplace),
status = 'active',
updated_at = now()
WHERE id = v_guardian.id
AND (first_name IS DISTINCT FROM coalesce(v_first, first_name)
OR last_name IS DISTINCT FROM coalesce(v_last, last_name)
OR middle_name IS DISTINCT FROM coalesce(v_middle, middle_name)
OR email IS DISTINCT FROM coalesce(v_email, email)
OR workplace IS DISTINCT FROM coalesce(v_workplace, workplace)
OR status <> 'active')
RETURNING * INTO v_guardian;
IF v_guardian.id IS NULL THEN
SELECT * INTO v_guardian FROM public.guardians g
WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
LIMIT 1;
END IF;
END IF;
v_user := v_guardian.user_id;
IF v_user IS NULL THEN
SELECT u.id, EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = u.id)
INTO v_holder, v_holder_is_pupil
FROM public.users u
WHERE u.school_id = p_school AND app.phone_key(u.phone) = app.phone_key(v_phone)
LIMIT 1;
IF v_holder IS NOT NULL AND NOT v_holder_is_pupil
AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.user_id = v_holder) THEN
v_user := v_holder;
ELSE
v_password := app.random_parent_password();
v_user := app.create_login('p' || app.random_password(12) || '@parents.invalid', v_password);
UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, status, is_active, credentials_issued_at)
SELECT v_user, p_school, au.email, v_first, v_last, v_middle,
CASE WHEN v_holder IS NULL THEN v_phone END, 'active', true, now()
FROM auth.users au WHERE au.id = v_user;
END IF;
UPDATE public.guardians SET user_id = v_user, updated_at = now() WHERE id = v_guardian.id;
END IF;
SELECT r.id INTO v_role FROM public.roles r
WHERE r.school_id = p_school AND r.is_active AND r.slug = 'parent'
ORDER BY r.level LIMIT 1;
IF v_role IS NOT NULL THEN
INSERT INTO public.user_roles (user_id, role_id, school_id)
VALUES (v_user, v_role, p_school)
ON CONFLICT DO NOTHING;
END IF;
INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
VALUES (p_student, v_guardian.id, p_school, v_rel,
NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = p_student AND x.is_primary))
ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship
WHERE public.student_guardians.relationship IS DISTINCT FROM EXCLUDED.relationship;
SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;
RETURN jsonb_build_object('guardianId', v_guardian.id, 'login', v_login, 'password', v_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.attach_parent(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.parent_cell_errors(p_row jsonb, p_number int, p_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
v_errors jsonb := '[]'::jsonb;
v_name text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_name'), '')), '');
v_phone text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_phone'), '')), '');
v_email text := nullif(lower(btrim(coalesce(p_row ->> (p_prefix || '_email'), ''))), '');
BEGIN
IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$' OR length(regexp_replace(v_phone, '\D', '', 'g')) < 5) THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'invalid_phone');
END IF;
IF v_phone IS NOT NULL AND v_name IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'required');
END IF;
IF v_name IS NOT NULL AND v_phone IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'required');
END IF;
IF v_name IS NOT NULL AND (array_length(regexp_split_to_array(btrim(v_name), '\s+'), 1) < 2 OR length(v_name) > 200) THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'guardian_name');
END IF;
IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_email', 'code', 'invalid_email');
END IF;
RETURN v_errors;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_guardians(p_rows jsonb)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT 0
$$;
CREATE OR REPLACE FUNCTION public.save_my_guardian(
p_relationship text,
p_last_name text,
p_first_name text,
p_middle_name text DEFAULT NULL,
p_birth_year int DEFAULT NULL,
p_phone text DEFAULT NULL,
p_workplace text DEFAULT NULL,
p_guardian_id uuid DEFAULT NULL,
p_sibling_of uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_my_guardian(p_guardian_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_guardians() FROM authenticated;
CREATE OR REPLACE FUNCTION app.may_see_parents(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
SELECT 1 FROM public.students s
WHERE s.id = p_student AND s.school_id = app.current_school_id()
AND (app.can(s.school_id, 'students.view')
OR app.can(s.school_id, 'guardians.view')
OR app.student_current_class(s.id) = ANY (app.my_homeroom_class_ids())
OR s.id = ANY (app.my_taught_student_ids()))
)
$$;
GRANT EXECUTE ON FUNCTION app.may_see_parents(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.student_parents(p_student uuid)
RETURNS TABLE (
guardian_id uuid, relationship text, last_name text, first_name text, middle_name text,
workplace text, phone text, email text, login text, telegram_confirmed_at timestamptz,
telegram_chats int, children int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
IF NOT app.may_see_parents(p_student) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
RETURN QUERY
SELECT g.id, sg.relationship::text, g.last_name::text, g.first_name::text, g.middle_name::text,
g.workplace::text, g.phone::text, g.email::text, u.public_id::text, g.telegram_confirmed_at,
(SELECT count(*)::int FROM public.telegram_children tc WHERE tc.student_id = p_student),
(SELECT count(*)::int FROM public.student_guardians o WHERE o.guardian_id = g.id)
FROM public.student_guardians sg
JOIN public.guardians g ON g.id = sg.guardian_id
LEFT JOIN public.users u ON u.id = g.user_id
WHERE sg.student_id = p_student AND g.status = 'active'
ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.student_parents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_parents(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.send_parent_note(p_student uuid, p_text text)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid;
v_text text := btrim(coalesce(p_text, ''));
v_author text;
v_count int;
BEGIN
IF NOT app.may_see_parents(p_student) OR NOT app.is_staff_member() THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF length(v_text) < 2 OR length(v_text) > 2000 THEN
RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
END IF;
SELECT s.school_id INTO v_school FROM public.students s WHERE s.id = p_student;
SELECT btrim(u.last_name || ' ' || u.first_name || ' ' || coalesce(u.middle_name, '')) INTO v_author
FROM public.users u WHERE u.id = (SELECT auth.uid());
INSERT INTO public.telegram_outbox (chat_id, school_id, student_id, kind, payload, dedupe_key, send_after)
SELECT tc.chat_id, v_school, p_student, 'note',
jsonb_build_object('text', v_text, 'from', v_author),
'note:' || gen_random_uuid()::text, now()
FROM public.telegram_children tc
WHERE tc.student_id = p_student;
GET DIAGNOSTICS v_count = ROW_COUNT;
PERFORM app.write_audit(v_school, 'parent_note', 'student', p_student, NULL, NULL, jsonb_build_object('chats', v_count));
RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_parent_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_parent_note(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.telegram_find_child(p_chat bigint, p_needle text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_needle text := btrim(coalesce(p_needle, ''));
v_student uuid;
v_school uuid;
v_guardian uuid;
v_matches int;
BEGIN
IF v_needle = '' OR length(v_needle) > 64 THEN
RETURN jsonb_build_object('found', false);
END IF;
SELECT g.id, g.school_id INTO v_guardian, v_school
FROM public.guardians g
JOIN public.users u ON u.id = g.user_id
WHERE upper(u.public_id) = upper(v_needle) AND g.status = 'active'
AND u.status NOT IN ('blocked', 'rejected')
AND EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.guardian_id = g.id)
LIMIT 1;
IF v_guardian IS NOT NULL THEN
UPDATE public.telegram_chats
SET state = 'awaiting_code', pending_guardian = v_guardian, pending_student = NULL,
school_id = coalesce(school_id, v_school), updated_at = now()
WHERE chat_id = p_chat;
RETURN jsonb_build_object('found', true, 'noCode', false, 'parent', true);
END IF;
SELECT count(*) INTO v_matches
FROM public.students st
JOIN public.users u ON u.id = st.user_id
WHERE st.status = 'active'
AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));
IF v_matches <> 1 THEN
RETURN jsonb_build_object('found', false, 'ambiguous', v_matches > 1);
END IF;
SELECT st.id, st.school_id INTO v_student, v_school
FROM public.students st
JOIN public.users u ON u.id = st.user_id
WHERE st.status = 'active'
AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));
IF NOT EXISTS (SELECT 1 FROM public.parent_codes pc WHERE pc.student_id = v_student) THEN
RETURN jsonb_build_object('found', true, 'noCode', true);
END IF;
UPDATE public.telegram_chats
SET state = 'awaiting_code', pending_student = v_student, pending_guardian = NULL,
school_id = coalesce(school_id, v_school), updated_at = now()
WHERE chat_id = p_chat;
RETURN jsonb_build_object('found', true, 'noCode', false, 'parent', false);
END;
$$;
CREATE OR REPLACE FUNCTION public.telegram_confirm_child(p_chat bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_chat public.telegram_chats%ROWTYPE;
v_hash text;
v_student uuid;
v_ok boolean := false;
BEGIN
SELECT * INTO v_chat FROM public.telegram_chats WHERE chat_id = p_chat;
IF v_chat.chat_id IS NULL OR (v_chat.pending_student IS NULL AND v_chat.pending_guardian IS NULL) THEN
RETURN jsonb_build_object('ok', false, 'reason', 'no_pending');
END IF;
IF v_chat.blocked_until IS NOT NULL AND v_chat.blocked_until > now() THEN
RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
END IF;
IF v_chat.pending_guardian IS NOT NULL THEN
SELECT au.encrypted_password INTO v_hash
FROM public.guardians g JOIN auth.users au ON au.id = g.user_id
WHERE g.id = v_chat.pending_guardian;
v_ok := v_hash IS NOT NULL AND v_hash <> '' AND extensions.crypt(btrim(coalesce(p_code, '')), v_hash) = v_hash;
ELSE
v_student := v_chat.pending_student;
SELECT pc.code_hash INTO v_hash FROM public.parent_codes pc WHERE pc.student_id = v_student;
v_ok := v_hash IS NOT NULL AND extensions.crypt(btrim(coalesce(p_code, '')), v_hash) = v_hash;
END IF;
IF NOT v_ok THEN
UPDATE public.telegram_chats
SET attempts = attempts + 1,
blocked_until = CASE WHEN attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE blocked_until END,
updated_at = now()
WHERE chat_id = p_chat;
RETURN jsonb_build_object('ok', false, 'reason', 'wrong');
END IF;
IF v_chat.pending_guardian IS NOT NULL THEN
INSERT INTO public.telegram_children (chat_id, student_id, school_id)
SELECT p_chat, st.id, st.school_id
FROM public.student_guardians sg JOIN public.students st ON st.id = sg.student_id AND st.status = 'active'
WHERE sg.guardian_id = v_chat.pending_guardian
ON CONFLICT DO NOTHING;
UPDATE public.guardians SET telegram_confirmed_at = coalesce(telegram_confirmed_at, now()), updated_at = now()
WHERE id = v_chat.pending_guardian;
ELSE
INSERT INTO public.telegram_children (chat_id, student_id, school_id)
SELECT p_chat, v_student, st.school_id FROM public.students st WHERE st.id = v_student
ON CONFLICT DO NOTHING;
END IF;
UPDATE public.telegram_chats
SET state = 'idle', pending_student = NULL, pending_guardian = NULL, attempts = 0, blocked_until = NULL, updated_at = now()
WHERE chat_id = p_chat;
RETURN jsonb_build_object(
'ok', true,
'child', (
SELECT jsonb_build_object('id', st.id, 'name', st.last_name || ' ' || st.first_name, 'class', c.name)
FROM public.students st
LEFT JOIN public.classes c ON c.id = app.student_current_class(st.id)
WHERE st.id = coalesce(v_student, (
SELECT sg.student_id FROM public.student_guardians sg JOIN public.students s2 ON s2.id = sg.student_id
WHERE sg.guardian_id = v_chat.pending_guardian AND s2.status = 'active'
ORDER BY s2.last_name, s2.first_name LIMIT 1))
),
'children', (
SELECT coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.last_name || ' ' || st.first_name, 'class', c.name)
ORDER BY st.last_name, st.first_name), '[]'::jsonb)
FROM public.students st
LEFT JOIN public.classes c ON c.id = app.student_current_class(st.id)
WHERE st.status = 'active'
AND (st.id = v_student
OR st.id IN (SELECT sg.student_id FROM public.student_guardians sg WHERE sg.guardian_id = v_chat.pending_guardian))
)
);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_find_child(bigint, text), public.telegram_confirm_child(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_find_child(bigint, text), public.telegram_confirm_child(bigint, text) TO service_role;
CREATE OR REPLACE FUNCTION public.remove_student(p_student uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_student public.students%ROWTYPE;
v_today date;
BEGIN
SELECT * INTO v_student FROM public.students WHERE id = p_student;
IF NOT FOUND OR v_student.school_id IS DISTINCT FROM app.current_school_id()
OR NOT (app.can(v_student.school_id, 'students.archive') OR app.can(v_student.school_id, 'students.update')) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
v_today := app.school_today(v_student.school_id);
UPDATE public.enrollments
SET status = 'withdrawn', left_on = greatest(v_today, enrolled_on), reason = coalesce(left(p_reason, 500), reason), updated_at = now()
WHERE student_id = p_student AND status = 'active';
UPDATE public.students SET status = 'transferred', status_changed_at = now(), updated_at = now() WHERE id = p_student;
DELETE FROM public.class_positions WHERE student_id = p_student;
IF v_student.user_id IS NOT NULL THEN
UPDATE public.users SET status = 'inactive', updated_at = now() WHERE id = v_student.user_id AND status = 'active';
END IF;
PERFORM app.write_audit(v_student.school_id, 'remove_student', 'student', p_student, NULL, NULL,
jsonb_build_object('reason', left(p_reason, 500)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_student(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_student(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.account_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid := app.current_school_id();
v_year uuid;
v_user public.users%ROWTYPE;
v_student public.students%ROWTYPE;
v_staff public.staff%ROWTYPE;
v_guardian public.guardians%ROWTYPE;
v_class public.classes%ROWTYPE;
BEGIN
IF v_school IS NULL THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
SELECT * INTO v_user FROM public.users u WHERE u.id = p_user_id AND u.school_id = v_school;
IF NOT FOUND THEN
RETURN NULL;
END IF;
IF NOT (app.can(v_school, 'users.view') OR app.may_manage_account(p_user_id)) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
v_year := app.current_year_id(v_school);
SELECT * INTO v_student FROM public.students s WHERE s.user_id = p_user_id;
IF v_student.id IS NOT NULL THEN
SELECT * INTO v_class FROM public.classes c WHERE c.id = app.student_current_class(v_student.id);
END IF;
SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = p_user_id;
SELECT * INTO v_guardian FROM public.guardians g WHERE g.user_id = p_user_id;
RETURN jsonb_build_object(
'id', v_user.id,
'public_id', v_user.public_id,
'first_name', v_user.first_name,
'last_name', v_user.last_name,
'middle_name', v_user.middle_name,
'nickname', v_user.nickname,
'avatar_url', v_user.avatar_url,
'email', CASE WHEN v_user.email LIKE '%.invalid' THEN NULL ELSE v_user.email END,
'phone', v_user.phone,
'date_of_birth', v_user.date_of_birth,
'gender', v_user.gender,
'status', v_user.status,
'is_active', v_user.is_active,
'created_at', v_user.created_at,
'last_login_at', v_user.last_login_at,
'credentials_issued_at', v_user.credentials_issued_at,
'category', app.account_category(v_user.id),
'is_self', v_user.id = (SELECT auth.uid()),
'can_edit', app.may_manage_account(v_user.id),
'mfa', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_user.id AND f.status::text = 'verified'),
'roles', coalesce((
SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru,
'name_en', r.name_en, 'level', r.level) ORDER BY r.level)
FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = v_user.id
), '[]'::jsonb),
'student', CASE WHEN v_student.id IS NULL THEN NULL ELSE jsonb_build_object(
'id', v_student.id,
'student_number', v_student.student_number,
'address', v_student.address,
'class_id', v_class.id,
'class_name', v_class.name,
'grade_level', v_class.grade_level,
'parent_required', coalesce(v_class.grade_level <= app.parent_required_max_grade(v_school), false),
'parent_managed', coalesce(v_class.grade_level <= app.parent_managed_max_grade(v_school), false),
'positions', coalesce((
SELECT jsonb_agg(cp.position ORDER BY cp.position) FROM public.class_positions cp
WHERE cp.student_id = v_student.id AND cp.class_id = v_class.id
), '[]'::jsonb),
'telegram', (SELECT count(*) FROM public.telegram_children tc WHERE tc.student_id = v_student.id),
'guardians', coalesce((
SELECT jsonb_agg(jsonb_build_object(
'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'middle_name', g.middle_name,
'phone', g.phone, 'relationship', sg.relationship, 'is_primary', sg.is_primary, 'user_id', g.user_id,
'workplace', g.workplace, 'email', g.email, 'telegram_confirmed_at', g.telegram_confirmed_at,
'login', (SELECT u.public_id FROM public.users u WHERE u.id = g.user_id)
) ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name)
FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
WHERE sg.student_id = v_student.id
), '[]'::jsonb)
) END,
'staff', CASE WHEN v_staff.id IS NULL THEN NULL ELSE jsonb_build_object(
'id', v_staff.id,
'employee_number', v_staff.employee_number,
'staff_type', v_staff.staff_type,
'position', v_staff.position,
'qualification', v_staff.qualification,
'subjects_note', v_staff.subjects_note,
'hire_date', v_staff.hire_date,
'homeroom_class_id', (SELECT c.id FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
'homeroom_class_name', (SELECT c.name FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
'subjects', coalesce((
SELECT jsonb_agg(DISTINCT sj.name_tg)
FROM public.class_subjects cs
JOIN public.classes c ON c.id = cs.class_id AND c.academic_year_id = v_year
JOIN public.subjects sj ON sj.id = cs.subject_id
WHERE cs.teacher_id = v_staff.id AND cs.is_active
), '[]'::jsonb)
) END,
'guardian', CASE WHEN v_guardian.id IS NULL THEN NULL ELSE jsonb_build_object(
'id', v_guardian.id,
'workplace', v_guardian.workplace,
'email', v_guardian.email,
'telegram_confirmed_at', v_guardian.telegram_confirmed_at,
'children', coalesce((
SELECT jsonb_agg(jsonb_build_object(
'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
'relationship', sg.relationship, 'class_name', (SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(s.id))
) ORDER BY s.last_name)
FROM public.student_guardians sg JOIN public.students s ON s.id = sg.student_id
WHERE sg.guardian_id = v_guardian.id
), '[]'::jsonb)
) END
);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.account_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_details(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_account(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account(uuid, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_phone_conflicts(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid := app.current_school_id();
v_errors jsonb := '[]'::jsonb;
v_seen text[] := ARRAY[]::text[];
v_row jsonb;
v_index int;
v_key text;
v_login text;
v_email text;
BEGIN
IF v_school IS NULL OR NOT app.is_staff_member() THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
END IF;
FOR v_index IN 0 .. jsonb_array_length(p_rows) - 1 LOOP
v_row := p_rows -> v_index;
v_key := app.phone_key(v_row ->> 'phone');
CONTINUE WHEN v_key IS NULL;
IF v_key = ANY (v_seen) THEN
v_errors := v_errors || jsonb_build_object('row', v_index + 1, 'field', 'phone', 'code', 'duplicate_in_file');
CONTINUE;
END IF;
v_seen := v_seen || v_key;
v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
IF EXISTS (
SELECT 1 FROM public.users u
WHERE u.school_id = v_school
AND app.phone_key(u.phone) = v_key
AND NOT (v_login IS NOT NULL AND upper(u.public_id) = v_login)
AND NOT (v_email IS NOT NULL AND u.email = v_email)
AND NOT EXISTS (
SELECT 1 FROM public.students st
WHERE st.user_id = u.id
AND lower(st.last_name) = lower(btrim(coalesce(v_row ->> 'last_name', '')))
AND lower(st.first_name) = lower(btrim(coalesce(v_row ->> 'first_name', '')))
AND st.date_of_birth IS NOT DISTINCT FROM app.try_date(nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), ''))
)
AND NOT EXISTS (
SELECT 1 FROM public.staff sf
WHERE sf.user_id = u.id AND sf.school_id = v_school
AND sf.employee_number = nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '')
)
) THEN
v_errors := v_errors || jsonb_build_object('row', v_index + 1, 'field', 'phone', 'code', 'duplicate_existing');
END IF;
END LOOP;
RETURN v_errors;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.telegram_due(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_ids uuid[];
BEGIN
SELECT array_agg(id) INTO v_ids FROM (
SELECT o.id FROM public.telegram_outbox o
WHERE o.sent_at IS NULL AND o.send_after <= now() AND o.attempts < 3
ORDER BY o.send_after
LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
FOR UPDATE SKIP LOCKED
) due;
IF v_ids IS NULL THEN
RETURN '[]'::jsonb;
END IF;
UPDATE public.telegram_outbox
SET attempts = attempts + 1, send_after = now() + interval '90 seconds'
WHERE id = ANY (v_ids);
RETURN (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'id', o.id,
'chat', o.chat_id,
'locale', ch.locale,
'kind', o.kind,
'date', o.payload ->> 'date',
'school', jsonb_build_object('name', sc.short_name, 'slug', sc.slug),
'child', jsonb_build_object(
'name', st.last_name || ' ' || st.first_name,
'class', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
WHERE e.student_id = st.id AND e.status = 'active' LIMIT 1)
),
'grade', CASE WHEN o.kind <> 'grade' THEN NULL ELSE (
SELECT jsonb_build_object(
'score', g.score, 'max', g.max_score, 'date', g.grade_date, 'final', at.is_final,
'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
'work', jsonb_build_object('tg', at.name_tg, 'ru', at.name_ru, 'en', at.name_en))
FROM public.grades g
JOIN public.class_subjects cs ON cs.id = g.class_subject_id
JOIN public.subjects s ON s.id = cs.subject_id
JOIN public.assessment_types at ON at.id = g.assessment_type_id
WHERE g.id = (o.payload ->> 'grade')::uuid) END,
'absence', CASE WHEN o.kind <> 'absence' THEN NULL ELSE (
SELECT jsonb_build_object(
'status', a.status, 'date', a.attendance_date, 'period', a.period_number,
'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en))
FROM public.attendance_records a
LEFT JOIN public.class_subjects cs ON cs.id = a.class_subject_id
LEFT JOIN public.subjects s ON s.id = cs.subject_id
WHERE a.id = (o.payload ->> 'attendance')::uuid) END,
'digest', CASE WHEN o.kind <> 'digest' THEN NULL
ELSE public.telegram_report(o.chat_id, o.student_id, 'day', (o.payload ->> 'date')::date) END,
'note', CASE WHEN o.kind <> 'note' THEN NULL
ELSE jsonb_build_object('text', o.payload ->> 'text', 'from', o.payload ->> 'from') END
) ORDER BY o.send_after), '[]'::jsonb)
FROM public.telegram_outbox o
JOIN public.telegram_chats ch ON ch.chat_id = o.chat_id
JOIN public.students st ON st.id = o.student_id
JOIN public.schools sc ON sc.id = o.school_id
WHERE o.id = ANY (v_ids)
);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_due(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_due(int) TO service_role;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180088', '00088_parents_from_the_register') ON CONFLICT (version) DO NOTHING;
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
CREATE OR REPLACE FUNCTION public.import_people(
p_kind text,
p_rows jsonb,
p_dry_run boolean DEFAULT true,
p_offset int DEFAULT 0,
p_limit int DEFAULT 300
)
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
v_year_start date;
v_moved int;
v_total int;
v_errors jsonb := '[]'::jsonb;
v_credentials jsonb := '[]'::jsonb;
v_parents jsonb := '[]'::jsonb;
v_logins jsonb := '[]'::jsonb;
v_new_classes text[] := ARRAY[]::text[];
v_created int := 0;
v_updated int := 0;
v_row jsonb;
v_index int;
v_number int;
v_login text; v_last text; v_first text; v_middle text; v_email text;
v_phone text; v_dob date; v_gender text; v_class text; v_employee text;
v_staff_type text; v_homeroom text; v_position text; v_subjects text;
v_seen_login text[] := ARRAY[]::text[];
v_seen_email text[] := ARRAY[]::text[];
v_seen_key text[] := ARRAY[]::text[];
v_key text;
v_user_id uuid; v_person_id uuid; v_class_id uuid; v_role_id uuid;
v_password text; v_public_id text; v_matches int;
v_managed int; v_required int; v_grade int; v_placeholder boolean;
v_full boolean;
v_own_classes text[];
v_prefix text;
v_parent jsonb;
v_existing public.users%ROWTYPE;
BEGIN
IF v_school IS NULL THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF p_kind NOT IN ('students', 'staff') THEN
RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
END IF;
v_full := app.can(v_school, CASE WHEN p_kind = 'students' THEN 'students.import' ELSE 'staff.create' END);
IF NOT v_full THEN
IF p_kind <> 'students' OR cardinality(app.my_homeroom_class_ids()) = 0 THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
END IF;
IF jsonb_typeof(p_rows) <> 'array' THEN
RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
END IF;
v_total := jsonb_array_length(p_rows);
IF v_total = 0 THEN
RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023';
END IF;
IF v_total > 2000 THEN
RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
END IF;
v_year := app.ensure_school_basics(v_school);
v_managed := app.parent_managed_max_grade(v_school);
v_required := app.parent_required_max_grade(v_school);
SELECT y.start_date INTO v_year_start FROM public.academic_years y WHERE y.id = v_year;
IF p_kind = 'students' AND v_year IS NULL THEN
RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023';
END IF;
IF NOT v_full THEN
SELECT array_agg(app.class_name_key(c.name)) INTO v_own_classes
FROM public.classes c
WHERE c.id = ANY (app.my_homeroom_class_ids()) AND c.academic_year_id = v_year;
v_own_classes := coalesce(v_own_classes, ARRAY[]::text[]);
END IF;
FOR v_index IN 0 .. v_total - 1 LOOP
v_number := v_index + 1;
v_row := p_rows -> v_index;
v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
v_last := nullif(btrim(coalesce(v_row ->> 'last_name', '')), '');
v_first := nullif(btrim(coalesce(v_row ->> 'first_name', '')), '');
v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
v_class := app.normalize_class_name(v_row ->> 'class_name');
v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');
IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'required'); END IF;
IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'first_name', 'code', 'required'); END IF;
v_grade := CASE WHEN p_kind = 'students' THEN (regexp_match(coalesce(v_class, ''), '^(\d+)'))[1]::int END;
IF v_email IS NULL THEN
NULL;
ELSIF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'invalid_email');
ELSIF v_email = ANY (v_seen_email) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_in_file');
ELSE
v_seen_email := v_seen_email || v_email;
END IF;
IF v_login IS NOT NULL THEN
IF v_login = ANY (v_seen_login) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'login', 'code', 'duplicate_in_file');
ELSE
v_seen_login := v_seen_login || v_login;
END IF;
IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.school_id = v_school AND upper(u.public_id) = v_login) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'login', 'code', 'unknown_login');
END IF;
END IF;
IF p_kind = 'students' THEN
IF v_class IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'required');
ELSIF v_class !~ '^(1[01]|[1-9])[А-ЯЁҲҶҚҒӢӮ]?$' THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'invalid_class');
ELSIF NOT v_full AND NOT (app.class_name_key(v_class) = ANY (v_own_classes)) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'not_your_class');
END IF;
BEGIN
v_dob := app.try_date(v_row ->> 'date_of_birth');
EXCEPTION WHEN OTHERS THEN
v_dob := NULL;
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'invalid_date');
END;
IF v_dob IS NULL AND nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'required');
ELSIF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '30 years') THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'out_of_range');
END IF;
v_key := lower(coalesce(v_last, '')) || '|' || lower(coalesce(v_first, '')) || '|' || coalesce(v_dob::text, '');
IF v_login IS NULL AND v_key = ANY (v_seen_key) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'duplicate_in_file');
ELSE
v_seen_key := v_seen_key || v_key;
END IF;
FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
v_errors := v_errors || app.parent_cell_errors(v_row, v_number, v_prefix);
END LOOP;
IF v_grade IS NOT NULL AND v_grade <= v_required
AND nullif(btrim(coalesce(v_row ->> 'father_name', '')), '') IS NULL
AND nullif(btrim(coalesce(v_row ->> 'mother_name', '')), '') IS NULL
AND v_login IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'mother_name', 'code', 'guardian_required');
END IF;
ELSE
IF v_employee IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'required');
ELSIF v_employee !~ '^[A-Za-z0-9-]{1,32}$' THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'invalid_number');
ELSIF v_employee = ANY (v_seen_key) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'duplicate_in_file');
ELSE
v_seen_key := v_seen_key || v_employee;
END IF;
IF app.parse_staff_type(v_row ->> 'position') = 'invalid' THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'position', 'code', 'invalid_enum');
END IF;
v_homeroom := app.normalize_class_name(v_row ->> 'homeroom_class');
IF v_homeroom IS NOT NULL AND NOT EXISTS (
SELECT 1 FROM public.classes c
WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
AND app.class_name_key(c.name) = app.class_name_key(v_homeroom)
) THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'homeroom_class', 'code', 'unknown_class');
END IF;
END IF;
IF app.parse_gender(v_row ->> 'gender') = 'invalid' THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'gender', 'code', 'invalid_enum');
END IF;
IF v_email IS NOT NULL THEN
SELECT count(*) INTO v_matches
FROM public.users u
WHERE u.email = v_email
AND (v_login IS NULL OR upper(u.public_id) <> v_login);
IF v_matches > 0 AND v_login IS NULL THEN
SELECT count(*) INTO v_matches FROM public.users u WHERE u.email = v_email AND u.school_id = v_school;
IF v_matches = 0 THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_existing');
END IF;
ELSIF v_matches > 0 THEN
v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_existing');
END IF;
END IF;
END LOOP;
IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
RETURN jsonb_build_object(
'valid', jsonb_array_length(v_errors) = 0, 'total', v_total, 'errors', v_errors,
'created', 0, 'updated', 0, 'credentials', '[]'::jsonb, 'parents', '[]'::jsonb, 'logins', '[]'::jsonb,
'newClasses', to_jsonb(app.classes_to_create(v_school, v_year, p_kind, p_rows))
);
END IF;
FOR v_index IN p_offset .. least(p_offset + p_limit, v_total) - 1 LOOP
v_number := v_index + 1;
v_row := p_rows -> v_index;
v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
v_last := btrim(v_row ->> 'last_name');
v_first := btrim(v_row ->> 'first_name');
v_middle := nullif(btrim(coalesce(v_row ->> 'middle_name', '')), '');
v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
v_gender := nullif(app.parse_gender(v_row ->> 'gender'), 'invalid');
v_class := app.normalize_class_name(v_row ->> 'class_name');
v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');
v_position := nullif(btrim(coalesce(v_row ->> 'position', '')), '');
v_subjects := nullif(left(btrim(coalesce(v_row ->> 'subjects', '')), 500), '');
v_dob := CASE WHEN nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN NULL ELSE app.try_date(v_row ->> 'date_of_birth') END;
v_user_id := NULL;
v_person_id := NULL;
v_password := NULL;
IF v_login IS NOT NULL THEN
SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND upper(u.public_id) = v_login;
ELSIF p_kind = 'staff' THEN
SELECT s.id, s.user_id INTO v_person_id, v_user_id
FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee;
IF v_user_id IS NULL AND v_email IS NOT NULL THEN
SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND u.email = v_email;
END IF;
ELSE
SELECT st.id, st.user_id INTO v_person_id, v_user_id
FROM public.students st
WHERE st.school_id = v_school
AND lower(st.last_name) = lower(v_last)
AND lower(st.first_name) = lower(v_first)
AND st.date_of_birth IS NOT DISTINCT FROM v_dob
ORDER BY (st.status = 'active') DESC,
(app.class_name_key((SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(st.id)))
= app.class_name_key(v_class)) DESC NULLS LAST,
st.created_at
LIMIT 1;
IF v_user_id IS NULL AND v_email IS NOT NULL THEN
SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND u.email = v_email;
END IF;
END IF;
IF p_kind = 'students' THEN
SELECT c.id INTO v_class_id FROM public.classes c
WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
AND app.class_name_key(c.name) = app.class_name_key(v_class);
IF v_class_id IS NULL THEN
INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
VALUES (v_school, v_year, v_class, (regexp_match(v_class, '^(\d+)'))[1]::int)
RETURNING id INTO v_class_id;
v_new_classes := v_new_classes || v_class;
END IF;
END IF;
IF v_user_id IS NULL THEN
v_placeholder := v_email IS NULL;
IF v_placeholder THEN
v_email := CASE WHEN p_kind = 'staff' THEN 't' ELSE 's' END || app.random_password(12)
|| CASE WHEN p_kind = 'staff' THEN '@staff.invalid' ELSE '@pupils.invalid' END;
END IF;
v_password := app.random_password();
v_user_id := app.create_login(v_email, v_password);
IF v_placeholder THEN
UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
END IF;
INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
status, is_active, credentials_issued_at)
VALUES (v_user_id, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, 'active', true, now());
SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_user_id;
v_credentials := v_credentials || jsonb_build_object('row', v_number, 'login', v_public_id, 'password', v_password);
v_created := v_created + 1;
ELSE
SELECT * INTO v_existing FROM public.users u WHERE u.id = v_user_id;
IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_existing.email THEN
UPDATE auth.users SET email = v_email, email_confirmed_at = NULL, updated_at = now() WHERE id = v_user_id;
UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
WHERE user_id = v_user_id AND provider = 'email';
ELSE
v_email := v_existing.email;
END IF;
UPDATE public.users SET
email = v_email, first_name = v_first, last_name = v_last,
middle_name = coalesce(v_middle, middle_name),
phone = coalesce(v_phone, phone), date_of_birth = coalesce(v_dob, date_of_birth),
gender = coalesce(v_gender, gender), updated_at = now()
WHERE id = v_user_id
AND (email IS DISTINCT FROM v_email OR first_name IS DISTINCT FROM v_first OR last_name IS DISTINCT FROM v_last
OR middle_name IS DISTINCT FROM coalesce(v_middle, middle_name)
OR phone IS DISTINCT FROM coalesce(v_phone, phone)
OR date_of_birth IS DISTINCT FROM coalesce(v_dob, date_of_birth)
OR gender IS DISTINCT FROM coalesce(v_gender, gender));
SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_user_id;
v_updated := v_updated + 1;
END IF;
v_logins := v_logins || jsonb_build_object('row', v_number, 'login', v_public_id);
IF p_kind = 'students' THEN
IF v_person_id IS NULL THEN
SELECT st.id INTO v_person_id FROM public.students st WHERE st.user_id = v_user_id;
END IF;
IF v_person_id IS NULL THEN
INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, phone, admission_date)
VALUES (v_school, v_user_id, v_first, v_last, v_middle, v_gender, v_dob, v_phone, current_date)
RETURNING id INTO v_person_id;
ELSE
UPDATE public.students SET
user_id = coalesce(user_id, v_user_id), first_name = v_first, last_name = v_last,
middle_name = coalesce(v_middle, middle_name),
gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
phone = coalesce(v_phone, phone),
status = CASE WHEN status IN ('inactive', 'transferred') THEN 'active' ELSE status END,
updated_at = now()
WHERE id = v_person_id;
UPDATE public.users SET status = 'active', is_active = true, updated_at = now()
WHERE id = v_user_id AND status = 'inactive'
AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_person_id AND s.status = 'active');
END IF;
UPDATE public.enrollments SET status = 'transferred', left_on = greatest(current_date, enrolled_on), updated_at = now()
WHERE student_id = v_person_id AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
GET DIAGNOSTICS v_moved = ROW_COUNT;
IF NOT EXISTS (
SELECT 1 FROM public.enrollments e
WHERE e.student_id = v_person_id AND e.academic_year_id = v_year AND e.status = 'active'
) THEN
INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
VALUES (v_school, v_person_id, v_class_id, v_year,
CASE WHEN v_moved > 0 THEN current_date
ELSE least(current_date, coalesce(v_year_start, current_date)) END);
END IF;
FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
CONTINUE WHEN nullif(btrim(coalesce(v_row ->> (v_prefix || '_name'), '')), '') IS NULL
OR app.phone_key(v_row ->> (v_prefix || '_phone')) IS NULL;
v_parent := app.attach_parent(
v_school, v_person_id, v_prefix,
v_row ->> (v_prefix || '_name'), v_row ->> (v_prefix || '_phone'),
v_row ->> (v_prefix || '_workplace'), v_row ->> (v_prefix || '_email'));
v_parents := v_parents || jsonb_build_object(
'row', v_number, 'relation', v_prefix, 'login', v_parent ->> 'login', 'password', v_parent ->> 'password');
END LOOP;
ELSE
v_staff_type := app.parse_staff_type(v_position);
IF v_person_id IS NULL THEN
SELECT s.id INTO v_person_id FROM public.staff s
WHERE s.school_id = v_school AND (s.user_id = v_user_id OR s.employee_number = v_employee)
ORDER BY (s.user_id = v_user_id) DESC LIMIT 1;
END IF;
IF v_person_id IS NULL THEN
INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender,
date_of_birth, staff_type, phone, email, hire_date, subjects_note)
VALUES (v_school, v_user_id, v_employee, v_first, v_last, v_middle, v_gender, v_dob, v_staff_type, v_phone,
CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, current_date, v_subjects)
RETURNING id INTO v_person_id;
ELSE
UPDATE public.staff SET
user_id = coalesce(user_id, v_user_id), employee_number = v_employee,
first_name = v_first, last_name = v_last, middle_name = coalesce(v_middle, middle_name),
gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
staff_type = CASE WHEN v_position IS NULL THEN staff_type ELSE v_staff_type END,
phone = coalesce(v_phone, phone),
email = coalesce(CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, email),
subjects_note = coalesce(v_subjects, subjects_note),
status = CASE WHEN status = 'archived' THEN 'active' ELSE status END,
updated_at = now()
WHERE id = v_person_id;
SELECT s.staff_type INTO v_staff_type FROM public.staff s WHERE s.id = v_person_id;
END IF;
v_homeroom := app.normalize_class_name(v_row ->> 'homeroom_class');
IF v_homeroom IS NOT NULL THEN
UPDATE public.classes SET homeroom_staff_id = NULL, updated_at = now()
WHERE school_id = v_school AND academic_year_id = v_year AND homeroom_staff_id = v_person_id
AND app.class_name_key(name) <> app.class_name_key(v_homeroom);
UPDATE public.classes SET homeroom_staff_id = v_person_id, updated_at = now()
WHERE school_id = v_school AND academic_year_id = v_year AND is_active
AND app.class_name_key(name) = app.class_name_key(v_homeroom)
AND homeroom_staff_id IS DISTINCT FROM v_person_id;
END IF;
END IF;
SELECT r.id INTO v_role_id FROM public.roles r
WHERE r.school_id = v_school AND r.is_active
AND r.slug = CASE
WHEN p_kind = 'students' THEN 'student'
WHEN v_staff_type = 'director' THEN 'director'
WHEN v_staff_type = 'vice_principal' THEN 'vice_principal'
WHEN v_staff_type = 'librarian' THEN 'librarian'
ELSE 'teacher'
END;
IF v_role_id IS NOT NULL THEN
INSERT INTO public.user_roles (user_id, role_id, school_id)
VALUES (v_user_id, v_role_id, v_school)
ON CONFLICT DO NOTHING;
END IF;
END LOOP;
PERFORM app.write_audit(v_school, 'import', p_kind, NULL, NULL, NULL,
jsonb_build_object('created', v_created, 'updated', v_updated, 'rows', v_total));
IF jsonb_array_length(v_credentials) > 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_parents) p WHERE p ->> 'password' IS NOT NULL) THEN
PERFORM app.write_audit(v_school, 'issue_credentials', p_kind, NULL, NULL, NULL,
jsonb_build_object('count', jsonb_array_length(v_credentials),
'parents', (SELECT count(*) FROM jsonb_array_elements(v_parents) p WHERE p ->> 'password' IS NOT NULL)));
END IF;
RETURN jsonb_build_object(
'valid', true, 'total', v_total, 'errors', '[]'::jsonb,
'created', v_created, 'updated', v_updated, 'credentials', v_credentials,
'parents', v_parents, 'logins', v_logins,
'newClasses', to_jsonb(v_new_classes)
);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_account(p_user_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_school uuid := app.current_school_id();
v_actor uuid := (SELECT auth.uid());
v_year uuid;
v_year_start date;
v_kind text := coalesce(p_data ->> 'kind', '');
v_new boolean := p_user_id IS NULL;
v_user uuid := p_user_id;
v_existing public.users%ROWTYPE;
v_old_kind text;
v_errors jsonb := '[]'::jsonb;
v_last text := nullif(btrim(coalesce(p_data ->> 'last_name', '')), '');
v_first text := nullif(btrim(coalesce(p_data ->> 'first_name', '')), '');
v_middle text := nullif(btrim(coalesce(p_data ->> 'middle_name', '')), '');
v_nick text := nullif(btrim(coalesce(p_data ->> 'nickname', '')), '');
v_email text := nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), '');
v_phone text := nullif(btrim(coalesce(p_data ->> 'phone', '')), '');
v_dob date;
v_gender text := nullif(app.parse_gender(p_data ->> 'gender'), 'invalid');
v_st jsonb := coalesce(p_data -> 'student', '{}'::jsonb);
v_sf jsonb := coalesce(p_data -> 'staff', '{}'::jsonb);
v_pa jsonb := coalesce(p_data -> 'parent', '{}'::jsonb);
v_full boolean;
v_homeroom uuid[];
v_class_id uuid;
v_class public.classes%ROWTYPE;
v_homeroom_class uuid;
v_role_id uuid;
v_role_slug text;
v_placeholder boolean := false;
v_password text;
v_login text;
v_student uuid;
v_staff uuid;
v_guardian uuid;
v_moved int;
v_employee text;
v_guardians_count int := 0;
v_item jsonb;
v_gid uuid;
v_rel text;
v_keep uuid[] := ARRAY[]::uuid[];
v_child uuid;
v_position text;
v_positions text[];
BEGIN
IF v_school IS NULL OR v_actor IS NULL THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF v_kind NOT IN ('student', 'teacher', 'director', 'vice_principal', 'librarian', 'staff', 'parent', 'admin') THEN
RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
END IF;
v_year := app.ensure_school_basics(v_school);
SELECT y.start_date INTO v_year_start FROM public.academic_years y WHERE y.id = v_year;
v_full := app.can(v_school, 'users.update');
v_homeroom := app.my_homeroom_class_ids();
IF NOT v_new THEN
SELECT * INTO v_existing FROM public.users u WHERE u.id = v_user AND u.school_id = v_school;
IF NOT FOUND OR NOT app.may_manage_account(v_user) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
v_old_kind := app.account_category(v_user);
IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user)
AND (v_old_kind IN ('student', 'parent') OR v_kind IN ('student', 'parent'))
AND v_old_kind <> v_kind THEN
v_errors := v_errors || jsonb_build_object('field', 'kind', 'code', 'kind_locked');
END IF;
END IF;
IF v_kind = 'parent' AND v_new THEN
RAISE EXCEPTION 'parents_from_register' USING ERRCODE = '22023';
END IF;
IF v_kind = 'admin' OR (NOT v_new AND v_old_kind = 'admin') THEN
IF NOT app.i_am_admin() THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
ELSIF v_kind = 'student' THEN
IF NOT (v_full OR app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
OR cardinality(v_homeroom) > 0) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
ELSIF v_kind = 'parent' THEN
IF NOT (v_full OR app.can(v_school, 'guardians.manage') OR cardinality(v_homeroom) > 0) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
ELSE
IF NOT (v_full AND app.can(v_school, CASE WHEN v_new THEN 'staff.create' ELSE 'staff.update' END)) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
END IF;
v_role_slug := CASE v_kind WHEN 'staff' THEN 'staff' ELSE v_kind END;
SELECT r.id INTO v_role_id FROM public.roles r
WHERE r.school_id = v_school AND r.is_active
AND r.slug = v_role_slug
ORDER BY r.level LIMIT 1;
IF v_role_id IS NULL AND v_kind = 'admin' THEN
SELECT r.id INTO v_role_id FROM public.roles r WHERE r.school_id = v_school AND r.is_active AND r.level <= 1 ORDER BY r.level LIMIT 1;
END IF;
IF v_role_id IS NULL THEN
RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
END IF;
IF v_kind NOT IN ('student', 'parent') AND NOT app.can_grant_role(v_role_id) AND NOT app.i_am_admin() THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'required'); END IF;
IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'first_name', 'code', 'required'); END IF;
IF char_length(coalesce(v_last, '')) > 100 OR char_length(coalesce(v_first, '')) > 100 OR char_length(coalesce(v_middle, '')) > 100 THEN
v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'too_long');
END IF;
IF app.parse_gender(p_data ->> 'gender') = 'invalid' THEN
v_errors := v_errors || jsonb_build_object('field', 'gender', 'code', 'invalid_enum');
END IF;
IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$') THEN
v_errors := v_errors || jsonb_build_object('field', 'phone', 'code', 'invalid_phone');
END IF;
BEGIN
v_dob := app.try_date(nullif(btrim(coalesce(p_data ->> 'date_of_birth', '')), ''));
EXCEPTION WHEN OTHERS THEN
v_dob := NULL;
v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'invalid_date');
END;
IF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '100 years') THEN
v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'out_of_range');
END IF;
IF v_nick IS NOT NULL THEN
IF v_nick !~ '^[A-Za-z0-9._]{3,30}$' THEN
v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'invalid_nickname');
ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.school_id = v_school AND lower(u.nickname) = lower(v_nick) AND u.id IS DISTINCT FROM v_user) THEN
v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'duplicate_existing');
END IF;
END IF;
IF v_kind = 'student' THEN
v_class_id := app.try_uuid(v_st ->> 'class_id');
IF v_class_id IS NULL THEN
v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'required');
ELSE
SELECT * INTO v_class FROM public.classes c WHERE c.id = v_class_id AND c.school_id = v_school AND c.academic_year_id = v_year;
IF NOT FOUND THEN
v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'unknown_class');
ELSIF NOT v_full AND NOT app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
AND NOT (v_class_id = ANY (v_homeroom)) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
END IF;
IF v_dob IS NULL AND v_new THEN
v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'required');
END IF;
SELECT count(*) INTO v_guardians_count FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) x
WHERE app.try_uuid(x ->> 'id') IS NOT NULL
OR (nullif(btrim(coalesce(x ->> 'first_name', '')), '') IS NOT NULL AND app.phone_key(x ->> 'phone') IS NOT NULL);
IF NOT (v_st ? 'guardians') AND NOT v_new THEN
SELECT count(*) INTO v_guardians_count FROM public.student_guardians sg
JOIN public.students s ON s.id = sg.student_id WHERE s.user_id = v_user;
END IF;
FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) LOOP
IF app.try_uuid(v_item ->> 'id') IS NULL THEN
IF nullif(btrim(coalesce(v_item ->> 'first_name', '')), '') IS NULL OR nullif(btrim(coalesce(v_item ->> 'last_name', '')), '') IS NULL THEN
v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_name');
END IF;
IF app.phone_key(v_item ->> 'phone') IS NULL OR (v_item ->> 'phone') !~ '^[+0-9 ()-]{5,30}$' THEN
v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_phone');
END IF;
ELSIF NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = app.try_uuid(v_item ->> 'id') AND g.school_id = v_school) THEN
v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'unknown_guardian');
END IF;
END LOOP;
SELECT array_agg(DISTINCT p) INTO v_positions
FROM jsonb_array_elements_text(coalesce(v_st -> 'positions', '[]'::jsonb)) p;
IF EXISTS (SELECT 1 FROM unnest(coalesce(v_positions, ARRAY[]::text[])) p
WHERE p NOT IN ('monitor', 'assistant_monitor', 'cleanliness', 'studies', 'culture', 'sports', 'health', 'press')) THEN
v_errors := v_errors || jsonb_build_object('field', 'positions', 'code', 'invalid_enum');
END IF;
ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
v_employee := nullif(btrim(coalesce(v_sf ->> 'employee_number', '')), '');
IF v_employee IS NOT NULL THEN
IF v_employee !~ '^[A-Za-z0-9-]{1,32}$' THEN
v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'invalid_number');
ELSIF EXISTS (SELECT 1 FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee
AND s.user_id IS DISTINCT FROM v_user) THEN
v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'duplicate_existing');
END IF;
END IF;
v_homeroom_class := app.try_uuid(v_sf ->> 'homeroom_class_id');
IF v_homeroom_class IS NOT NULL AND NOT EXISTS (
SELECT 1 FROM public.classes c WHERE c.id = v_homeroom_class AND c.school_id = v_school AND c.academic_year_id = v_year
) THEN
v_errors := v_errors || jsonb_build_object('field', 'homeroom_class_id', 'code', 'unknown_class');
END IF;
ELSIF v_kind = 'parent' THEN
FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
v_child := app.try_uuid(v_item #>> '{}');
IF v_child IS NULL OR NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_child AND s.school_id = v_school) THEN
v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'unknown_student');
ELSIF NOT app.may_manage_student(v_child) AND NOT app.can(v_school, 'guardians.manage') THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
END LOOP;
IF jsonb_array_length(coalesce(v_pa -> 'children', '[]'::jsonb)) = 0 THEN
v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'required');
END IF;
END IF;
IF v_email IS NOT NULL THEN
IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' OR v_email LIKE '%.invalid' THEN
v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'invalid_email');
ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.email = v_email AND u.id IS DISTINCT FROM v_user)
OR EXISTS (SELECT 1 FROM auth.users au WHERE au.email = v_email AND au.id IS DISTINCT FROM v_user) THEN
v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'duplicate_existing');
END IF;
ELSIF v_new OR coalesce(v_existing.email, '') NOT LIKE '%.invalid' THEN
v_placeholder := v_new OR v_existing.email IS NULL;
END IF;
IF jsonb_array_length(v_errors) > 0 THEN
RETURN jsonb_build_object('valid', false, 'errors', v_errors);
END IF;
IF v_new THEN
IF v_placeholder OR v_email IS NULL THEN
v_email := CASE v_kind WHEN 'parent' THEN 'p' WHEN 'student' THEN 's' ELSE 't' END || app.random_password(12)
|| '@' || CASE v_kind WHEN 'parent' THEN 'parents' WHEN 'student' THEN 'pupils' ELSE 'staff' END || '.invalid';
v_placeholder := true;
END IF;
v_password := app.random_password();
v_user := app.create_login(v_email, v_password);
IF v_placeholder THEN
UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
END IF;
INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
nickname, status, is_active, credentials_issued_at)
VALUES (v_user, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, v_nick, 'active', true, now());
ELSE
IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_existing.email THEN
UPDATE auth.users SET email = v_email, email_confirmed_at = NULL, updated_at = now() WHERE id = v_user;
UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
WHERE user_id = v_user AND provider = 'email';
ELSE
v_email := v_existing.email;
END IF;
UPDATE public.users SET
email = v_email, first_name = v_first, last_name = v_last, middle_name = v_middle, phone = v_phone,
date_of_birth = coalesce(v_dob, date_of_birth), gender = v_gender, nickname = v_nick, updated_at = now()
WHERE id = v_user;
END IF;
SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;
IF NOT v_new AND v_old_kind <> v_kind THEN
DELETE FROM public.user_roles ur USING public.roles r
WHERE ur.user_id = v_user AND ur.role_id = r.id AND ur.school_id = v_school
AND (r.level <= 1 OR r.slug IN ('director', 'vice_principal', 'teacher', 'librarian', 'staff'))
AND r.id <> v_role_id;
END IF;
INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
VALUES (v_user, v_role_id, v_school, v_actor)
ON CONFLICT DO NOTHING;
IF v_kind = 'student' THEN
SELECT s.id INTO v_student FROM public.students s WHERE s.user_id = v_user;
IF v_student IS NULL THEN
INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, phone,
admission_date, student_number, address, created_by)
VALUES (v_school, v_user, v_first, v_last, v_middle, v_gender, v_dob, v_phone, current_date,
nullif(btrim(coalesce(v_st ->> 'student_number', '')), ''), nullif(btrim(coalesce(v_st ->> 'address', '')), ''), v_actor)
RETURNING id INTO v_student;
ELSE
UPDATE public.students SET
first_name = v_first, last_name = v_last, middle_name = v_middle, gender = v_gender,
date_of_birth = coalesce(v_dob, date_of_birth), phone = v_phone,
student_number = CASE WHEN v_st ? 'student_number' THEN nullif(btrim(coalesce(v_st ->> 'student_number', '')), '') ELSE student_number END,
address = CASE WHEN v_st ? 'address' THEN nullif(btrim(coalesce(v_st ->> 'address', '')), '') ELSE address END,
updated_at = now()
WHERE id = v_student;
END IF;
UPDATE public.enrollments SET status = 'transferred', left_on = current_date, updated_at = now()
WHERE student_id = v_student AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
GET DIAGNOSTICS v_moved = ROW_COUNT;
IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = v_student AND e.academic_year_id = v_year AND e.status = 'active') THEN
INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on, created_by)
VALUES (v_school, v_student, v_class_id, v_year,
CASE WHEN v_moved > 0 OR NOT v_new THEN current_date ELSE least(current_date, coalesce(v_year_start, current_date)) END,
v_actor);
END IF;
IF v_st ? 'positions' OR v_moved > 0 THEN
DELETE FROM public.class_positions cp
WHERE cp.student_id = v_student
AND (cp.class_id <> v_class_id OR NOT (cp.position = ANY (coalesce(v_positions, ARRAY[]::text[]))));
FOREACH v_position IN ARRAY coalesce(v_positions, ARRAY[]::text[]) LOOP
IF v_position IN ('monitor', 'assistant_monitor') THEN
DELETE FROM public.class_positions cp WHERE cp.class_id = v_class_id AND cp.position = v_position AND cp.student_id <> v_student;
END IF;
INSERT INTO public.class_positions (school_id, class_id, student_id, position, created_by)
VALUES (v_school, v_class_id, v_student, v_position, v_actor)
ON CONFLICT (class_id, student_id, position) DO NOTHING;
END LOOP;
END IF;
ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
SELECT s.id INTO v_staff FROM public.staff s WHERE s.user_id = v_user;
IF v_employee IS NULL THEN
SELECT s.employee_number INTO v_employee FROM public.staff s WHERE s.id = v_staff;
END IF;
IF v_employee IS NULL THEN
SELECT (coalesce(max(nullif(regexp_replace(s.employee_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text
INTO v_employee FROM public.staff s WHERE s.school_id = v_school AND s.employee_number ~ '^\d{1,12}$';
END IF;
IF v_staff IS NULL THEN
INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender, date_of_birth,
staff_type, position, qualification, hire_date, phone, email, created_by, subjects_note)
VALUES (v_school, v_user, v_employee, v_first, v_last, v_middle, v_gender, v_dob,
CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
nullif(btrim(coalesce(v_sf ->> 'position', '')), ''), nullif(btrim(coalesce(v_sf ->> 'qualification', '')), ''),
coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), current_date),
v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, v_actor,
nullif(left(btrim(coalesce(v_sf ->> 'subjects_note', '')), 500), ''))
RETURNING id INTO v_staff;
ELSE
UPDATE public.staff SET
employee_number = v_employee, first_name = v_first, last_name = v_last, middle_name = v_middle,
gender = v_gender, date_of_birth = coalesce(v_dob, date_of_birth),
staff_type = CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
position = CASE WHEN v_sf ? 'position' THEN nullif(btrim(coalesce(v_sf ->> 'position', '')), '') ELSE position END,
qualification = CASE WHEN v_sf ? 'qualification' THEN nullif(btrim(coalesce(v_sf ->> 'qualification', '')), '') ELSE qualification END,
subjects_note = CASE WHEN v_sf ? 'subjects_note' THEN nullif(left(btrim(coalesce(v_sf ->> 'subjects_note', '')), 500), '') ELSE subjects_note END,
hire_date = coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), hire_date),
phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END,
status = CASE WHEN status = 'archived' THEN 'active' ELSE status END,
updated_at = now()
WHERE id = v_staff;
END IF;
IF v_sf ? 'homeroom_class_id' THEN
UPDATE public.classes SET homeroom_staff_id = NULL, updated_at = now()
WHERE homeroom_staff_id = v_staff AND academic_year_id = v_year AND id IS DISTINCT FROM v_homeroom_class;
IF v_homeroom_class IS NOT NULL THEN
UPDATE public.classes SET homeroom_staff_id = v_staff, updated_at = now() WHERE id = v_homeroom_class;
END IF;
END IF;
ELSIF v_kind = 'parent' THEN
SELECT g.id INTO v_guardian FROM public.guardians g WHERE g.user_id = v_user;
IF v_guardian IS NULL THEN
SELECT g.id INTO v_guardian FROM public.guardians g
WHERE g.school_id = v_school AND g.user_id IS NULL AND app.phone_key(g.phone) = app.phone_key(v_phone)
AND lower(g.first_name) = lower(v_first)
LIMIT 1;
END IF;
IF v_guardian IS NULL THEN
INSERT INTO public.guardians (school_id, user_id, first_name, last_name, middle_name, phone, email)
VALUES (v_school, v_user, v_first, v_last, v_middle, v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END)
RETURNING id INTO v_guardian;
ELSE
UPDATE public.guardians SET user_id = v_user, first_name = v_first, last_name = v_last, middle_name = v_middle,
phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, updated_at = now()
WHERE id = v_guardian;
END IF;
v_rel := CASE WHEN (v_pa ->> 'relationship') IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')
THEN v_pa ->> 'relationship' ELSE 'guardian' END;
FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
v_child := app.try_uuid(v_item #>> '{}');
v_keep := v_keep || v_child;
INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
VALUES (v_child, v_guardian, v_school, v_rel,
NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = v_child AND x.is_primary))
ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship;
END LOOP;
IF app.can(v_school, 'guardians.manage') OR v_full THEN
DELETE FROM public.student_guardians sg WHERE sg.guardian_id = v_guardian AND NOT (sg.student_id = ANY (v_keep));
END IF;
END IF;
PERFORM app.write_audit(v_school, CASE WHEN v_new THEN 'create_account' ELSE 'update_account' END, 'user', v_user,
NULL, NULL, jsonb_build_object('kind', v_kind));
IF v_password IS NOT NULL THEN
PERFORM app.write_audit(v_school, 'issue_credentials', 'user', v_user, NULL, NULL, jsonb_build_object('count', 1));
END IF;
RETURN jsonb_build_object(
'valid', true,
'errors', '[]'::jsonb,
'userId', v_user,
'login', v_login,
'password', v_password,
'created', v_new
);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_account(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account(uuid, jsonb) TO authenticated;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180092', '00092_email_optional_for_everyone') ON CONFLICT (version) DO NOTHING;
DO $$
DECLARE
p record;
v_qual text;
v_check text;
v_can constant text := 'app\.can\(school_id, (''[^'']+''::text)\)';
v_can_as constant text :=
'coalesce((((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_own_permission(\1) AS has_own_permission)) '
|| 'OR (( SELECT app.has_admin_scope() AS has_admin_scope) AND app.scope_permission(school_id, \1))), false)';
v_read constant text := 'app\.can_read_school\(school_id\)';
v_read_as constant text :=
'coalesce(((school_id = ( SELECT app.current_school_id() AS current_school_id)) '
|| 'OR (( SELECT app.has_admin_scope() AS has_admin_scope) AND app.scope_permission(school_id, ''schools.view''::text))), false)';
BEGIN
FOR p IN
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND (qual ~ v_can OR qual ~ v_read OR with_check ~ v_can OR with_check ~ v_read)
LOOP
v_qual := regexp_replace(regexp_replace(p.qual, v_can, v_can_as, 'g'), v_read, v_read_as, 'g');
v_check := regexp_replace(regexp_replace(p.with_check, v_can, v_can_as, 'g'), v_read, v_read_as, 'g');
EXECUTE format(
'ALTER POLICY %I ON %I.%I%s%s',
p.policyname, p.schemaname, p.tablename,
CASE WHEN v_qual IS DISTINCT FROM p.qual THEN ' USING (' || v_qual || ')' ELSE '' END,
CASE WHEN v_check IS DISTINCT FROM p.with_check THEN ' WITH CHECK (' || v_check || ')' ELSE '' END
);
END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION app.my_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT s.id FROM public.staff s
WHERE s.user_id = (SELECT auth.uid()) AND s.status IN ('active', 'on_leave')
AND s.school_id = (SELECT app.current_school_id())
$$;
CREATE OR REPLACE FUNCTION app.my_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::uuid[])
FROM (
SELECT cs.class_id AS c FROM public.class_subjects cs WHERE cs.teacher_id = (SELECT app.my_staff_id()) AND cs.is_active
UNION
SELECT cl.id FROM public.classes cl WHERE cl.homeroom_staff_id = (SELECT app.my_staff_id())
) x
$$;
CREATE OR REPLACE FUNCTION app.my_class_subject_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(cs.id), ARRAY[]::uuid[])
FROM public.class_subjects cs
WHERE cs.teacher_id = (SELECT app.my_staff_id()) AND cs.is_active
$$;
CREATE OR REPLACE FUNCTION app.my_homeroom_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(cl.id), ARRAY[]::uuid[])
FROM public.classes cl WHERE cl.homeroom_staff_id = (SELECT app.my_staff_id())
$$;
CREATE OR REPLACE FUNCTION app.my_child_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(sg.student_id), ARRAY[]::uuid[])
FROM public.guardians g
JOIN public.student_guardians sg ON sg.guardian_id = g.id
WHERE g.user_id = (SELECT auth.uid()) AND g.status = 'active'
AND g.school_id = (SELECT app.current_school_id())
$$;
CREATE OR REPLACE FUNCTION app.my_family_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(DISTINCT e.class_id), ARRAY[]::uuid[])
FROM public.enrollments e
WHERE e.status = 'active'
AND (e.student_id = (SELECT app.my_student_id()) OR e.student_id = ANY ((SELECT app.my_child_ids())::uuid[]))
$$;
CREATE OR REPLACE FUNCTION app.my_conversation_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(cm.conversation_id), ARRAY[]::uuid[])
FROM public.conversation_members cm
JOIN public.conversations c ON c.id = cm.conversation_id AND c.is_active
WHERE cm.user_id = (SELECT auth.uid()) AND c.school_id = (SELECT app.current_school_id())
$$;
CREATE OR REPLACE FUNCTION app.my_taught_student_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT coalesce(array_agg(DISTINCT e.student_id), ARRAY[]::uuid[])
FROM public.enrollments e
WHERE e.class_id = ANY ((SELECT app.my_class_ids())::uuid[]) AND e.status = 'active'
$$;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180093', '00093_policies_ask_once') ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT 'Навсозии база пурра иҷро шуд' AS natija;
