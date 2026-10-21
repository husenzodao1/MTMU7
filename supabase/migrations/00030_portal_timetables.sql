-- ============================================================================
-- 00030 · Timetable read models for the portal.
--
-- Students and guardians may not read the staff directory, but a timetable
-- must show who teaches each lesson. These functions return only display
-- names for lessons the caller is entitled to see.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.class_timetable(p_class_id uuid)
RETURNS TABLE (
  timetable_entry_id uuid, day_of_week smallint, shift smallint, period_number smallint,
  start_time time, end_time time, class_subject_id uuid, subject_tg varchar, subject_ru varchar, subject_en varchar,
  teacher_name text, room_name varchar
)
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
  SELECT te.id, te.day_of_week, te.shift, te.period_number, bp.start_time, bp.end_time, te.class_subject_id,
         s.name_tg, s.name_ru, s.name_en,
         (SELECT btrim(st.last_name || ' ' || st.first_name || ' ' || coalesce(st.middle_name, '')) FROM public.staff st WHERE st.id = te.teacher_id),
         (SELECT r.name FROM public.rooms r WHERE r.id = coalesce(te.room_id, v_class.room_id))
  FROM public.timetable_entries te
  JOIN public.class_subjects cs ON cs.id = te.class_subject_id
  JOIN public.subjects s ON s.id = cs.subject_id
  LEFT JOIN public.bell_periods bp ON bp.school_id = te.school_id AND bp.shift = te.shift AND bp.period_number = te.period_number
  WHERE te.class_id = p_class_id
  ORDER BY te.day_of_week, te.shift, te.period_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_teaching_timetable()
RETURNS TABLE (
  timetable_entry_id uuid, day_of_week smallint, shift smallint, period_number smallint,
  start_time time, end_time time, class_id uuid, class_name varchar, class_subject_id uuid,
  subject_tg varchar, subject_ru varchar, subject_en varchar, room_name varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT te.id, te.day_of_week, te.shift, te.period_number, bp.start_time, bp.end_time, c.id, c.name, te.class_subject_id,
         s.name_tg, s.name_ru, s.name_en,
         (SELECT r.name FROM public.rooms r WHERE r.id = coalesce(te.room_id, c.room_id))
  FROM public.timetable_entries te
  JOIN public.classes c ON c.id = te.class_id AND c.is_active
  JOIN public.class_subjects cs ON cs.id = te.class_subject_id
  JOIN public.subjects s ON s.id = cs.subject_id
  LEFT JOIN public.bell_periods bp ON bp.school_id = te.school_id AND bp.shift = te.shift AND bp.period_number = te.period_number
  WHERE te.teacher_id = app.my_staff_id()
    AND te.academic_year_id = app.current_year_id(app.current_school_id())
  ORDER BY te.day_of_week, te.shift, te.period_number
$$;

REVOKE EXECUTE ON FUNCTION public.class_timetable(uuid), public.my_teaching_timetable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_timetable(uuid), public.my_teaching_timetable() TO authenticated;

-- ----------------------------------------------------------------------------
-- Announcement attachments live in the private documents bucket under
-- <school>/announcements/… and are readable exactly by the announcement's
-- audience (RLS on announcements decides).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS sp_announcement_files_read ON storage.objects;
CREATE POLICY sp_announcement_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND split_part(name, '/', 2) = 'announcements'
  AND EXISTS (SELECT 1 FROM public.announcements a WHERE a.attachment_path = name)
);
DROP POLICY IF EXISTS sp_announcement_files_insert ON storage.objects;
CREATE POLICY sp_announcement_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'documents'
  AND app.object_school(name) = (SELECT app.current_school_id())
  AND split_part(name, '/', 2) = 'announcements'
  AND (app.can(app.object_school(name), 'announcements.create') OR app.can(app.object_school(name), 'announcements.publish'))
);
