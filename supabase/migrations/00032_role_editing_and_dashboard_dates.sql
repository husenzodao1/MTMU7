-- ============================================================================
-- 00032 Role permission editing and school-local dashboard dates
--
-- 1. admin_set_role_permissions() refused any save of a role that already
--    held a permission the editor does not hold: keeping it failed the
--    "grant" check and dropping it failed the "revoke" check, so delegated
--    role managers could never edit such roles. The grant check now applies
--    only to permissions that are being added.
-- 2. The admin dashboard counted "attendance today" by UTC date; it now uses
--    the school's calendar date (see 00031).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_role_permissions(p_role_id uuid, p_permission_slugs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.roles%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_role.school_id, 'roles.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role.is_system AND v_role.slug = 'admin' THEN
    RAISE EXCEPTION 'the administrator role always has every school permission' USING ERRCODE = '42501';
  END IF;
  FOREACH v_slug IN ARRAY coalesce(p_permission_slugs, ARRAY[]::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.slug = v_slug AND NOT p.is_platform) THEN
      RAISE EXCEPTION 'unknown permission %', v_slug USING ERRCODE = '22023';
    END IF;
    -- Only newly added permissions require the editor to hold them.
    IF NOT app.can(v_role.school_id, v_slug) AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = p_role_id AND p.slug = v_slug
    ) THEN
      RAISE EXCEPTION 'you cannot grant a permission you do not hold' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  -- Removing permissions you do not hold is an escalation vector for others.
  IF EXISTS (
    SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = p_role_id AND p.slug <> ALL (coalesce(p_permission_slugs, ARRAY[]::text[]))
      AND NOT app.can(v_role.school_id, p.slug)
  ) THEN
    RAISE EXCEPTION 'you cannot revoke a permission you do not hold' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.role_permissions rp
  USING public.permissions p
  WHERE rp.permission_id = p.id AND rp.role_id = p_role_id
    AND p.slug <> ALL (coalesce(p_permission_slugs, ARRAY[]::text[]));
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, p.id FROM public.permissions p WHERE p.slug = ANY (p_permission_slugs)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_role_permissions(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permissions(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard(p_school_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'dashboard.view');
  v_year public.academic_years%ROWTYPE;
  v_today date;
  v_result jsonb;
BEGIN
  IF NOT (app.can(v_school, 'students.view') OR app.can(v_school, 'users.view') OR app.can(v_school, 'reports.view')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_year FROM public.academic_years WHERE school_id = v_school AND is_current;
  v_today := app.school_today(v_school);

  SELECT jsonb_build_object(
    'academic_year', CASE WHEN v_year.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_year.id, 'name', v_year.name,
      'start_date', v_year.start_date, 'end_date', v_year.end_date) END,
    'current_term', (SELECT jsonb_build_object('id', t.id, 'name', t.name, 'end_date', t.end_date, 'is_locked', t.is_locked)
                     FROM public.academic_terms t WHERE t.id = app.current_term_id(v_school)),
    'counts', jsonb_build_object(
      'students_active', (SELECT count(*) FROM public.students WHERE school_id = v_school AND status = 'active'),
      'staff_active', (SELECT count(*) FROM public.staff WHERE school_id = v_school AND status IN ('active', 'on_leave')),
      'teachers_active', (SELECT count(*) FROM public.staff WHERE school_id = v_school AND status = 'active' AND staff_type IN ('teacher', 'director', 'vice_principal')),
      'classes_active', (SELECT count(*) FROM public.classes WHERE school_id = v_school AND is_active AND academic_year_id = v_year.id),
      'guardians', (SELECT count(*) FROM public.guardians WHERE school_id = v_school AND status = 'active'),
      'accounts_active', (SELECT count(*) FROM public.users WHERE school_id = v_school AND status = 'active')
    ),
    'attendance_today', (
      SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE status = 'present'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'excused', count(*) FILTER (WHERE status = 'excused'),
        'students_marked', count(DISTINCT student_id))
      FROM public.attendance_records WHERE school_id = v_school AND attendance_date = v_today
    ),
    'queues', jsonb_build_object(
      'pending_registrations', (SELECT count(*) FROM public.registration_requests WHERE school_id = v_school AND status = 'pending'),
      'news_in_review', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'review'),
      'news_drafts', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'draft'),
      'news_scheduled', (SELECT count(*) FROM public.news_articles WHERE school_id = v_school AND status = 'published' AND publish_at > now()),
      'library_drafts', (SELECT count(*) FROM public.library_items WHERE school_id = v_school AND status = 'draft'),
      'documents_drafts', (SELECT count(*) FROM public.documents WHERE school_id = v_school AND status = 'draft'),
      'open_reports', (SELECT count(*) FROM public.message_reports WHERE school_id = v_school AND status = 'open'),
      'grades_awaiting_approval', (SELECT count(*) FROM public.grades g JOIN public.assessment_types a ON a.id = g.assessment_type_id
                                   WHERE g.school_id = v_school AND a.is_final AND g.status = 'recorded')
    ),
    'upcoming_events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'category', e.category, 'status', e.status) ORDER BY e.starts_at)
      FROM (SELECT * FROM public.events WHERE school_id = v_school AND status = 'published' AND starts_at >= now() ORDER BY starts_at LIMIT 5) e
    ), '[]'::jsonb),
    'recent_announcements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'priority', x.priority, 'publish_at', x.publish_at) ORDER BY x.publish_at DESC)
      FROM (SELECT * FROM public.announcements WHERE school_id = v_school AND status = 'published' ORDER BY publish_at DESC LIMIT 5) x
    ), '[]'::jsonb),
    'recent_activity', CASE WHEN app.can(v_school, 'audit.view') THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'entity_type', l.entity_type, 'created_at', l.created_at,
        'actor', (SELECT jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name) FROM public.users u WHERE u.id = l.user_id))
        ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.audit_logs WHERE school_id = v_school ORDER BY created_at DESC LIMIT 8) l
    ), '[]'::jsonb) ELSE NULL END,
    'alerts', to_jsonb(array_remove(ARRAY[
      CASE WHEN v_year.id IS NULL THEN 'no_current_academic_year' END,
      CASE WHEN v_year.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.academic_terms t WHERE t.academic_year_id = v_year.id) THEN 'no_terms_defined' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.classes c WHERE c.school_id = v_school AND c.is_active AND c.academic_year_id = v_year.id AND c.homeroom_staff_id IS NULL) THEN 'classes_without_homeroom_teacher' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.class_subjects cs JOIN public.classes c ON c.id = cs.class_id
                        WHERE cs.school_id = v_school AND cs.is_active AND cs.teacher_id IS NULL AND c.academic_year_id = v_year.id) THEN 'subjects_without_teacher' END,
      CASE WHEN NOT EXISTS (SELECT 1 FROM public.bell_periods b WHERE b.school_id = v_school) THEN 'no_bell_schedule' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.site_sections s WHERE s.school_id = v_school AND s.is_enabled AND NOT s.is_approved
                        AND s.section_key IN ('identity', 'hero', 'footer')) THEN 'official_content_not_approved' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.students s WHERE s.school_id = v_school AND s.status = 'active'
                        AND NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = s.id AND e.status = 'active')) THEN 'students_without_class' END
    ], NULL))
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(uuid) TO authenticated;
