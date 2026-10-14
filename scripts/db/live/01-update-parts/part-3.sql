-- МТМУ: навсозии база, қисми 3 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 3) THEN
RAISE EXCEPTION 'Қисми 3 аллакай иҷро шудааст. Қисми 4-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 2) THEN
RAISE EXCEPTION 'Аввал қисми 2-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
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
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (3);
COMMIT;
SELECT 'Қисми 3 аз 7 иҷро шуд' AS natija;
