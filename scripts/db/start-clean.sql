-- Starting the live school clean: run once, by hand, in the Supabase SQL editor
-- (or through the Supabase connector), AFTER migrations 00086–00093 are in.
-- Replace KEEP_EMAIL below with the main administrator's address first.
-- Nothing here runs on its own and nothing in CI calls it.
--
-- Every account but the main administrator, and everything that belonged to
-- them, so the school starts from its own workbooks. All or nothing.
DO $$
DECLARE
  v_keep uuid;
BEGIN
  SELECT id INTO v_keep FROM auth.users WHERE lower(email) = lower('KEEP_EMAIL');
  IF v_keep IS NULL THEN
    RAISE EXCEPTION 'the main administrator was not found';
  END IF;

  -- The main administrator holds the platform scope the seed account held.
  INSERT INTO public.admin_scopes (user_id, scope_type, scope_role)
  SELECT v_keep, 'platform', 'super_admin'
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_scopes WHERE user_id = v_keep AND scope_type = 'platform' AND scope_role = 'super_admin');

  -- What was taught, marked and set.
  DELETE FROM public.homework_attachments;
  DELETE FROM public.homework_submissions;
  DELETE FROM public.homework_assignments;
  DELETE FROM public.grades;
  DELETE FROM public.attendance_records;
  DELETE FROM public.lesson_topics;
  DELETE FROM public.journal_columns;
  DELETE FROM public.substitutions;
  DELETE FROM public.timetable_entries;
  DELETE FROM public.teacher_subjects;
  DELETE FROM public.student_enrollments;
  DELETE FROM public.enrollments;
  DELETE FROM public.class_positions;
  DELETE FROM public.class_subjects;

  -- Pupils, parents, staff.
  DELETE FROM public.telegram_children;
  DELETE FROM public.telegram_outbox;
  DELETE FROM public.telegram_chats;
  DELETE FROM public.parent_codes;
  DELETE FROM public.student_guardians;
  DELETE FROM public.guardians;
  DELETE FROM public.students;
  UPDATE public.classes SET homeroom_staff_id = NULL;
  DELETE FROM public.staff WHERE user_id IS DISTINCT FROM v_keep;

  -- The test classes, subjects and years; the current year's term, classes
  -- and bells are put back by app.ensure_all_school_years() right after.
  DELETE FROM public.classes;
  DELETE FROM public.subjects;
  DELETE FROM public.rooms;
  DELETE FROM public.academic_terms WHERE academic_year_id IN (SELECT id FROM public.academic_years WHERE NOT is_current);
  DELETE FROM public.academic_years WHERE NOT is_current;

  -- Conversations and requests between the accounts that go.
  DELETE FROM public.message_reactions;
  DELETE FROM public.message_push_log;
  DELETE FROM public.messages;
  DELETE FROM public.conversation_members;
  DELETE FROM public.conversations;
  DELETE FROM public.friend_requests;
  DELETE FROM public.support_requests;
  DELETE FROM public.registration_requests;
  DELETE FROM public.invitation_codes;

  -- The accounts.
  DELETE FROM public.users WHERE id <> v_keep;
  DELETE FROM auth.users WHERE id <> v_keep;
END;
$$;
SELECT app.ensure_all_school_years();
