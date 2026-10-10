-- ============================================================================
-- 00079 · The school's faces on the dashboard.
--
-- Across the top of the dashboard two slow ribbons of faces pass by: the
-- pupils studying now, and the school's graduates. Everyone signed in to the
-- school sees them; what is shown is what the messenger already shows anyone
-- in the school — a first name, the initial of the surname, the photograph
-- and the class (or the year of graduation). Hidden and blocked accounts are
-- left out, and nobody outside the school gets anything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.school_faces(p_limit int DEFAULT 24)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT app.current_school_id() AS school_id, least(greatest(coalesce(p_limit, 24), 1), 40) AS n
  ),
  people AS (
    SELECT s.id, s.status, s.first_name, s.last_name, s.status_changed_at,
           u.avatar_url, u.nickname, u.last_login_at, u.graduation_year
    FROM public.students s
    JOIN me ON s.school_id = me.school_id
    LEFT JOIN public.users u ON u.id = s.user_id
    WHERE s.status IN ('active', 'graduated')
      -- A pupil without an account still studies here; an account hidden or
      -- blocked by the school is not shown.
      AND (u.id IS NULL OR (u.hidden_at IS NULL AND u.status IN ('active', 'graduated')))
  ),
  active AS (
    SELECT p.*, (
      SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
      WHERE e.student_id = p.id AND e.status = 'active'
      ORDER BY e.enrolled_on DESC LIMIT 1
    ) AS class_name
    FROM people p
    WHERE p.status = 'active'
    -- Faces first, then whoever was here most recently.
    ORDER BY (p.avatar_url IS NULL), p.last_login_at DESC NULLS LAST, p.last_name, p.first_name
    LIMIT (SELECT n FROM me)
  ),
  graduates AS (
    SELECT p.*, coalesce(p.graduation_year, extract(year FROM p.status_changed_at)::int) AS year
    FROM people p
    WHERE p.status = 'graduated'
    ORDER BY coalesce(p.graduation_year, extract(year FROM p.status_changed_at)::int) DESC NULLS LAST,
             (p.avatar_url IS NULL), p.last_name, p.first_name
    LIMIT (SELECT n FROM me)
  )
  SELECT CASE WHEN (SELECT school_id FROM me) IS NULL THEN NULL ELSE jsonb_build_object(
    'active', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.first_name || ' ' || left(a.last_name, 1) || '.', 'avatar', a.avatar_url,
        'nickname', a.nickname, 'detail', a.class_name)) FROM active a), '[]'::jsonb),
    'graduates', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.first_name || ' ' || left(g.last_name, 1) || '.', 'avatar', g.avatar_url,
        'nickname', g.nickname, 'detail', g.year::text)) FROM graduates g), '[]'::jsonb),
    'counts', jsonb_build_object(
      'active', (SELECT count(*) FROM people WHERE status = 'active'),
      'graduates', (SELECT count(*) FROM people WHERE status = 'graduated'))
  ) END;
$$;
REVOKE EXECUTE ON FUNCTION public.school_faces(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_faces(int) TO authenticated;
