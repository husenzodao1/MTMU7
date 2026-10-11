-- МТМУ: навсозии база, қисми 5 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 5) THEN
RAISE EXCEPTION 'Қисми 5 аллакай иҷро шудааст. Қисми 6-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 4) THEN
RAISE EXCEPTION 'Аввал қисми 4-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
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
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (5);
COMMIT;
SELECT 'Қисми 5 аз 7 иҷро шуд' AS natija;
