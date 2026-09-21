-- ============================================================================
-- 00033 School-local dates in term and cross-school analytics.
--
-- 00031 fixed write-time attendance validation and 00032 fixed the admin
-- dashboard. This migration closes the remaining report/analytics paths that
-- used the database session's UTC current_date.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.current_term_id(p_school uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id
  FROM public.academic_terms t
  WHERE t.school_id = p_school
    AND t.academic_year_id = app.current_year_id(p_school)
    AND t.kind IN ('quarter', 'semester', 'trimester', 'term')
    AND app.school_today(p_school) BETWEEN t.start_date AND t.end_date
  ORDER BY t.start_date
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.analytics_overview(p_school_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.require(coalesce(p_school_id, app.current_school_id()), 'analytics.view');
  v_today date := app.school_today(v_school);
BEGIN
  RETURN jsonb_build_object(
    'attendance_weekly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('week', w, 'rate', rate, 'records', n) ORDER BY w)
      FROM (
        SELECT date_trunc('week', attendance_date)::date AS w, count(*) AS n,
               round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / nullif(count(*), 0), 1) AS rate
        FROM public.attendance_records
        WHERE school_id = v_school AND attendance_date >= v_today - 84
        GROUP BY 1
      ) x
    ), '[]'::jsonb),
    'enrollment_by_year', coalesce((
      SELECT jsonb_agg(jsonb_build_object('year', y.name, 'students', n) ORDER BY y.start_date)
      FROM (SELECT academic_year_id, count(DISTINCT student_id) n FROM public.enrollments WHERE school_id = v_school GROUP BY 1) e
      JOIN public.academic_years y ON y.id = e.academic_year_id
    ), '[]'::jsonb),
    'grade_distribution', coalesce((
      SELECT jsonb_agg(jsonb_build_object('band', band, 'count', n) ORDER BY band)
      FROM (
        SELECT width_bucket(100.0 * score / max_score, 0, 100.0001, 5) AS band, count(*) n
        FROM public.grades
        WHERE school_id = v_school AND (academic_term_id = app.current_term_id(v_school) OR app.current_term_id(v_school) IS NULL)
        GROUP BY 1
      ) x
    ), '[]'::jsonb),
    'subject_averages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'subject', name_tg, 'subject_ru', name_ru, 'subject_en', name_en,
        'average_percent', avg_pct, 'grades', n) ORDER BY avg_pct)
      FROM (
        SELECT s.name_tg, s.name_ru, s.name_en, count(*) n, round(avg(100.0 * g.score / g.max_score), 1) avg_pct
        FROM public.grades g
        JOIN public.class_subjects cs ON cs.id = g.class_subject_id
        JOIN public.subjects s ON s.id = cs.subject_id
        WHERE g.school_id = v_school AND (g.academic_term_id = app.current_term_id(v_school) OR app.current_term_id(v_school) IS NULL)
        GROUP BY s.name_tg, s.name_ru, s.name_en
      ) x
    ), '[]'::jsonb),
    'registrations_monthly', coalesce((
      SELECT jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m)
      FROM (
        SELECT date_trunc('month', created_at)::date m, count(*) n
        FROM public.registration_requests
        WHERE school_id = v_school AND created_at > (v_today - interval '12 months')
        GROUP BY 1
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.scope_school_overview()
RETURNS TABLE (school_id uuid, short_name varchar, district_id uuid, status varchar, students bigint, staff bigint,
               classes bigint, attendance_rate_30d numeric, pending_registrations bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.has_admin_scope() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.short_name, s.district_id, s.status,
    (SELECT count(*) FROM public.students x WHERE x.school_id = s.id AND x.status = 'active'),
    (SELECT count(*) FROM public.staff x WHERE x.school_id = s.id AND x.status = 'active'),
    (SELECT count(*) FROM public.classes x WHERE x.school_id = s.id AND x.is_active AND x.academic_year_id = app.current_year_id(s.id)),
    (SELECT round(100.0 * count(*) FILTER (WHERE a.status IN ('present', 'late')) / nullif(count(*), 0), 1)
     FROM public.attendance_records a WHERE a.school_id = s.id AND a.attendance_date >= app.school_today(s.id) - 30),
    (SELECT count(*) FROM public.registration_requests r WHERE r.school_id = s.id AND r.status = 'pending')
  FROM public.schools s
  WHERE app.scope_permission(s.id, 'reports.view')
  ORDER BY s.short_name;
END;
$$;
