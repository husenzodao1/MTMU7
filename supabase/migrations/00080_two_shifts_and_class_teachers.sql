-- ============================================================================
-- 00080 · Two shifts, and the class's teachers under its timetable.
--
-- The school teaches in two shifts, never three, so a third is no longer
-- accepted anywhere — a class, a bell, a lesson.
--
-- Under a class's timetable the portal now lists the teachers of that class,
-- numbered, with their telephone, for the pupils and the parents who already
-- see the timetable. Students and guardians may not read the staff directory,
-- so this returns only what the list shows, for a class the caller may see.
-- ============================================================================

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_shift_check;
ALTER TABLE public.classes ADD CONSTRAINT classes_shift_check CHECK (shift IN (1, 2));

ALTER TABLE public.bell_periods DROP CONSTRAINT IF EXISTS bell_periods_values_check;
ALTER TABLE public.bell_periods ADD CONSTRAINT bell_periods_values_check CHECK (shift IN (1, 2) AND period_number BETWEEN 1 AND 12);

ALTER TABLE public.timetable_entries DROP CONSTRAINT IF EXISTS timetable_slot_check;
ALTER TABLE public.timetable_entries ADD CONSTRAINT timetable_slot_check CHECK (shift IN (1, 2) AND period_number BETWEEN 1 AND 12);

CREATE OR REPLACE FUNCTION public.class_teachers(p_class_id uuid)
RETURNS TABLE (teacher_name text, subjects_tg text, subjects_ru text, subjects_en text, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND OR NOT (
    p_class_id = ANY (app.my_family_class_ids())
    OR p_class_id = ANY (app.my_class_ids())
    OR app.can(v_class.school_id, 'timetable.manage')
    OR app.can(v_class.school_id, 'classes.view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT btrim(st.last_name || ' ' || st.first_name || ' ' || coalesce(st.middle_name, '')),
         string_agg(DISTINCT s.name_tg, ', '),
         string_agg(DISTINCT s.name_ru, ', '),
         string_agg(DISTINCT s.name_en, ', '),
         coalesce(nullif(btrim(st.phone), ''), nullif(btrim(u.phone), ''))::text
  FROM public.class_subjects cs
  JOIN public.subjects s ON s.id = cs.subject_id
  JOIN public.staff st ON st.id = cs.teacher_id
  LEFT JOIN public.users u ON u.id = st.user_id
  WHERE cs.class_id = p_class_id AND cs.is_active AND st.status = 'active'
  GROUP BY st.id, st.last_name, st.first_name, st.middle_name, st.phone, u.phone
  ORDER BY st.last_name, st.first_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.class_teachers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_teachers(uuid) TO authenticated;
