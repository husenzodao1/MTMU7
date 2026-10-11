-- ============================================================================
-- 00084 · Substitutions where pupils and parents look.
--
-- A substitute teacher was entered in the office and shown to the teachers
-- concerned, but a class's own timetable did not say that tomorrow's maths is
-- taken by somebody else. class_substitutions lists the substitutions of one
-- class for the coming week — the day, the lesson, the subject and who takes
-- it — for exactly the people who already see that class's timetable. Pupils
-- and parents may not read the staff directory, so the substitute's name comes
-- from here and nothing else about them does.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.class_substitutions(p_class_id uuid)
RETURNS TABLE (
  substitution_date date, period_number smallint,
  subject_tg text, subject_ru text, subject_en text,
  teacher_name text, room_name text, reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class public.classes%ROWTYPE;
  v_today date;
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
  v_today := app.school_today(v_class.school_id);

  RETURN QUERY
  SELECT s.substitution_date, te.period_number,
         sub.name_tg::text, sub.name_ru::text, sub.name_en::text,
         nullif(btrim(coalesce(st.last_name, '') || ' ' || coalesce(st.first_name, '')), ''),
         r.name::text, s.reason::text
  FROM public.substitutions s
  JOIN public.timetable_entries te ON te.id = s.timetable_entry_id
  JOIN public.class_subjects cs ON cs.id = te.class_subject_id
  JOIN public.subjects sub ON sub.id = cs.subject_id
  LEFT JOIN public.staff st ON st.id = s.substitute_teacher_id
  LEFT JOIN public.rooms r ON r.id = coalesce(s.room_id, te.room_id)
  WHERE te.class_id = p_class_id
    AND s.status <> 'cancelled'
    AND s.substitution_date BETWEEN v_today AND v_today + 7
  ORDER BY s.substitution_date, te.period_number;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.class_substitutions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_substitutions(uuid) TO authenticated;
