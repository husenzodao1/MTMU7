-- Moving the whole school up a year.
--
-- On the first of September 5А becomes 6А, every pupil in it goes with it, the
-- eleventh form leaves, and a new first form is waiting to be filled. Doing that
-- one class at a time is a morning's work and a morning's worth of mistakes;
-- promote_students already moved a list of pupils between two classes that
-- somebody had to create first.
--
-- Deliberately not a scheduled job. A school that reorganises itself overnight,
-- without anyone asking it to, is a school where nobody can tell what happened
-- or undo it. This runs when the office says so, reports exactly what it did,
-- and does nothing the second time it is run.

CREATE OR REPLACE FUNCTION public.advance_academic_year(
  p_name text,
  p_start date,
  p_end date
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
  v_class public.classes%ROWTYPE;
  v_target uuid;
  v_next_name text;
  v_moved int := 0;
  v_inserted int := 0;
  v_graduated int := 0;
  v_classes int := 0;
BEGIN
  IF v_school IS NULL
     OR NOT app.can(v_school, 'academic_years.manage')
     OR NOT app.can(v_school, 'enrollments.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_old FROM public.academic_years WHERE school_id = v_school AND is_current;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023';
  END IF;

  -- Run twice and the second run finds the year already there and everybody
  -- already moved, so it changes nothing.
  SELECT id INTO v_new FROM public.academic_years WHERE school_id = v_school AND name = btrim(p_name);
  IF v_new IS NULL THEN
    INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
    VALUES (v_school, btrim(p_name), p_start, p_end, true)
    RETURNING id INTO v_new;
  ELSE
    UPDATE public.academic_years SET is_current = true WHERE id = v_new;
  END IF;

  IF v_new = v_old THEN
    RETURN jsonb_build_object('yearId', v_new, 'moved', 0, 'graduated', 0, 'classesCreated', 0, 'alreadyDone', true);
  END IF;

  FOR v_class IN
    SELECT * FROM public.classes
    WHERE school_id = v_school AND academic_year_id = v_old AND is_active
    ORDER BY grade_level, name
  LOOP
    IF v_class.grade_level >= 11 THEN
      -- The leaving year. Their record stays; their place in a class does not.
      UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start, enrolled_on)
      WHERE class_id = v_class.id AND status = 'active';
      UPDATE public.students SET status = 'graduated', status_changed_at = now()
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

    -- 5А becomes 6А: the number goes up, the letter stays.
    v_next_name := (v_class.grade_level + 1)::text || regexp_replace(v_class.name, '^\s*\d+', '');

    SELECT id INTO v_target FROM public.classes
    WHERE school_id = v_school AND academic_year_id = v_new AND app.normalize_class_name(name) = app.normalize_class_name(v_next_name);
    IF v_target IS NULL THEN
      INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, shift, homeroom_staff_id, room_id, capacity)
      VALUES (v_school, v_new, app.normalize_class_name(v_next_name), v_class.grade_level + 1, v_class.shift,
              v_class.homeroom_staff_id, v_class.room_id, v_class.capacity)
      RETURNING id INTO v_target;
      v_classes := v_classes + 1;
    END IF;

    UPDATE public.enrollments SET status = 'completed', left_on = greatest(p_start, enrolled_on)
    WHERE class_id = v_class.id AND status = 'active';

    INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on, created_by)
    SELECT v_school, e.student_id, v_target, v_new, p_start, (SELECT auth.uid())
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

  -- The new first form, empty and waiting for the intake workbook.
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE school_id = v_school AND academic_year_id = v_new AND grade_level = 1
  ) THEN
    INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
    SELECT v_school, v_new, (1::text || regexp_replace(c.name, '^\s*\d+', '')), 1
    FROM public.classes c
    WHERE c.school_id = v_school AND c.academic_year_id = v_old AND c.grade_level = 1 AND c.is_active;
    IF NOT FOUND THEN
      -- Last year had no first form to copy the letters from, so there is one
      -- first form and it is called 1А. The office renames it or adds to it.
      INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
      VALUES (v_school, v_new, '1А', 1);
    END IF;
    v_classes := v_classes + coalesce((SELECT count(*)::int FROM public.classes WHERE school_id = v_school AND academic_year_id = v_new AND grade_level = 1), 0);
  END IF;

  UPDATE public.academic_years SET is_current = false WHERE school_id = v_school AND id <> v_new;

  PERFORM app.write_audit(v_school, 'advance_year', 'academic_years', v_new, NULL, NULL,
    jsonb_build_object('moved', v_moved, 'graduated', v_graduated, 'classesCreated', v_classes));

  RETURN jsonb_build_object('yearId', v_new, 'moved', v_moved, 'graduated', v_graduated, 'classesCreated', v_classes);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.advance_academic_year(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_academic_year(text, date, date) TO authenticated;
