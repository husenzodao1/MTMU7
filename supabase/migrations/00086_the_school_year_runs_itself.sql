-- ============================================================================
-- 00086 · The school year runs itself.
--
-- The office no longer keeps a calendar. Everything that used to be typed in
-- once a year is now known from the date:
--
--   * The academic year. A year that starts in September 2026 is 2026-2027,
--     and the next one is 2027-2028. The year turns over on the first of
--     August, so the lists the office prepares in August already land in the
--     new year. A year runs from 1 August to 31 July, which leaves no day
--     without a year to file a lesson under.
--   * Terms. A Tajik school has no fixed quarter dates: the quarter, the half
--     year and the year are marks a teacher writes in the last columns of the
--     register on the day they are given. So a year has one term, the whole
--     year, and the journal's quarter columns are dated the day they are
--     written (rule_journal_column below).
--   * Classes. Every form from 1 to 11 has the letters А, Б, В, Г, Ғ and Д
--     waiting. A class with no pupils is simply not shown, so 11Д costs
--     nothing until the year it is needed.
--   * Bells. Two shifts of five forty-five-minute lessons, the same for every
--     school, written here and not edited anywhere.
--
-- On the first of August the school moves up a year by itself: 5А becomes
-- 6А with its pupils and its class teacher, the eleventh form leaves, each
-- class keeps its subjects and teachers. It is written to the audit log like
-- any other change, and it happens once: the second run finds nothing to do.
--
-- app.ensure_school_basics never moves anybody: it only makes sure the
-- current year has its term, its classes and the bells. The imports and the
-- account form call it, so a school is never missing a class it is about to
-- fill. app.ensure_school_year also turns the year over when the date says
-- so; pg_cron runs it every night, and the office pages call it on their way
-- in, so a school on a database without pg_cron still turns over.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Which year a day belongs to
-- ----------------------------------------------------------------------------

/** The academic year a calendar day belongs to: 2026-08-01 … 2027-07-31 is 2026-2027. */
CREATE OR REPLACE FUNCTION app.school_year_span(p_day date)
RETURNS TABLE (name text, start_date date, end_date date)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT y::text || '-' || (y + 1)::text, make_date(y, 8, 1), make_date(y + 1, 7, 31)
  FROM (SELECT extract(year FROM p_day)::int - CASE WHEN extract(month FROM p_day) < 8 THEN 1 ELSE 0 END AS y) AS s
$$;
GRANT EXECUTE ON FUNCTION app.school_year_span(date) TO authenticated;

/** A year's name compared the way people write it: 2026-2027, 2026 – 2027, 2026—2027. */
CREATE OR REPLACE FUNCTION app.year_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(coalesce(p_name, ''), '[[:space:]–—-]+', '-', 'g')
$$;

-- ----------------------------------------------------------------------------
-- 2. The bells
-- ----------------------------------------------------------------------------

/** The school's two shifts, as the school rings them. */
CREATE OR REPLACE FUNCTION app.standard_bells()
RETURNS TABLE (shift smallint, period_number smallint, start_time time, end_time time)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT b.shift::smallint, b.period_number::smallint, b.start_time::time, b.end_time::time
  FROM (VALUES
    (1, 1, '08:05', '08:45'),
    (1, 2, '08:50', '09:35'),
    (1, 3, '09:40', '10:25'),
    (1, 4, '10:35', '11:20'),
    (1, 5, '11:25', '12:10'),
    (2, 1, '13:00', '13:45'),
    (2, 2, '13:50', '14:35'),
    (2, 3, '14:40', '15:25'),
    (2, 4, '15:35', '16:20'),
    (2, 5, '16:25', '17:10')
  ) AS b(shift, period_number, start_time, end_time)
$$;
GRANT EXECUTE ON FUNCTION app.standard_bells() TO authenticated;

/** Writes the standard bells for a school and removes any others. */
CREATE OR REPLACE FUNCTION app.ensure_standard_bells(p_school uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.bell_periods bp
  WHERE bp.school_id = p_school
    AND NOT EXISTS (
      SELECT 1 FROM app.standard_bells() s
      WHERE s.shift = bp.shift AND s.period_number = bp.period_number
        AND s.start_time = bp.start_time AND s.end_time = bp.end_time
    );
  INSERT INTO public.bell_periods (school_id, shift, period_number, start_time, end_time)
  SELECT p_school, s.shift, s.period_number, s.start_time, s.end_time
  FROM app.standard_bells() s
  ON CONFLICT (school_id, shift, period_number) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_standard_bells(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The classes
-- ----------------------------------------------------------------------------

/** The letters every form has, in the order they are read out. */
CREATE OR REPLACE FUNCTION app.standard_class_letters()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['А', 'Б', 'В', 'Г', 'Ғ', 'Д']
$$;
GRANT EXECUTE ON FUNCTION app.standard_class_letters() TO authenticated;

/** 1А … 11Д for one year, each made only if the year does not have it. */
CREATE OR REPLACE FUNCTION app.ensure_standard_classes(p_school uuid, p_year uuid)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_year IS NULL THEN
    RETURN 0;
  END IF;

  -- A class whose name says one form and whose record another (a "10А" filed
  -- as form 1) is corrected from the name, which is what everybody reads.
  UPDATE public.classes c
  SET grade_level = (regexp_match(app.normalize_class_name(c.name), '^(\d{1,2})'))[1]::int, updated_at = now()
  WHERE c.school_id = p_school AND c.academic_year_id = p_year
    AND app.normalize_class_name(c.name) ~ '^(1[01]|[1-9])\D*$'
    AND c.grade_level IS DISTINCT FROM (regexp_match(app.normalize_class_name(c.name), '^(\d{1,2})'))[1]::int;

  INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
  SELECT p_school, p_year, g::text || l, g
  FROM generate_series(1, 11) AS g
  CROSS JOIN unnest(app.standard_class_letters()) AS l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.school_id = p_school AND c.academic_year_id = p_year AND c.is_active
      AND app.class_name_key(c.name) = app.class_name_key(g::text || l)
  )
  ORDER BY g, array_position(app.standard_class_letters(), l);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_standard_classes(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. One term: the whole year
-- ----------------------------------------------------------------------------

/**
 * The one term of a year that has none: the whole year. With p_stretch the
 * year is first widened to its whole span (1 August to 31 July), so no day
 * of it is left without a term to file a lesson under. A year whose quarters
 * were set up by hand keeps them: nothing written under them is touched.
 */
CREATE OR REPLACE FUNCTION app.ensure_year_term(p_year uuid, p_stretch boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_span record;
  v_term uuid;
BEGIN
  SELECT * INTO v_year FROM public.academic_years WHERE id = p_year;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_span FROM app.school_year_span(v_year.start_date);

  IF p_stretch AND (v_year.start_date > v_span.start_date OR v_year.end_date < v_span.end_date) THEN
    -- Only ever wider, so every term already inside the year stays inside it.
    UPDATE public.academic_years
    SET start_date = least(start_date, v_span.start_date), end_date = greatest(end_date, v_span.end_date), updated_at = now()
    WHERE id = p_year
    RETURNING * INTO v_year;
  END IF;

  SELECT t.id INTO v_term FROM public.academic_terms t
  WHERE t.academic_year_id = p_year
  ORDER BY (t.start_date = v_year.start_date AND t.end_date = v_year.end_date) DESC, t.start_date
  LIMIT 1;
  IF v_term IS NULL THEN
    INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, sort_order)
    VALUES (v_year.school_id, p_year, 'Соли таҳсил ' || v_year.name, 'term', v_year.start_date, v_year.end_date, 0)
    RETURNING id INTO v_term;
  ELSIF p_stretch THEN
    -- The automatic whole-year term follows the year it covers.
    UPDATE public.academic_terms t
    SET start_date = v_year.start_date, end_date = v_year.end_date, updated_at = now()
    WHERE t.academic_year_id = p_year AND t.kind = 'term' AND t.name = 'Соли таҳсил ' || v_year.name
      AND (t.start_date <> v_year.start_date OR t.end_date <> v_year.end_date)
      AND NOT EXISTS (SELECT 1 FROM public.academic_terms o WHERE o.academic_year_id = p_year AND o.id <> t.id);
  END IF;
  RETURN v_term;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_year_term(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. What every school needs on any day
-- ----------------------------------------------------------------------------

/**
 * The current year, made if the school has none (named from today's date),
 * with its term, its classes and the bells. Moves nobody, so it is safe to
 * call from anywhere that is about to need a class. Returns the year.
 */
CREATE OR REPLACE FUNCTION app.ensure_school_basics(p_school uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year uuid;
  v_span record;
BEGIN
  IF p_school IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('school_year:' || p_school::text, 0));

  SELECT id INTO v_year FROM public.academic_years WHERE school_id = p_school AND is_current;
  IF v_year IS NULL THEN
    SELECT * INTO v_span FROM app.school_year_span(app.school_today(p_school));
    SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = p_school AND app.year_name_key(name) = v_span.name;
    IF v_year IS NULL THEN
      INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current, status)
      VALUES (p_school, v_span.name, v_span.start_date, v_span.end_date, true, 'active')
      RETURNING id INTO v_year;
    ELSE
      UPDATE public.academic_years SET is_current = true, status = 'active', updated_at = now() WHERE id = v_year;
    END IF;
  END IF;

  PERFORM app.ensure_year_term(v_year);
  PERFORM app.ensure_standard_classes(p_school, v_year);
  PERFORM app.ensure_standard_bells(p_school);
  RETURN v_year;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_school_basics(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. The first of August
-- ----------------------------------------------------------------------------

/**
 * Moves a school from p_old into the year (p_name, p_start, p_end): every
 * class up a form with its pupils and class teacher, the eleventh form out,
 * each class's subjects and teachers carried over by name. The same work
 * advance_academic_year and start_new_school_year do when the office asks,
 * done here for the school as a whole, without a signed-in person.
 */
CREATE OR REPLACE FUNCTION app.promote_school_year(p_school uuid, p_old uuid, p_name text, p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new uuid;
  v_class public.classes%ROWTYPE;
  v_target uuid;
  v_next_name text;
  v_moved int := 0;
  v_inserted int := 0;
  v_graduated int := 0;
  v_subjects int := 0;
BEGIN
  SELECT id INTO v_new FROM public.academic_years
  WHERE school_id = p_school AND app.year_name_key(name) = app.year_name_key(p_name);
  IF v_new IS NULL THEN
    INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current, status)
    VALUES (p_school, p_name, p_start, p_end, true, 'active')
    RETURNING id INTO v_new;
  ELSE
    UPDATE public.academic_years SET is_current = true, status = 'active', updated_at = now() WHERE id = v_new;
  END IF;
  IF v_new = p_old THEN
    RETURN jsonb_build_object('yearId', v_new, 'alreadyDone', true);
  END IF;
  UPDATE public.academic_years SET status = 'closed', updated_at = now() WHERE id = p_old AND status <> 'closed';

  PERFORM app.ensure_year_term(v_new, true);
  -- The new year's 1А … 11Д first, so each class below finds the one it
  -- moves into.
  PERFORM app.ensure_standard_classes(p_school, v_new);

  FOR v_class IN
    SELECT * FROM public.classes
    WHERE school_id = p_school AND academic_year_id = p_old AND is_active
    ORDER BY grade_level, name
  LOOP
    IF v_class.grade_level >= 11 THEN
      UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start - 1, enrolled_on), updated_at = now()
      WHERE class_id = v_class.id AND status = 'active';
      UPDATE public.students SET status = 'graduated', status_changed_at = now(), updated_at = now()
      WHERE id IN (SELECT student_id FROM public.enrollments WHERE class_id = v_class.id)
        AND status = 'active';
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_graduated := v_graduated + v_inserted;
      UPDATE public.users SET status = 'graduated', updated_at = now()
      WHERE id IN (
        SELECT s.user_id FROM public.students s
        JOIN public.enrollments e ON e.student_id = s.id AND e.class_id = v_class.id
        WHERE s.user_id IS NOT NULL
      ) AND status = 'active';
      CONTINUE;
    END IF;

    v_next_name := app.normalize_class_name((v_class.grade_level + 1)::text || regexp_replace(v_class.name, '^\s*\d+', ''));
    SELECT id INTO v_target FROM public.classes
    WHERE school_id = p_school AND academic_year_id = v_new AND is_active
      AND app.class_name_key(name) = app.class_name_key(v_next_name);
    IF v_target IS NULL THEN
      INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, shift, homeroom_staff_id, room_id, capacity)
      VALUES (p_school, v_new, v_next_name, v_class.grade_level + 1, v_class.shift, v_class.homeroom_staff_id, v_class.room_id, v_class.capacity)
      RETURNING id INTO v_target;
    ELSE
      -- The class teacher goes up with the class, unless the new class
      -- already has one of its own.
      UPDATE public.classes
      SET homeroom_staff_id = coalesce(homeroom_staff_id, v_class.homeroom_staff_id),
          shift = CASE WHEN EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = v_target) THEN shift ELSE v_class.shift END,
          updated_at = now()
      WHERE id = v_target;
    END IF;

    UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start - 1, enrolled_on), updated_at = now()
    WHERE class_id = v_class.id AND status = 'active';

    INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
    SELECT p_school, e.student_id, v_target, v_new, p_start
    FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id AND s.status = 'active'
    WHERE e.class_id = v_class.id
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments x
        WHERE x.student_id = e.student_id AND x.academic_year_id = v_new AND x.status = 'active'
      )
    GROUP BY e.student_id;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_moved := v_moved + v_inserted;
  END LOOP;

  -- This year's 6А is taught what last year's 6А was, by the same teachers
  -- (those still at the school).
  INSERT INTO public.class_subjects (school_id, class_id, subject_id, group_label, teacher_id)
  SELECT p_school, n.id, cs.subject_id, cs.group_label, CASE WHEN st.status = 'active' THEN cs.teacher_id END
  FROM public.classes n
  JOIN public.classes o
    ON o.school_id = p_school AND o.academic_year_id = p_old
   AND app.class_name_key(o.name) = app.class_name_key(n.name)
  JOIN public.class_subjects cs ON cs.class_id = o.id AND cs.is_active
  LEFT JOIN public.staff st ON st.id = cs.teacher_id
  WHERE n.school_id = p_school AND n.academic_year_id = v_new
  ON CONFLICT (class_id, subject_id, group_label) DO NOTHING;
  GET DIAGNOSTICS v_subjects = ROW_COUNT;

  PERFORM app.write_audit(p_school, 'advance_year', 'academic_years', v_new, NULL, NULL,
    jsonb_build_object('moved', v_moved, 'graduated', v_graduated, 'subjectsCopied', v_subjects, 'automatic', true));

  RETURN jsonb_build_object('yearId', v_new, 'moved', v_moved, 'graduated', v_graduated, 'subjectsCopied', v_subjects);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.promote_school_year(uuid, uuid, text, date, date) FROM PUBLIC, anon, authenticated;

/**
 * Today's year for the school: made, or turned over to, when the date says
 * so, and given its term, classes and bells. Returns the current year.
 */
CREATE OR REPLACE FUNCTION app.ensure_school_year(p_school uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.academic_years%ROWTYPE;
  v_span record;
BEGIN
  IF p_school IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('school_year:' || p_school::text, 0));
  SELECT * INTO v_span FROM app.school_year_span(app.school_today(p_school));
  SELECT * INTO v_current FROM public.academic_years WHERE school_id = p_school AND is_current;

  -- Only ever forwards: a current year that is already today's (or one set
  -- ahead on purpose) is left where it is.
  IF v_current.id IS NOT NULL
     AND app.year_name_key(v_current.name) <> v_span.name
     AND (SELECT s.start_date FROM app.school_year_span(v_current.start_date) s) < v_span.start_date THEN
    PERFORM app.ensure_year_term(v_current.id);
    PERFORM app.promote_school_year(p_school, v_current.id, v_span.name, v_span.start_date, v_span.end_date);
  END IF;

  SELECT * INTO v_current FROM public.academic_years WHERE school_id = p_school AND is_current;
  IF v_current.id IS NOT NULL THEN
    PERFORM app.ensure_year_term(v_current.id, true);
  END IF;
  RETURN app.ensure_school_basics(p_school);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_school_year(uuid) FROM PUBLIC, anon, authenticated;

/** Every school, for the nightly job. */
CREATE OR REPLACE FUNCTION app.ensure_all_school_years()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_count int := 0;
BEGIN
  FOR v_school IN SELECT id FROM public.schools LOOP
    BEGIN
      PERFORM app.ensure_school_year(v_school);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One school's trouble must not stop the others turning over.
      RAISE WARNING 'school year for % failed: %', v_school, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_all_school_years() FROM PUBLIC, anon, authenticated;

/**
 * For the signed-in person's school: the current year, turned over if the
 * date says so. Cheap when there is nothing to do, so the office pages call
 * it on their way in.
 */
CREATE OR REPLACE FUNCTION public.ensure_school_year()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_current public.academic_years%ROWTYPE;
  v_span record;
BEGIN
  IF v_school IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_current FROM public.academic_years WHERE school_id = v_school AND is_current;
  SELECT * INTO v_span FROM app.school_year_span(app.school_today(v_school));
  IF v_current.id IS NOT NULL
     AND app.year_name_key(v_current.name) = v_span.name
     AND v_current.start_date <= v_span.start_date AND v_current.end_date >= v_span.end_date
     AND EXISTS (SELECT 1 FROM public.academic_terms t WHERE t.academic_year_id = v_current.id)
     AND (SELECT count(*) FROM public.classes c WHERE c.academic_year_id = v_current.id AND c.is_active) >= 66
     AND (SELECT count(*) FROM public.bell_periods b WHERE b.school_id = v_school) = 10 THEN
    RETURN v_current.id;
  END IF;
  RETURN app.ensure_school_year(v_school);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_school_year() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_school_year() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Nobody edits the bells
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS bell_periods_write ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_insert ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_update ON public.bell_periods;
DROP POLICY IF EXISTS bell_periods_delete ON public.bell_periods;
REVOKE INSERT, UPDATE, DELETE ON public.bell_periods FROM authenticated;

-- ----------------------------------------------------------------------------
-- 8. Quarter columns are written on the day
-- ----------------------------------------------------------------------------

-- A quarter, a half year or the year is a column the teacher rules on the day
-- the mark is given, headed with its name. The date is that day (or the one
-- the teacher picked), no longer a term's last day, because terms have no
-- fixed dates any more.
CREATE OR REPLACE FUNCTION public.rule_journal_column(
  p_class_subject_id uuid,
  p_academic_term_id uuid,
  p_kind text,
  p_date date DEFAULT NULL,
  p_assessment_type_id uuid DEFAULT NULL,
  p_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_term public.academic_terms%ROWTYPE;
  v_type uuid := p_assessment_type_id;
  v_date date := p_date;
  v_id uuid;
BEGIN
  SELECT cs.school_id INTO v_school FROM public.class_subjects cs WHERE cs.id = p_class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23503';
  END IF;
  IF NOT app.may_keep_journal(p_class_subject_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = p_academic_term_id;
  IF NOT FOUND OR v_term.school_id <> v_school THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'term' THEN
    v_date := coalesce(v_date, least(greatest(app.school_today(v_school), v_term.start_date), v_term.end_date));
    IF v_type IS NULL THEN
      -- The year's mark under a year heading, the quarter's under any other.
      SELECT at.id INTO v_type FROM public.assessment_types at
      WHERE at.school_id = v_school AND at.is_final AND at.is_active
      ORDER BY (at.code = CASE WHEN lower(btrim(coalesce(p_label, ''))) LIKE 'солона%' OR lower(btrim(coalesce(p_label, ''))) LIKE 'годов%'
                                    OR lower(btrim(coalesce(p_label, ''))) LIKE 'year%' THEN 'year_final' ELSE 'term_final' END) DESC,
               at.sort_order
      LIMIT 1;
    END IF;
    IF p_label IS NULL OR btrim(p_label) = '' THEN
      RAISE EXCEPTION 'label_required' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'date_required' USING ERRCODE = '22023';
    END IF;
    IF v_type IS NULL THEN
      SELECT at.id INTO v_type FROM public.assessment_types at
      WHERE at.school_id = v_school AND at.is_active AND NOT at.is_final
      ORDER BY at.sort_order LIMIT 1;
    END IF;
  END IF;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.journal_columns (school_id, class_subject_id, academic_term_id, column_date, assessment_type_id, label, kind)
  VALUES (v_school, p_class_subject_id, p_academic_term_id, v_date, v_type, nullif(btrim(coalesce(p_label, '')), ''),
          CASE WHEN p_kind = 'term' THEN 'term' ELSE 'lesson' END)
  ON CONFLICT ON CONSTRAINT journal_columns_unique DO UPDATE
    SET label = coalesce(EXCLUDED.label, public.journal_columns.label),
        kind = CASE WHEN EXCLUDED.kind = 'term' THEN 'term' ELSE public.journal_columns.kind END,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Report cards read the quarters by their headings
-- ----------------------------------------------------------------------------

-- With one term a year, "the second quarter" is the column headed «Чоряки II»,
-- whatever day it was written. The marks set under a heading now come back
-- with that heading, so the report card can lay them out as the register does.
DROP FUNCTION IF EXISTS public.report_card_marks(uuid);
CREATE FUNCTION public.report_card_marks(p_class_id uuid)
RETURNS TABLE (
  student_id uuid, class_subject_id uuid, academic_term_id uuid,
  kind text, mark numeric, approved boolean, marks_count int,
  label text, marked_on date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT g.student_id, g.class_subject_id, g.academic_term_id,
         at.code::text, round(g.score / g.max_score * 5, 1), g.status = 'approved', 1,
         (SELECT jc.label::text FROM public.journal_columns jc
          WHERE jc.class_subject_id = g.class_subject_id AND jc.column_date = g.grade_date
            AND jc.assessment_type_id = g.assessment_type_id
          LIMIT 1),
         g.grade_date
  FROM public.grades g
  JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
  JOIN public.assessment_types at ON at.id = g.assessment_type_id
  WHERE at.is_final
  UNION ALL
  SELECT g.student_id, g.class_subject_id, g.academic_term_id,
         'average', round(sum(g.score / g.max_score * 5 * at.weight) / nullif(sum(at.weight), 0), 1), true, count(*)::int,
         NULL::text, max(g.grade_date)
  FROM public.grades g
  JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
  JOIN public.assessment_types at ON at.id = g.assessment_type_id
  WHERE NOT at.is_final AND g.academic_term_id IS NOT NULL
  GROUP BY g.student_id, g.class_subject_id, g.academic_term_id
$$;
REVOKE EXECUTE ON FUNCTION public.report_card_marks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_card_marks(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. Every night
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('school-year');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  -- 19:05 UTC is five past midnight in Dushanbe.
  PERFORM cron.schedule('school-year', '5 19 * * *', 'SELECT app.ensure_all_school_years()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.schedule is not available here; the office pages turn the year over instead';
END;
$$;

-- Nothing is run here: a school's year is put right by the nightly job, or by
-- the first office page opened after this migration (ensure_school_year).
