-- What one pupil's term looks like, in one call.
--
-- A profile that shows only a name and a photograph is of no use to the person
-- looking at it. A pupil, their guardian, the teachers who take them and the
-- school's administration all need the same two things: how often they were
-- there, and how the marks are going — over a week, a month or a half-year.

-- ----------------------------------------------------------------------------
-- 1. Who may look
-- ----------------------------------------------------------------------------
-- Everything below decides through this, so a statistic can never become a way
-- to learn about a pupil somebody may not see.
CREATE OR REPLACE FUNCTION app.can_view_student(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student
      AND (
        -- the pupil themselves
        s.id = (SELECT app.my_student_id())
        -- a guardian of theirs
        OR s.id = ANY ((SELECT app.my_child_ids())::uuid[])
        -- a teacher who takes them, or their homeroom teacher
        OR s.id = ANY ((SELECT app.my_taught_student_ids())::uuid[])
        -- the school's administration
        OR app.can(s.school_id, 'grades.view')
        OR app.can(s.school_id, 'attendance.view')
      )
  )
$fn$;

-- ----------------------------------------------------------------------------
-- 2. The figures
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_statistics(
  p_student uuid,
  p_from date,
  p_to date,
  p_bucket text DEFAULT 'week'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_bucket text := CASE WHEN p_bucket IN ('day', 'week', 'month') THEN p_bucket ELSE 'week' END;
  v_result jsonb;
BEGIN
  IF NOT app.can_view_student(p_student) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  WITH
  -- Final marks are a verdict on the term, not part of the running average, so
  -- they are excluded here exactly as the gradebook excludes them.
  marks AS (
    SELECT g.score, g.max_score, g.grade_date, g.class_subject_id, at.weight
    FROM public.grades g
    JOIN public.assessment_types at ON at.id = g.assessment_type_id
    WHERE g.student_id = p_student
      AND g.grade_date BETWEEN p_from AND p_to
      AND NOT at.is_final
  ),
  attendance AS (
    SELECT a.status, a.attendance_date
    FROM public.attendance_records a
    WHERE a.student_id = p_student
      AND a.attendance_date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'bucket', v_bucket),

    'attendance', (
      SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE status = 'present'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'excused', count(*) FILTER (WHERE status = 'excused'),
        'recorded', count(*)
      ) FROM attendance
    ),

    -- The days themselves, so a profile can list them rather than only count.
    'days', coalesce((
      SELECT jsonb_agg(jsonb_build_object('date', attendance_date, 'status', status) ORDER BY attendance_date DESC)
      FROM attendance WHERE status <> 'present'
    ), '[]'::jsonb),

    -- The rating: a weighted percentage, and the raw points behind it.
    'overall', (
      SELECT jsonb_build_object(
        'percent', CASE WHEN sum(weight) > 0
                        THEN round((sum((score / max_score) * weight) / sum(weight) * 100)::numeric, 1)
                        END,
        'points', coalesce(round(sum(score)::numeric, 2), 0),
        'maxPoints', coalesce(round(sum(max_score)::numeric, 2), 0),
        'count', count(*)
      ) FROM marks
    ),

    'subjects', coalesce((
      SELECT jsonb_agg(row ORDER BY row ->> 'name')
      FROM (
        SELECT jsonb_build_object(
          'classSubjectId', m.class_subject_id,
          'name', sub.name_tg,
          'nameRu', sub.name_ru,
          'nameEn', sub.name_en,
          'percent', round((sum((m.score / m.max_score) * m.weight) / nullif(sum(m.weight), 0) * 100)::numeric, 1),
          'points', round(sum(m.score)::numeric, 2),
          'count', count(*)
        ) AS row
        FROM marks m
        JOIN public.class_subjects cs ON cs.id = m.class_subject_id
        JOIN public.subjects sub ON sub.id = cs.subject_id
        GROUP BY m.class_subject_id, sub.name_tg, sub.name_ru, sub.name_en
      ) s
    ), '[]'::jsonb),

    -- One point per bucket for the chart.
    'series', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', bucket_start, 'percent', percent) ORDER BY bucket_start)
      FROM (
        SELECT date_trunc(v_bucket, grade_date::timestamp)::date AS bucket_start,
               round((sum((score / max_score) * weight) / nullif(sum(weight), 0) * 100)::numeric, 1) AS percent
        FROM marks
        GROUP BY 1
      ) b
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.student_statistics(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_statistics(uuid, date, date, text) TO authenticated;
