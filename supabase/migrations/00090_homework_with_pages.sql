-- Homework as a Tajik teacher sets it: the topic and the pages.
--
-- "Мавзӯи 12, саҳифаҳои 45–47, машқи 112" — the topic was the assignment's
-- title already; the pages and exercises had nowhere of their own and ended up
-- in the instructions, if anywhere. They get a short column of their own, shown
-- beside the topic to the pupil and the parents.

ALTER TABLE public.homework_assignments ADD COLUMN IF NOT EXISTS pages varchar(200);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'homework_assignments_pages_length') THEN
    ALTER TABLE public.homework_assignments
      ADD CONSTRAINT homework_assignments_pages_length CHECK (pages IS NULL OR char_length(btrim(pages)) BETWEEN 1 AND 200);
  END IF;
END $$;

COMMENT ON COLUMN public.homework_assignments.pages IS 'Pages and exercises set with the topic (title), e.g. "pp. 45–47, ex. 112".';
