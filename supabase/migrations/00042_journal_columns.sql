-- Columns a teacher opens before there is anything to write in them.
--
-- The journal derived its columns from the marks that already existed, so a
-- teacher could not prepare the week ahead, and a column that everyone missed
-- simply vanished. A paper journal works the other way round: the dates are
-- ruled first and filled afterwards, and some columns are not a date at all but
-- a heading — "Чоряки I" over the term mark.
--
-- A column is (date, kind of work, and optionally which period of the day). The
-- label is free text for those headings; everything else about a column is
-- structure.

CREATE TABLE IF NOT EXISTS public.journal_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  academic_term_id uuid NOT NULL REFERENCES public.academic_terms(id) ON DELETE CASCADE,
  column_date date NOT NULL,
  assessment_type_id uuid NOT NULL REFERENCES public.assessment_types(id) ON DELETE RESTRICT,
  period_number smallint,
  label varchar(60),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_columns_period_check CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 12),
  CONSTRAINT journal_columns_label_length CHECK (label IS NULL OR char_length(btrim(label)) BETWEEN 1 AND 60),
  CONSTRAINT journal_columns_unique
    UNIQUE NULLS NOT DISTINCT (class_subject_id, column_date, assessment_type_id, period_number)
);
CREATE INDEX IF NOT EXISTS idx_journal_columns_term
  ON public.journal_columns(class_subject_id, academic_term_id, column_date);

ALTER TABLE public.journal_columns ENABLE ROW LEVEL SECURITY;

-- The same audience as the marks these columns will hold.
CREATE POLICY journal_columns_read ON public.journal_columns FOR SELECT TO authenticated USING (
  app.can(school_id, 'grades.view')
  OR class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
  OR EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.id = class_subject_id
      AND (
        cs.class_id = ANY ((SELECT app.my_class_ids())::uuid[])
        OR cs.class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[])
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.class_subjects cs
    JOIN public.enrollments e ON e.class_id = cs.class_id AND e.status = 'active'
    WHERE cs.id = class_subject_id
      AND (
        e.student_id = (SELECT app.my_student_id())
        OR e.student_id = ANY ((SELECT app.my_child_ids())::uuid[])
      )
  )
);

CREATE POLICY journal_columns_insert ON public.journal_columns FOR INSERT TO authenticated WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
);
CREATE POLICY journal_columns_update ON public.journal_columns FOR UPDATE TO authenticated USING (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
) WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
);
-- A column that already carries marks is not removed by hand; deleting it would
-- silently take the marks with it, so only an empty one may go.
CREATE POLICY journal_columns_delete ON public.journal_columns FOR DELETE TO authenticated USING (
  (
    (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
    OR app.can(school_id, 'grades.update')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.grades g
    WHERE g.class_subject_id = journal_columns.class_subject_id
      AND g.grade_date = journal_columns.column_date
      AND g.assessment_type_id = journal_columns.assessment_type_id
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_columns TO authenticated;
GRANT ALL ON public.journal_columns TO service_role;

-- School and term are taken from the subject and the date, never from the
-- caller, and the date must fall inside the term it is filed under.
CREATE OR REPLACE FUNCTION app.guard_journal_column_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_school uuid;
  v_term public.academic_terms%ROWTYPE;
BEGIN
  SELECT cs.school_id INTO v_school FROM public.class_subjects cs WHERE cs.id = NEW.class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '22023';
  END IF;
  NEW.school_id := v_school;

  SELECT * INTO v_term FROM public.academic_terms WHERE id = NEW.academic_term_id;
  IF NOT FOUND OR NEW.column_date < v_term.start_date OR NEW.column_date > v_term.end_date THEN
    RAISE EXCEPTION 'date_outside_term' USING ERRCODE = '22023';
  END IF;

  NEW.label := nullif(btrim(coalesce(NEW.label, '')), '');
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, (SELECT auth.uid()));
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_journal_column ON public.journal_columns;
CREATE TRIGGER trg_guard_journal_column
  BEFORE INSERT OR UPDATE ON public.journal_columns
  FOR EACH ROW EXECUTE FUNCTION app.guard_journal_column_write();
