-- The journal as it is actually kept: one cell, one pen.
--
-- On paper a teacher writes either a mark or a letter in the same small square,
-- and rules a column headed with a date they choose. The portal made those two
-- different things — a mark in a grid, an absence in a separate form — so
-- keeping the register meant filling in two screens for one lesson, and a
-- letter written where a mark was expected was simply refused.
--
-- Now one function reads a cell the way a person writes one: a number is a
-- mark, a letter is an absence, and an empty square means the square is empty.
-- A column may also be a quarter rather than a lesson, headed «Чоряки I»
-- instead of a date, which is what the last columns of a Tajik register are.

-- ----------------------------------------------------------------------------
-- 1. A column is a lesson or a quarter
-- ----------------------------------------------------------------------------

ALTER TABLE public.journal_columns
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'lesson';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_columns_kind_check') THEN
    ALTER TABLE public.journal_columns
      ADD CONSTRAINT journal_columns_kind_check CHECK (kind IN ('lesson', 'term'));
  END IF;
END $$;

COMMENT ON COLUMN public.journal_columns.kind IS
  'lesson: headed with the date the teacher wrote. term: headed with its label, «Чоряки I», and dated at the end of the term.';

-- ----------------------------------------------------------------------------
-- 2. Reading one square
-- ----------------------------------------------------------------------------

-- A number is a mark. A letter is an absence — in whichever of the three
-- alphabets the school writes: ғ/н/a for away, д/о/l for late, у/e for excused.
-- Anything else is a mistake worth naming, because silently dropping what
-- somebody typed into a register is how a term's marks go missing.
CREATE OR REPLACE FUNCTION app.read_journal_cell(p_value text, p_max numeric)
RETURNS TABLE (kind text, score numeric, status text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v text := lower(btrim(coalesce(p_value, '')));
  v_score numeric;
BEGIN
  IF v = '' THEN
    RETURN QUERY SELECT 'empty'::text, NULL::numeric, NULL::text;
    RETURN;
  END IF;

  IF v IN ('ғ', 'н', 'a', 'g') THEN
    RETURN QUERY SELECT 'absence'::text, NULL::numeric, 'absent'::text;
    RETURN;
  END IF;
  IF v IN ('д', 'о', 'o', 'l') THEN
    RETURN QUERY SELECT 'absence'::text, NULL::numeric, 'late'::text;
    RETURN;
  END IF;
  IF v IN ('у', 'e', 'y') THEN
    RETURN QUERY SELECT 'absence'::text, NULL::numeric, 'excused'::text;
    RETURN;
  END IF;

  BEGIN
    v_score := replace(v, ',', '.')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::numeric, NULL::text;
    RETURN;
  END;

  IF v_score < 0 OR v_score > p_max OR round(v_score * 100) <> v_score * 100 THEN
    RETURN QUERY SELECT 'out_of_range'::text, NULL::numeric, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'score'::text, v_score, NULL::text;
END;
$$;
GRANT EXECUTE ON FUNCTION app.read_journal_cell(text, numeric) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ruling a column
-- ----------------------------------------------------------------------------

-- The teacher chooses the date; nothing here guesses one from a timetable. A
-- quarter column takes the end of the term instead, because a column still has
-- to sit somewhere in the order.
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
    v_date := v_term.end_date;
    IF v_type IS NULL THEN
      SELECT at.id INTO v_type FROM public.assessment_types at
      WHERE at.school_id = v_school AND at.is_final AND at.is_active
      ORDER BY at.sort_order LIMIT 1;
    END IF;
    IF p_label IS NULL OR btrim(p_label) = '' THEN
      RAISE EXCEPTION 'label_required' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'date_required' USING ERRCODE = '22023';
    END IF;
    IF v_type IS NULL THEN
      -- Ruling a column is a daily act; being made to name the kind of work
      -- every time is friction, and ordinary classwork is what it usually is.
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
    SET label = coalesce(EXCLUDED.label, public.journal_columns.label), updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rule_journal_column(uuid, uuid, text, date, uuid, text) TO authenticated;

-- Who may write in this journal: the teacher it belongs to, or somebody who may
-- correct marks across the school. The same predicate the row policies use, in
-- one place, because a definer function does not get them for free.
CREATE OR REPLACE FUNCTION app.may_keep_journal(p_class_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (p_class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND app.has_own_permission('grades.enter'))
    OR app.can((SELECT cs.school_id FROM public.class_subjects cs WHERE cs.id = p_class_subject_id), 'grades.update'),
    false)
$$;
GRANT EXECUTE ON FUNCTION app.may_keep_journal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Saving a page of the journal
-- ----------------------------------------------------------------------------

-- Every square the teacher touched, in one call. A number becomes a mark, a
-- letter becomes an absence, an emptied square removes whichever was there —
-- and a square that says something else is reported rather than dropped.
CREATE OR REPLACE FUNCTION public.save_journal_cells(
  p_class_subject_id uuid,
  p_academic_term_id uuid,
  p_cells jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_class uuid;
  v_cell jsonb;
  v_student uuid;
  v_date date;
  v_type uuid;
  v_max numeric;
  v_read record;
  v_errors jsonb := '[]'::jsonb;
  v_saved int := 0;
  v_cleared int := 0;
  v_index int;
BEGIN
  SELECT cs.school_id, cs.class_id INTO v_school, v_class
  FROM public.class_subjects cs WHERE cs.id = p_class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '23503';
  END IF;
  IF NOT app.may_keep_journal(p_class_subject_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_cells) > 4000 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 0 .. jsonb_array_length(p_cells) - 1 LOOP
    v_cell := p_cells -> v_index;
    v_student := (v_cell ->> 'student')::uuid;
    v_date := (v_cell ->> 'date')::date;
    v_type := (v_cell ->> 'type')::uuid;

    SELECT at.max_score INTO v_max FROM public.assessment_types at
    WHERE at.id = v_type AND at.school_id = v_school;
    IF v_max IS NULL THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', 'invalid');
      CONTINUE;
    END IF;

    SELECT * INTO v_read FROM app.read_journal_cell(v_cell ->> 'value', v_max);

    IF v_read.kind = 'invalid' OR v_read.kind = 'out_of_range' THEN
      v_errors := v_errors || jsonb_build_object('student', v_student, 'date', v_date, 'code', v_read.kind);
      CONTINUE;
    END IF;

    -- Whatever the square becomes, it stops being what it was: a mark replaced
    -- by a letter must not leave the mark behind it.
    DELETE FROM public.grades
    WHERE student_id = v_student AND class_subject_id = p_class_subject_id
      AND grade_date = v_date AND assessment_type_id = v_type AND status <> 'approved';
    DELETE FROM public.attendance_records
    WHERE student_id = v_student AND attendance_date = v_date AND class_subject_id = p_class_subject_id;

    IF v_read.kind = 'empty' THEN
      v_cleared := v_cleared + 1;
      CONTINUE;
    END IF;

    IF v_read.kind = 'score' THEN
      INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id, score, max_score, grade_date)
      VALUES (v_school, v_student, p_class_subject_id, p_academic_term_id, v_type, v_read.score, v_max, v_date);
    ELSE
      INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
      VALUES (v_school, v_student, v_class, p_class_subject_id, v_date, v_read.status);
    END IF;
    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved, 'cleared', v_cleared, 'errors', v_errors);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_journal_cells(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_journal_cells(uuid, uuid, jsonb) TO authenticated;
