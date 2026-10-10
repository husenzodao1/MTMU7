-- The right-hand page of the journal: what was taught, and when.
--
-- A Tajik school journal is two pages facing each other. The left page carries
-- the marks, the right page carries one line per lesson — the date in a narrow
-- column and the topic in a wide one, with the homework set that day. Until now
-- the platform had only the left page, so the record of what a class actually
-- covered lived nowhere.

CREATE TABLE IF NOT EXISTS public.lesson_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  lesson_date date NOT NULL,
  -- A subject may meet twice in one day; the period tells the two lines apart.
  period_number smallint,
  topic varchar(500) NOT NULL,
  homework varchar(1000),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_topics_topic_length CHECK (char_length(btrim(topic)) BETWEEN 1 AND 500),
  CONSTRAINT lesson_topics_period_check CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 12),
  CONSTRAINT lesson_topics_unique UNIQUE NULLS NOT DISTINCT (class_subject_id, lesson_date, period_number)
);
CREATE INDEX IF NOT EXISTS idx_lesson_topics_subject_date
  ON public.lesson_topics(class_subject_id, lesson_date);

ALTER TABLE public.lesson_topics ENABLE ROW LEVEL SECURITY;

-- The audience is the class: whoever teaches it, whoever sits in it, their
-- guardians, and anyone with the school-wide right to look. This mirrors the
-- marks on the facing page, so the two are never visible to different people.
CREATE POLICY lesson_topics_read ON public.lesson_topics FOR SELECT TO authenticated USING (
  app.can(school_id, 'grades.view')
  OR class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
  -- Staff route: the classes I teach, or the one I am homeroom teacher of.
  OR EXISTS (
    SELECT 1 FROM public.class_subjects cs
    WHERE cs.id = class_subject_id
      AND (
        cs.class_id = ANY ((SELECT app.my_class_ids())::uuid[])
        OR cs.class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[])
      )
  )
  -- Family route: the class I am enrolled in, or the one my child is.
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

-- Writing is the teacher of that subject in that class, or someone who may
-- correct the journal school-wide. Nobody else can fill in a lesson they did
-- not teach.
CREATE POLICY lesson_topics_insert ON public.lesson_topics FOR INSERT TO authenticated WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
);
CREATE POLICY lesson_topics_update ON public.lesson_topics FOR UPDATE TO authenticated USING (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
) WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
);
CREATE POLICY lesson_topics_delete ON public.lesson_topics FOR DELETE TO authenticated
  USING (app.can(school_id, 'grades.update'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_topics TO authenticated;
GRANT ALL ON public.lesson_topics TO service_role;

-- The school on the row must be the school the subject belongs to, whatever a
-- client claims.
CREATE OR REPLACE FUNCTION app.guard_lesson_topic_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_school uuid;
BEGIN
  SELECT cs.school_id INTO v_school FROM public.class_subjects cs WHERE cs.id = NEW.class_subject_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid_class_subject' USING ERRCODE = '22023';
  END IF;
  NEW.school_id := v_school;
  NEW.topic := btrim(NEW.topic);
  NEW.homework := nullif(btrim(coalesce(NEW.homework, '')), '');
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, (SELECT auth.uid()));
  ELSE
    NEW.updated_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_lesson_topic ON public.lesson_topics;
CREATE TRIGGER trg_guard_lesson_topic
  BEFORE INSERT OR UPDATE ON public.lesson_topics
  FOR EACH ROW EXECUTE FUNCTION app.guard_lesson_topic_write();
