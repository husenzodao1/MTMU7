-- ============================================================================
-- 00083 · The new school year in one step.
--
-- advance_academic_year (00054) already moved every class up a year — 5А
-- becomes 6А, the eleventh form leaves, a new first form waits — but nothing
-- in the office called it, and the year it made was empty: no quarters, no
-- subjects, no teachers. Setting those up again was four term dialogs and a
-- timetable workbook for every class.
--
-- start_new_school_year does the whole first of September at once:
--   * moves the school up a year (advance_academic_year, unchanged);
--   * gives the new year its quarters — last year's, on the same calendar
--     dates a year later, or the four usual quarters when there were none;
--   * gives every new class the subjects and teachers of last year's class of
--     the same name (this 6А gets what last year's 6А had: the subjects of
--     the sixth form, and the teachers who taught them). A class whose name is
--     new gets the subjects of another class of its form, with no teacher.
-- Every part is optional, and running it a second time changes nothing.
--
-- add_standard_terms gives a year that has no terms its quarters the same
-- way, for a year made by hand.
-- ============================================================================

/** Quarters for p_year: p_from's terms a year (or more) later, else the usual four. */
CREATE OR REPLACE FUNCTION app.seed_year_terms(p_year uuid, p_from uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_from public.academic_years%ROWTYPE;
  v_shift int;
  v_y int;
  v_count int := 0;
BEGIN
  SELECT * INTO v_year FROM public.academic_years WHERE id = p_year;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.academic_terms WHERE academic_year_id = p_year) THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_from FROM public.academic_years WHERE id = p_from AND school_id = v_year.school_id;

  IF v_from.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.academic_terms WHERE academic_year_id = v_from.id) THEN
    -- The same terms on the same calendar dates, as many years on as the
    -- years themselves are apart, kept inside the new year.
    v_shift := extract(year FROM v_year.start_date)::int - extract(year FROM v_from.start_date)::int;
    INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, sort_order)
    SELECT v_year.school_id, v_year.id, t.name, t.kind, s.start_date, s.end_date, t.sort_order
    FROM public.academic_terms t
    CROSS JOIN LATERAL (
      SELECT greatest((t.start_date + make_interval(years => v_shift))::date, v_year.start_date) AS start_date,
             least((t.end_date + make_interval(years => v_shift))::date, v_year.end_date) AS end_date
    ) s
    WHERE t.academic_year_id = v_from.id AND s.start_date <= s.end_date
    ORDER BY t.start_date, t.sort_order;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RETURN v_count;
    END IF;
  END IF;

  -- The usual four quarters of a school year that starts in September.
  v_y := extract(year FROM v_year.start_date)::int;
  INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, sort_order)
  SELECT v_year.school_id, v_year.id, q.name, 'quarter',
         greatest(q.start_date, v_year.start_date), least(q.end_date, v_year.end_date), q.sort_order
  FROM (VALUES
    ('Чоряки I',   make_date(v_y, 9, 1),      make_date(v_y, 11, 5),     1),
    ('Чоряки II',  make_date(v_y, 11, 16),    make_date(v_y, 12, 30),    2),
    ('Чоряки III', make_date(v_y + 1, 1, 11), make_date(v_y + 1, 3, 20), 3),
    ('Чоряки IV',  make_date(v_y + 1, 4, 1),  make_date(v_y + 1, 5, 31), 4)
  ) AS q(name, start_date, end_date, sort_order)
  WHERE greatest(q.start_date, v_year.start_date) <= least(q.end_date, v_year.end_date);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.seed_year_terms(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_new_school_year(
  p_name text,
  p_start date,
  p_end date,
  p_terms boolean DEFAULT true,
  p_subjects boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_old uuid;
  v_new uuid;
  v_result jsonb;
  v_terms int := 0;
  v_subjects int := 0;
  v_more int := 0;
BEGIN
  IF v_school IS NULL
     OR NOT app.can(v_school, 'academic_years.manage')
     OR NOT app.can(v_school, 'enrollments.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_old FROM public.academic_years WHERE school_id = v_school AND is_current;
  v_result := public.advance_academic_year(p_name, p_start, p_end);
  v_new := (v_result ->> 'yearId')::uuid;
  IF v_old IS NULL OR v_new = v_old THEN
    RETURN v_result || jsonb_build_object('termsCreated', 0, 'subjectsCopied', 0);
  END IF;

  UPDATE public.academic_years SET status = 'active' WHERE id = v_new AND status <> 'active';

  IF p_terms THEN
    v_terms := app.seed_year_terms(v_new, v_old);
  END IF;

  IF p_subjects THEN
    -- This 6А gets what last year's 6А had; a teacher who has since left is not carried over.
    INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id, weekly_hours)
    SELECT v_school, n.id, cs.subject_id, cs.group_label,
           CASE WHEN st.status = 'active' THEN cs.teacher_id END, cs.weekly_hours
    FROM public.classes n
    JOIN public.classes o
      ON o.school_id = v_school AND o.academic_year_id = v_old
     AND app.normalize_class_name(o.name) = app.normalize_class_name(n.name)
    JOIN public.class_subjects cs ON cs.class_id = o.id AND cs.is_active
    LEFT JOIN public.staff st ON st.id = cs.teacher_id
    WHERE n.school_id = v_school AND n.academic_year_id = v_new
    ON CONFLICT (class_id, subject_id, group_label) DO NOTHING;
    GET DIAGNOSTICS v_subjects = ROW_COUNT;

    -- A class with a name that is new this year: the subjects of its form, teachers to be chosen.
    INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id, weekly_hours)
    SELECT v_school, n.id, cs.subject_id, cs.group_label, NULL, cs.weekly_hours
    FROM public.classes n
    CROSS JOIN LATERAL (
      SELECT o.id FROM public.classes o
      WHERE o.school_id = v_school AND o.academic_year_id = v_old AND o.grade_level = n.grade_level
        AND EXISTS (SELECT 1 FROM public.class_subjects x WHERE x.class_id = o.id AND x.is_active)
      ORDER BY o.name
      LIMIT 1
    ) o
    JOIN public.class_subjects cs ON cs.class_id = o.id AND cs.is_active
    WHERE n.school_id = v_school AND n.academic_year_id = v_new
      AND NOT EXISTS (SELECT 1 FROM public.class_subjects y WHERE y.class_id = n.id)
    ON CONFLICT (class_id, subject_id, group_label) DO NOTHING;
    GET DIAGNOSTICS v_more = ROW_COUNT;
    v_subjects := v_subjects + v_more;
  END IF;

  PERFORM app.write_audit(v_school, 'start_new_year', 'academic_years', v_new, NULL, NULL,
    jsonb_build_object('termsCreated', v_terms, 'subjectsCopied', v_subjects));

  RETURN v_result || jsonb_build_object('termsCreated', v_terms, 'subjectsCopied', v_subjects);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.start_new_school_year(text, date, date, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_new_school_year(text, date, date, boolean, boolean) TO authenticated;

/** The quarters for a year that has none: last year's dates a year on, or the usual four. */
CREATE OR REPLACE FUNCTION public.add_standard_terms(p_year_id uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_from uuid;
BEGIN
  SELECT * INTO v_year FROM public.academic_years WHERE id = p_year_id;
  IF NOT FOUND OR NOT app.can(v_year.school_id, 'academic_years.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- The latest earlier year that has terms to copy.
  SELECT y.id INTO v_from FROM public.academic_years y
  WHERE y.school_id = v_year.school_id AND y.start_date < v_year.start_date
    AND EXISTS (SELECT 1 FROM public.academic_terms t WHERE t.academic_year_id = y.id)
  ORDER BY y.start_date DESC
  LIMIT 1;
  RETURN app.seed_year_terms(v_year.id, v_from);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_standard_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_standard_terms(uuid) TO authenticated;
