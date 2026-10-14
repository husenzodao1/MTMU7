-- Row level security that asks who you are once per query, not once per row.
--
-- Most read and write policies say app.can(school_id, 'x.y') or
-- app.can_read_school(school_id). Both are SQL functions that look the caller
-- up — their user, school, roles and permissions — and Postgres cannot fold a
-- SECURITY DEFINER function into the query, so it ran them again for every
-- row it looked at: about 1.7 ms a row. Counting a school's timetable took
-- two seconds, a class's journal a quarter of a second for twenty marks, and
-- every list grew slower with the year.
--
-- app.can(s, p) is, by its own definition,
--     (s = app.current_school_id() AND app.has_own_permission(p))
--     OR (app.has_admin_scope() AND app.scope_permission(s, p))
-- and app.can_read_school(s) is
--     s = app.current_school_id()
--     OR (app.has_admin_scope() AND app.scope_permission(s, 'schools.view')).
-- Written out like that inside a policy, every part that does not depend on
-- the row — who the caller is, what they may do in their own school, whether
-- they hold an administrative scope — becomes a sub-select Postgres evaluates
-- once for the whole query; only a caller with an administrative scope still
-- pays for a per-row look-up. Each policy keeps exactly what it allowed: this
-- rewrites the text of the two calls in place and nothing else, and a policy
-- that does not use them is not touched. Run again, it finds nothing to do.

DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
  -- app.can(school_id, 'perm'::text), as Postgres prints it back.
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

-- The helpers the policies lean on had the same habit inside them: "the
-- classes whose teacher is me" compared every class with app.my_staff_id(),
-- looked up again for each class it read (40–60 ms for one teacher). The
-- caller is now looked up once per call, as a sub-select. Same answers.

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
