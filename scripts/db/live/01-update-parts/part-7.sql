-- МТМУ: навсозии база, қисми 7 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 7) THEN
RAISE EXCEPTION 'Қисми 7 аллакай иҷро шудааст. Қисми 8-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 6) THEN
RAISE EXCEPTION 'Аввал қисми 6-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
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
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (7);
DROP TABLE supabase_migrations.live_update_2026_10;
COMMIT;
SELECT 'Қисми 7 аз 7 иҷро шуд' AS natija;
