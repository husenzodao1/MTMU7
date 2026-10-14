-- ============================================================================
-- 00031 School-local calendar dates
--
-- The database runs in UTC, while schools work in their own time zone
-- (Asia/Dushanbe is UTC+5). Validation that compared attendance dates with
-- `current_date` rejected lessons marked between 00:00 and 05:00 local time as
-- "future" and shifted the correction window by a day. Dates are now resolved
-- in the school's configured time zone.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.school_today(p_school uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_zone text;
BEGIN
  SELECT s.timezone INTO v_zone FROM public.schools s WHERE s.id = p_school;
  BEGIN
    RETURN (now() AT TIME ZONE coalesce(v_zone, 'Asia/Dushanbe'))::date;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN (now() AT TIME ZONE 'Asia/Dushanbe')::date;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.school_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.school_today(uuid) TO authenticated;

-- Only real IANA zone names may be stored.
CREATE OR REPLACE FUNCTION app.validate_school_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid time zone' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_school_timezone ON public.schools;
CREATE TRIGGER trg_validate_school_timezone BEFORE INSERT OR UPDATE OF timezone ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.validate_school_timezone();
REVOKE EXECUTE ON FUNCTION app.validate_school_timezone() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.validate_attendance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_window int;
  v_today date;
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'classes', NEW.class_id);
  PERFORM app.assert_same_school(NEW.school_id, 'students', NEW.student_id);
  IF NEW.class_subject_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_subjects cs WHERE cs.id = NEW.class_subject_id AND cs.class_id = NEW.class_id
  ) THEN
    RAISE EXCEPTION 'class subject does not belong to the class' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = NEW.student_id AND e.class_id = NEW.class_id
      AND NEW.attendance_date >= e.enrolled_on AND (e.left_on IS NULL OR NEW.attendance_date <= e.left_on)
  ) THEN
    RAISE EXCEPTION 'student is not enrolled in this class on the attendance date' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> 'late' THEN
    NEW.minutes_late := NULL;
  END IF;

  IF app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.marked_by := (SELECT auth.uid());
    ELSE
      NEW.updated_by := (SELECT auth.uid());
      IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.attendance_date IS DISTINCT FROM OLD.attendance_date
         OR NEW.class_id IS DISTINCT FROM OLD.class_id THEN
        RAISE EXCEPTION 'attendance identity fields cannot be changed' USING ERRCODE = '42501';
      END IF;
    END IF;
    v_today := app.school_today(NEW.school_id);
    IF NEW.attendance_date > v_today THEN
      RAISE EXCEPTION 'attendance cannot be recorded for a future date' USING ERRCODE = '23514';
    END IF;
    v_window := app.school_setting_int(NEW.school_id, 'attendance_correction_days', 7);
    IF NEW.attendance_date < v_today - v_window AND NOT app.can(NEW.school_id, 'attendance.update') THEN
      RAISE EXCEPTION 'the attendance correction window has closed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.validate_attendance() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Substitute teachers may take attendance for the lessons they cover.
-- (Previously only the regular subject teacher could, so covered lessons
-- could not be marked at all.) Grades and homework stay with the subject
-- teacher.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_covering_lesson(p_class_subject uuid, p_date date, p_period smallint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_class_subject IS NOT NULL AND p_period IS NOT NULL AND app.my_staff_id() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.substitutions s
    JOIN public.timetable_entries te ON te.id = s.timetable_entry_id
    WHERE te.class_subject_id = p_class_subject
      AND te.period_number = p_period
      AND te.day_of_week = extract(isodow FROM p_date)::int
      AND s.substitution_date = p_date
      AND s.status <> 'cancelled'
      AND s.substitute_teacher_id = app.my_staff_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION app.is_covering_lesson(uuid, date, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.is_covering_lesson(uuid, date, smallint) TO authenticated;

DROP POLICY IF EXISTS attendance_insert ON public.attendance_records;
DROP POLICY IF EXISTS attendance_update ON public.attendance_records;
CREATE POLICY attendance_insert ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  (
    (SELECT app.has_own_permission('attendance.mark'))
    AND (
      (class_subject_id IS NOT NULL AND class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
      OR (class_subject_id IS NULL AND class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[]))
      OR app.is_covering_lesson(class_subject_id, attendance_date, period_number)
    )
  )
  OR app.can(school_id, 'attendance.update')
);
CREATE POLICY attendance_update ON public.attendance_records FOR UPDATE TO authenticated USING (
  (
    (SELECT app.has_own_permission('attendance.mark'))
    AND (
      (class_subject_id IS NOT NULL AND class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
      OR (class_subject_id IS NULL AND class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[]))
      OR app.is_covering_lesson(class_subject_id, attendance_date, period_number)
    )
  )
  OR app.can(school_id, 'attendance.update')
) WITH CHECK (
  (
    (SELECT app.has_own_permission('attendance.mark'))
    AND (
      (class_subject_id IS NOT NULL AND class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
      OR (class_subject_id IS NULL AND class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[]))
      OR app.is_covering_lesson(class_subject_id, attendance_date, period_number)
    )
  )
  OR app.can(school_id, 'attendance.update')
);

-- The covering teacher also needs to read the attendance of that class.
DROP POLICY IF EXISTS attendance_read ON public.attendance_records;
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated USING (
  app.can(school_id, 'attendance.view')
  OR class_id = ANY ((SELECT app.my_class_ids())::uuid[])
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
  OR app.is_covering_lesson(class_subject_id, attendance_date, period_number)
);
