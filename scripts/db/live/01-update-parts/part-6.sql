-- МТМУ: навсозии база, қисми 6 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 6) THEN
RAISE EXCEPTION 'Қисми 6 аллакай иҷро шудааст. Қисми 7-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 5) THEN
RAISE EXCEPTION 'Аввал қисми 5-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
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
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (6);
COMMIT;
SELECT 'Қисми 6 аз 7 иҷро шуд' AS natija;
