-- ============================================================================
-- 00024 · Academic core: people records, academic calendar, classes and
--         subjects, enrollments, assessments and grades, attendance, homework,
--         timetable and substitutions.
--
-- People (students, staff, guardians) exist independently of login accounts;
-- an account may be linked through user_id. Academic records reference people
-- records, never auth users, so history survives account changes.
--
-- Legacy tables class_students, teacher_subjects and student_enrollments are
-- migrated into enrollments/class_subjects and become read-only.
-- ============================================================================

-- Trigram search backs the student name index below. Supabase ships the
-- extension but does not enable it in a new project, and the test harness
-- created it separately, so the migration that needs it now declares it.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. People
-- ----------------------------------------------------------------------------
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  student_number varchar(32),
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  middle_name varchar(100),
  gender varchar(10),
  date_of_birth date,
  admission_date date,
  status varchar(20) NOT NULL DEFAULT 'active',
  status_changed_at timestamptz,
  address text,
  phone varchar(50),
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_status_check CHECK (status IN ('active', 'inactive', 'transferred', 'graduated', 'archived')),
  CONSTRAINT students_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female')),
  CONSTRAINT students_number_unique UNIQUE (school_id, student_number),
  CONSTRAINT students_names_length CHECK (length(btrim(first_name)) > 0 AND length(btrim(last_name)) > 0)
);
CREATE INDEX idx_students_school_status ON public.students(school_id, status);
CREATE INDEX idx_students_name_search ON public.students USING gin ((lower(last_name || ' ' || first_name || ' ' || coalesce(middle_name, ''))) extensions.gin_trgm_ops);

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  employee_number varchar(32),
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  middle_name varchar(100),
  gender varchar(10),
  date_of_birth date,
  staff_type varchar(20) NOT NULL DEFAULT 'teacher',
  position varchar(200),
  qualification text,
  hire_date date,
  phone varchar(50),
  email varchar(255),
  max_weekly_hours numeric(4,1),
  status varchar(20) NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_type_check CHECK (staff_type IN ('teacher', 'director', 'vice_principal', 'librarian', 'administrator', 'support', 'other')),
  CONSTRAINT staff_status_check CHECK (status IN ('active', 'on_leave', 'inactive', 'archived')),
  CONSTRAINT staff_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female')),
  CONSTRAINT staff_number_unique UNIQUE (school_id, employee_number),
  CONSTRAINT staff_hours_check CHECK (max_weekly_hours IS NULL OR (max_weekly_hours > 0 AND max_weekly_hours <= 60))
);
CREATE INDEX idx_staff_school_status ON public.staff(school_id, status);

CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  middle_name varchar(100),
  phone varchar(50),
  email varchar(255),
  address text,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardians_status_check CHECK (status IN ('active', 'archived'))
);
CREATE INDEX idx_guardians_school ON public.guardians(school_id);

CREATE TABLE public.student_guardians (
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  relationship varchar(20) NOT NULL DEFAULT 'guardian',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id),
  CONSTRAINT student_guardians_relationship_check CHECK (relationship IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other'))
);
CREATE INDEX idx_student_guardians_guardian ON public.student_guardians(guardian_id);

-- ----------------------------------------------------------------------------
-- 2. Academic calendar and structure
-- ----------------------------------------------------------------------------
ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE public.academic_years ADD CONSTRAINT academic_years_status_check CHECK (status IN ('planned', 'active', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'quarter',
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_kind_check CHECK (kind IN ('quarter', 'semester', 'trimester', 'term', 'exam_period', 'holiday')),
  CONSTRAINT academic_terms_dates_check CHECK (end_date >= start_date),
  CONSTRAINT academic_terms_name_unique UNIQUE (academic_year_id, name)
);
CREATE INDEX idx_academic_terms_year ON public.academic_terms(academic_year_id, start_date);

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name varchar(50) NOT NULL,
  code varchar(20),
  room_type varchar(20) NOT NULL DEFAULT 'classroom',
  capacity int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_type_check CHECK (room_type IN ('classroom', 'laboratory', 'computer_lab', 'gym', 'library', 'hall', 'workshop', 'other')),
  CONSTRAINT rooms_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT rooms_school_name_unique UNIQUE (school_id, name)
);

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS homeroom_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacity int,
  ADD COLUMN IF NOT EXISTS shift smallint NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE public.classes ADD CONSTRAINT classes_shift_check CHECK (shift IN (1, 2, 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.classes ADD CONSTRAINT classes_capacity_check CHECK (capacity IS NULL OR capacity > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS name_en varchar(200),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS default_weekly_hours numeric(4,1);

CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  teacher_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  weekly_hours numeric(4,1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_subjects_unique UNIQUE (class_id, subject_id),
  CONSTRAINT class_subjects_hours_check CHECK (weekly_hours IS NULL OR (weekly_hours > 0 AND weekly_hours <= 20))
);
CREATE INDEX idx_class_subjects_teacher ON public.class_subjects(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX idx_class_subjects_school ON public.class_subjects(school_id);

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'active',
  enrolled_on date NOT NULL DEFAULT current_date,
  left_on date,
  reason text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollments_status_check CHECK (status IN ('active', 'transferred', 'completed', 'withdrawn')),
  CONSTRAINT enrollments_dates_check CHECK (left_on IS NULL OR left_on >= enrolled_on)
);
CREATE UNIQUE INDEX idx_enrollments_one_active ON public.enrollments(student_id, academic_year_id) WHERE status = 'active';
CREATE INDEX idx_enrollments_class_status ON public.enrollments(class_id, status);
CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);

-- ----------------------------------------------------------------------------
-- 3. Assessment, grades, attendance, homework
-- ----------------------------------------------------------------------------
CREATE TABLE public.assessment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  code varchar(32) NOT NULL,
  name_tg varchar(100) NOT NULL,
  name_ru varchar(100),
  name_en varchar(100),
  weight numeric(5,2) NOT NULL DEFAULT 1,
  max_score numeric(6,2) NOT NULL DEFAULT 5,
  is_final boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_types_code_unique UNIQUE (school_id, code),
  CONSTRAINT assessment_types_code_format CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT assessment_types_values_check CHECK (weight >= 0 AND max_score > 0)
);

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE RESTRICT,
  academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE RESTRICT,
  assessment_type_id uuid NOT NULL REFERENCES public.assessment_types(id) ON DELETE RESTRICT,
  score numeric(6,2) NOT NULL,
  max_score numeric(6,2) NOT NULL,
  grade_date date NOT NULL DEFAULT current_date,
  comment text,
  status varchar(20) NOT NULL DEFAULT 'recorded',
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grades_status_check CHECK (status IN ('recorded', 'approved')),
  CONSTRAINT grades_score_check CHECK (score >= 0 AND max_score > 0 AND score <= max_score),
  CONSTRAINT grades_comment_length CHECK (comment IS NULL OR length(comment) <= 1000)
);
CREATE INDEX idx_grades_class_subject_date ON public.grades(class_subject_id, grade_date DESC);
CREATE INDEX idx_grades_student_date ON public.grades(student_id, grade_date DESC);
CREATE INDEX idx_grades_term ON public.grades(academic_term_id) WHERE academic_term_id IS NOT NULL;
CREATE INDEX idx_grades_school_date ON public.grades(school_id, grade_date DESC);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  class_subject_id uuid REFERENCES public.class_subjects(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  period_number smallint,
  status varchar(10) NOT NULL,
  minutes_late smallint,
  note varchar(500),
  marked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_status_check CHECK (status IN ('present', 'absent', 'late', 'excused')),
  CONSTRAINT attendance_late_check CHECK (minutes_late IS NULL OR (status = 'late' AND minutes_late BETWEEN 1 AND 240)),
  CONSTRAINT attendance_period_check CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 12),
  CONSTRAINT attendance_unique UNIQUE NULLS NOT DISTINCT (student_id, attendance_date, class_subject_id, period_number)
);
CREATE INDEX idx_attendance_class_date ON public.attendance_records(class_id, attendance_date);
CREATE INDEX idx_attendance_student_date ON public.attendance_records(student_id, attendance_date DESC);
CREATE INDEX idx_attendance_school_date ON public.attendance_records(school_id, attendance_date);

CREATE TABLE public.homework_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE RESTRICT,
  title varchar(300) NOT NULL,
  instructions text,
  due_at timestamptz,
  max_score numeric(6,2),
  allow_submissions boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homework_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT homework_instructions_length CHECK (instructions IS NULL OR length(instructions) <= 20000)
);
CREATE INDEX idx_homework_class_subject ON public.homework_assignments(class_subject_id, due_at DESC);
CREATE INDEX idx_homework_school_status ON public.homework_assignments(school_id, status);

CREATE TABLE public.homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.homework_assignments(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  content text,
  status varchar(20) NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz,
  score numeric(6,2),
  feedback text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homework_submissions_status_check CHECK (status IN ('submitted', 'late', 'reviewed', 'returned', 'missing')),
  CONSTRAINT homework_submissions_unique UNIQUE (assignment_id, student_id),
  CONSTRAINT homework_submissions_content_length CHECK (content IS NULL OR length(content) <= 20000)
);
CREATE INDEX idx_homework_submissions_student ON public.homework_submissions(student_id);

CREATE TABLE public.homework_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES public.homework_assignments(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.homework_submissions(id) ON DELETE CASCADE,
  storage_path varchar(500) NOT NULL,
  file_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homework_attachments_parent CHECK ((assignment_id IS NULL) <> (submission_id IS NULL)),
  CONSTRAINT homework_attachments_size CHECK (size_bytes > 0 AND size_bytes <= 26214400)
);

-- ----------------------------------------------------------------------------
-- 4. Timetable
-- ----------------------------------------------------------------------------
CREATE TABLE public.bell_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  shift smallint NOT NULL DEFAULT 1,
  period_number smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bell_periods_unique UNIQUE (school_id, shift, period_number),
  CONSTRAINT bell_periods_time_check CHECK (end_time > start_time),
  CONSTRAINT bell_periods_values_check CHECK (shift IN (1, 2, 3) AND period_number BETWEEN 1 AND 12)
);

CREATE TABLE public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  class_subject_id uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE RESTRICT,
  teacher_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  day_of_week smallint NOT NULL,
  shift smallint NOT NULL DEFAULT 1,
  period_number smallint NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timetable_day_check CHECK (day_of_week BETWEEN 1 AND 6),
  CONSTRAINT timetable_slot_check CHECK (shift IN (1, 2, 3) AND period_number BETWEEN 1 AND 12),
  -- conflict detection enforced by the database
  CONSTRAINT timetable_class_conflict UNIQUE (class_id, day_of_week, shift, period_number)
);
CREATE UNIQUE INDEX timetable_teacher_conflict
  ON public.timetable_entries(teacher_id, academic_year_id, day_of_week, shift, period_number)
  WHERE teacher_id IS NOT NULL;
CREATE UNIQUE INDEX timetable_room_conflict
  ON public.timetable_entries(room_id, academic_year_id, day_of_week, shift, period_number)
  WHERE room_id IS NOT NULL;
CREATE INDEX idx_timetable_class ON public.timetable_entries(class_id);

CREATE TABLE public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  timetable_entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  substitution_date date NOT NULL,
  substitute_teacher_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'planned',
  reason varchar(500),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substitutions_status_check CHECK (status IN ('planned', 'confirmed', 'cancelled')),
  CONSTRAINT substitutions_unique UNIQUE (timetable_entry_id, substitution_date)
);
CREATE INDEX idx_substitutions_date ON public.substitutions(school_id, substitution_date);

-- updated_at triggers for all new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','staff','guardians','academic_terms','rooms','class_subjects','enrollments',
    'assessment_types','grades','attendance_records','homework_assignments','homework_submissions',
    'bell_periods','timetable_entries','substitutions','regions','districts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Relationship helpers (cached per statement via SELECT wrappers in policies)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.my_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.staff s
  WHERE s.user_id = (SELECT auth.uid()) AND s.status IN ('active', 'on_leave')
    AND s.school_id = app.current_school_id()
$$;

CREATE OR REPLACE FUNCTION app.my_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.students s
  WHERE s.user_id = (SELECT auth.uid()) AND s.school_id = app.current_school_id()
$$;

CREATE OR REPLACE FUNCTION app.my_child_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(sg.student_id), ARRAY[]::uuid[])
  FROM public.guardians g
  JOIN public.student_guardians sg ON sg.guardian_id = g.id
  WHERE g.user_id = (SELECT auth.uid()) AND g.status = 'active'
    AND g.school_id = app.current_school_id()
$$;

CREATE OR REPLACE FUNCTION app.my_class_subject_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(cs.id), ARRAY[]::uuid[])
  FROM public.class_subjects cs
  WHERE cs.teacher_id = app.my_staff_id() AND cs.is_active
$$;

-- Classes the caller teaches in or leads as homeroom teacher.
CREATE OR REPLACE FUNCTION app.my_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::uuid[])
  FROM (
    SELECT cs.class_id AS c FROM public.class_subjects cs WHERE cs.teacher_id = app.my_staff_id() AND cs.is_active
    UNION
    SELECT cl.id FROM public.classes cl WHERE cl.homeroom_staff_id = app.my_staff_id()
  ) x
$$;

CREATE OR REPLACE FUNCTION app.my_homeroom_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(cl.id), ARRAY[]::uuid[])
  FROM public.classes cl WHERE cl.homeroom_staff_id = app.my_staff_id()
$$;

-- Active class memberships of the caller (student) or their children (guardian).
CREATE OR REPLACE FUNCTION app.my_family_class_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT e.class_id), ARRAY[]::uuid[])
  FROM public.enrollments e
  WHERE e.status = 'active'
    AND (e.student_id = app.my_student_id() OR e.student_id = ANY (app.my_child_ids()))
$$;

-- Students actively enrolled in classes the caller teaches.
CREATE OR REPLACE FUNCTION app.my_taught_student_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT e.student_id), ARRAY[]::uuid[])
  FROM public.enrollments e
  WHERE e.class_id = ANY (app.my_class_ids()) AND e.status = 'active'
$$;

CREATE OR REPLACE FUNCTION app.school_setting_int(p_school uuid, p_key text, p_default int)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT (s.settings ->> p_key)::int FROM public.schools s WHERE s.id = p_school), p_default)
$$;

GRANT EXECUTE ON FUNCTION app.my_staff_id(), app.my_student_id(), app.my_child_ids(), app.my_class_subject_ids(),
  app.my_class_ids(), app.my_homeroom_class_ids(), app.my_family_class_ids(), app.my_taught_student_ids(),
  app.school_setting_int(uuid, text, int)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Integrity triggers (same school, derived columns, status permissions)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_same_school(p_expected uuid, p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format('SELECT school_id FROM public.%I WHERE id = $1', p_table) INTO v_school USING p_id;
  IF v_school IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'cross-school reference to % rejected', p_table USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.assert_same_school(uuid, text, uuid) FROM PUBLIC, anon;
-- Invoked by SECURITY INVOKER integrity triggers on behalf of API callers.
GRANT EXECUTE ON FUNCTION app.assert_same_school(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app.validate_people_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM app.assert_same_school(NEW.school_id, 'users', NEW.user_id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'records cannot move between schools; use a transfer' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'students' AND app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status <> 'active') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
      IF NOT app.can(NEW.school_id, 'students.archive') THEN
        RAISE EXCEPTION 'changing a student status requires students.archive' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT app.can(NEW.school_id, 'users.update') THEN
      RAISE EXCEPTION 'linking accounts requires users.update' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'staff' AND app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status <> 'active') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
      IF NOT app.can(NEW.school_id, 'staff.archive') THEN
        RAISE EXCEPTION 'changing a staff status requires staff.archive' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT app.can(NEW.school_id, 'users.update') THEN
      RAISE EXCEPTION 'linking accounts requires users.update' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'students' AND TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_students BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION app.validate_people_row();
CREATE TRIGGER trg_validate_staff BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION app.validate_people_row();
CREATE TRIGGER trg_validate_guardians BEFORE INSERT OR UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION app.validate_people_row();

CREATE OR REPLACE FUNCTION app.validate_student_guardian()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'students', NEW.student_id);
  PERFORM app.assert_same_school(NEW.school_id, 'guardians', NEW.guardian_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_student_guardians BEFORE INSERT OR UPDATE ON public.student_guardians
  FOR EACH ROW EXECUTE FUNCTION app.validate_student_guardian();

CREATE OR REPLACE FUNCTION app.validate_academic_term()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
BEGIN
  SELECT * INTO v_year FROM public.academic_years WHERE id = NEW.academic_year_id;
  IF v_year.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'cross-school reference to academic_years rejected' USING ERRCODE = '23514';
  END IF;
  IF NEW.start_date < v_year.start_date OR NEW.end_date > v_year.end_date THEN
    RAISE EXCEPTION 'term dates must fall within the academic year' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_locked IS DISTINCT FROM OLD.is_locked AND app.is_api_caller()
     AND NOT app.can(NEW.school_id, 'grades.approve') THEN
    RAISE EXCEPTION 'locking a term requires grades.approve' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_academic_terms BEFORE INSERT OR UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION app.validate_academic_term();

-- Classes: homeroom teacher and room must be from the same school; archiving
-- requires classes.archive.
CREATE OR REPLACE FUNCTION app.validate_class_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'staff', NEW.homeroom_staff_id);
  PERFORM app.assert_same_school(NEW.school_id, 'rooms', NEW.room_id);
  IF app.is_api_caller() AND TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT app.can(NEW.school_id, 'classes.archive') THEN
    RAISE EXCEPTION 'archiving a class requires classes.archive' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_classes_v2 BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app.validate_class_v2();

-- The legacy trigger requires a legacy teaching role on users; homeroom is now
-- modelled through staff. Keep the legacy column valid only when set.
CREATE OR REPLACE FUNCTION public.validate_class_school()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year_school uuid;
BEGIN
  SELECT school_id INTO v_year_school FROM public.academic_years WHERE id = NEW.academic_year_id;
  IF v_year_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: academic_year must belong to same school as class';
  END IF;
  IF NEW.homeroom_teacher_id IS NOT NULL
     AND public.get_user_school_id(NEW.homeroom_teacher_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: homeroom teacher must belong to same school';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.validate_class_subject()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'classes', NEW.class_id);
  PERFORM app.assert_same_school(NEW.school_id, 'subjects', NEW.subject_id);
  PERFORM app.assert_same_school(NEW.school_id, 'staff', NEW.teacher_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_class_subjects BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION app.validate_class_subject();

-- Keep denormalized timetable teachers in sync when an assignment changes.
CREATE OR REPLACE FUNCTION app.sync_timetable_teacher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
    UPDATE public.timetable_entries SET teacher_id = NEW.teacher_id WHERE class_subject_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_timetable_teacher AFTER UPDATE OF teacher_id ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION app.sync_timetable_teacher();

CREATE OR REPLACE FUNCTION app.validate_enrollment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_class FROM public.classes WHERE id = NEW.class_id;
  IF v_class.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'cross-school reference to classes rejected' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_same_school(NEW.school_id, 'students', NEW.student_id);
  NEW.academic_year_id := v_class.academic_year_id;
  IF TG_OP = 'INSERT' AND app.is_api_caller() THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  IF NEW.status <> 'active' AND NEW.left_on IS NULL THEN
    NEW.left_on := current_date;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_enrollments BEFORE INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION app.validate_enrollment();

CREATE OR REPLACE FUNCTION app.validate_grade()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cs public.class_subjects%ROWTYPE;
  v_type public.assessment_types%ROWTYPE;
  v_term public.academic_terms%ROWTYPE;
  v_class_year uuid;
  v_privileged boolean;
BEGIN
  SELECT * INTO v_cs FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF v_cs.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'cross-school reference to class_subjects rejected' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_type FROM public.assessment_types WHERE id = NEW.assessment_type_id;
  IF v_type.school_id IS DISTINCT FROM NEW.school_id OR NOT v_type.is_active THEN
    RAISE EXCEPTION 'invalid assessment type' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_same_school(NEW.school_id, 'students', NEW.student_id);

  SELECT academic_year_id INTO v_class_year FROM public.classes WHERE id = v_cs.class_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = NEW.student_id AND e.class_id = v_cs.class_id
      AND NEW.grade_date >= e.enrolled_on AND (e.left_on IS NULL OR NEW.grade_date <= e.left_on)
  ) THEN
    RAISE EXCEPTION 'student is not enrolled in this class on the grade date' USING ERRCODE = '23514';
  END IF;

  IF NEW.academic_term_id IS NOT NULL THEN
    SELECT * INTO v_term FROM public.academic_terms WHERE id = NEW.academic_term_id;
    IF v_term.academic_year_id IS DISTINCT FROM v_class_year THEN
      RAISE EXCEPTION 'term does not belong to the class academic year' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT t.* INTO v_term FROM public.academic_terms t
    WHERE t.academic_year_id = v_class_year AND t.kind IN ('quarter', 'semester', 'trimester', 'term')
      AND NEW.grade_date BETWEEN t.start_date AND t.end_date
    ORDER BY t.start_date LIMIT 1;
    NEW.academic_term_id := v_term.id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.max_score := coalesce(NEW.max_score, v_type.max_score);
  END IF;

  IF app.is_api_caller() THEN
    v_privileged := app.can(NEW.school_id, 'grades.update');
    IF TG_OP = 'INSERT' THEN
      NEW.entered_by := (SELECT auth.uid());
      NEW.status := 'recorded';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    ELSE
      NEW.updated_by := (SELECT auth.uid());
      IF NEW.entered_by IS DISTINCT FROM OLD.entered_by OR NEW.student_id IS DISTINCT FROM OLD.student_id
         OR NEW.class_subject_id IS DISTINCT FROM OLD.class_subject_id THEN
        RAISE EXCEPTION 'grade identity fields cannot be changed' USING ERRCODE = '42501';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT app.can(NEW.school_id, 'grades.approve') THEN
          RAISE EXCEPTION 'approving grades requires grades.approve' USING ERRCODE = '42501';
        END IF;
        NEW.approved_by := CASE WHEN NEW.status = 'approved' THEN (SELECT auth.uid()) END;
        NEW.approved_at := CASE WHEN NEW.status = 'approved' THEN now() END;
      ELSIF OLD.status = 'approved' AND NOT v_privileged THEN
        RAISE EXCEPTION 'approved grades can only be corrected by authorized staff' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_term.is_locked AND NOT v_privileged THEN
      RAISE EXCEPTION 'the term is locked for grading' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_grades BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION app.validate_grade();

CREATE OR REPLACE FUNCTION app.validate_attendance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_window int;
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
    IF NEW.attendance_date > current_date THEN
      RAISE EXCEPTION 'attendance cannot be recorded for a future date' USING ERRCODE = '23514';
    END IF;
    v_window := app.school_setting_int(NEW.school_id, 'attendance_correction_days', 7);
    IF NEW.attendance_date < current_date - v_window AND NOT app.can(NEW.school_id, 'attendance.update') THEN
      RAISE EXCEPTION 'the attendance correction window has closed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_attendance BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION app.validate_attendance();

CREATE OR REPLACE FUNCTION app.validate_homework_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'class_subjects', NEW.class_subject_id);
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    NEW.published_at := now();
  END IF;
  IF app.is_api_caller() AND TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_homework_assignments BEFORE INSERT OR UPDATE ON public.homework_assignments
  FOR EACH ROW EXECUTE FUNCTION app.validate_homework_assignment();

CREATE OR REPLACE FUNCTION app.validate_homework_submission()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_assignment public.homework_assignments%ROWTYPE;
  v_is_student boolean;
BEGIN
  SELECT * INTO v_assignment FROM public.homework_assignments WHERE id = NEW.assignment_id;
  IF v_assignment.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'cross-school reference to homework_assignments rejected' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.class_subjects cs ON cs.class_id = e.class_id
    WHERE cs.id = v_assignment.class_subject_id AND e.student_id = NEW.student_id AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'student is not enrolled in the assignment class' USING ERRCODE = '23514';
  END IF;

  IF app.is_api_caller() THEN
    v_is_student := NEW.student_id = app.my_student_id();
    IF v_is_student THEN
      IF v_assignment.status <> 'published' OR NOT v_assignment.allow_submissions THEN
        RAISE EXCEPTION 'this assignment does not accept submissions' USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('submitted', 'late', 'returned') THEN
        RAISE EXCEPTION 'a reviewed submission cannot be changed' USING ERRCODE = '42501';
      END IF;
      NEW.submitted_at := now();
      NEW.status := CASE WHEN v_assignment.due_at IS NOT NULL AND now() > v_assignment.due_at THEN 'late' ELSE 'submitted' END;
      NEW.score := CASE WHEN TG_OP = 'UPDATE' THEN OLD.score END;
      NEW.feedback := CASE WHEN TG_OP = 'UPDATE' THEN OLD.feedback END;
      NEW.reviewed_by := CASE WHEN TG_OP = 'UPDATE' THEN OLD.reviewed_by END;
      NEW.reviewed_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.reviewed_at END;
    ELSE
      IF TG_OP = 'UPDATE' AND NEW.content IS DISTINCT FROM OLD.content THEN
        RAISE EXCEPTION 'reviewers cannot change submission content' USING ERRCODE = '42501';
      END IF;
      IF NEW.status IN ('reviewed', 'returned') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW.score IS DISTINCT FROM OLD.score OR NEW.feedback IS DISTINCT FROM OLD.feedback) THEN
        NEW.reviewed_by := (SELECT auth.uid());
        NEW.reviewed_at := now();
      END IF;
      IF v_assignment.max_score IS NOT NULL AND NEW.score IS NOT NULL AND (NEW.score < 0 OR NEW.score > v_assignment.max_score) THEN
        RAISE EXCEPTION 'score exceeds the assignment maximum' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_homework_submissions BEFORE INSERT OR UPDATE ON public.homework_submissions
  FOR EACH ROW EXECUTE FUNCTION app.validate_homework_submission();

CREATE OR REPLACE FUNCTION app.validate_homework_attachment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'homework_assignments', NEW.assignment_id);
  PERFORM app.assert_same_school(NEW.school_id, 'homework_submissions', NEW.submission_id);
  IF NEW.storage_path NOT LIKE NEW.school_id::text || '/%' OR NEW.storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'attachment path must be inside the school folder' USING ERRCODE = '23514';
  END IF;
  IF app.is_api_caller() THEN
    NEW.uploaded_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_homework_attachments BEFORE INSERT OR UPDATE ON public.homework_attachments
  FOR EACH ROW EXECUTE FUNCTION app.validate_homework_attachment();

CREATE OR REPLACE FUNCTION app.validate_timetable_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cs public.class_subjects%ROWTYPE;
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_cs FROM public.class_subjects WHERE id = NEW.class_subject_id;
  SELECT * INTO v_class FROM public.classes WHERE id = NEW.class_id;
  IF v_cs.class_id IS DISTINCT FROM NEW.class_id OR v_class.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'timetable entry must reference a subject of the same class and school' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_same_school(NEW.school_id, 'rooms', NEW.room_id);
  NEW.academic_year_id := v_class.academic_year_id;
  IF TG_OP = 'INSERT' OR NEW.class_subject_id IS DISTINCT FROM OLD.class_subject_id THEN
    NEW.teacher_id := v_cs.teacher_id;
  END IF;
  IF app.is_api_caller() AND TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_timetable_entries BEFORE INSERT OR UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION app.validate_timetable_entry();

CREATE OR REPLACE FUNCTION app.validate_substitution()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_entry public.timetable_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM public.timetable_entries WHERE id = NEW.timetable_entry_id;
  IF v_entry.school_id IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'cross-school reference to timetable_entries rejected' USING ERRCODE = '23514';
  END IF;
  PERFORM app.assert_same_school(NEW.school_id, 'staff', NEW.substitute_teacher_id);
  PERFORM app.assert_same_school(NEW.school_id, 'rooms', NEW.room_id);
  IF extract(isodow FROM NEW.substitution_date) <> v_entry.day_of_week THEN
    RAISE EXCEPTION 'substitution date does not match the lesson weekday' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> 'cancelled' AND NEW.substitute_teacher_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.timetable_entries te
      WHERE te.teacher_id = NEW.substitute_teacher_id AND te.academic_year_id = v_entry.academic_year_id
        AND te.day_of_week = v_entry.day_of_week AND te.shift = v_entry.shift AND te.period_number = v_entry.period_number
        AND NOT EXISTS (SELECT 1 FROM public.substitutions s2 WHERE s2.timetable_entry_id = te.id
                        AND s2.substitution_date = NEW.substitution_date AND s2.status <> 'cancelled')
    )
    OR EXISTS (
      SELECT 1 FROM public.substitutions s JOIN public.timetable_entries te ON te.id = s.timetable_entry_id
      WHERE s.substitute_teacher_id = NEW.substitute_teacher_id AND s.substitution_date = NEW.substitution_date
        AND s.status <> 'cancelled' AND s.id IS DISTINCT FROM NEW.id
        AND te.shift = v_entry.shift AND te.period_number = v_entry.period_number
    )
  ) THEN
    RAISE EXCEPTION 'the substitute teacher is already teaching at that time' USING ERRCODE = '23P01';
  END IF;
  IF app.is_api_caller() AND TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_substitutions BEFORE INSERT OR UPDATE ON public.substitutions
  FOR EACH ROW EXECUTE FUNCTION app.validate_substitution();

CREATE OR REPLACE FUNCTION app.validate_school_scoped_simple()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'academic_years' AND TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'records cannot move between schools' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Keep exactly one current academic year and mirror it into status.
CREATE OR REPLACE FUNCTION app.sync_current_academic_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_current AND (TG_OP = 'INSERT' OR NOT OLD.is_current) THEN
    UPDATE public.academic_years SET is_current = false
    WHERE school_id = NEW.school_id AND id <> NEW.id AND is_current;
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_current_academic_year ON public.academic_years;
CREATE TRIGGER trg_sync_current_academic_year BEFORE INSERT OR UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION app.sync_current_academic_year();

-- Audit of sensitive academic records (updates and deletions; inserts carry entered_by).
CREATE TRIGGER trg_audit_grades AFTER UPDATE OR DELETE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('grade', 'score', 'max_score', 'status', 'comment', 'assessment_type_id', 'grade_date');
CREATE TRIGGER trg_audit_attendance AFTER UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('attendance', 'status', 'minutes_late', 'note');
CREATE TRIGGER trg_audit_students AFTER INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('student', 'status', 'first_name', 'last_name', 'middle_name', 'date_of_birth', 'user_id');
CREATE TRIGGER trg_audit_staff AFTER INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('staff', 'status', 'first_name', 'last_name', 'staff_type', 'user_id');
CREATE TRIGGER trg_audit_enrollments AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('enrollment', 'class_id', 'status', 'left_on', 'reason');
CREATE TRIGGER trg_audit_academic_terms AFTER UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('academic_term', 'is_locked', 'start_date', 'end_date');

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'app' AND p.prorettype = 'trigger'::regtype LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Row level security
-- ----------------------------------------------------------------------------
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;

-- students
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated USING (
  app.can(school_id, 'students.view')
  OR user_id = (SELECT auth.uid())
  OR id = ANY ((SELECT app.my_child_ids())::uuid[])
);
CREATE POLICY students_insert ON public.students FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'students.create'));
CREATE POLICY students_update ON public.students FOR UPDATE TO authenticated
  USING (app.can(school_id, 'students.update') OR app.can(school_id, 'students.archive'))
  WITH CHECK (app.can(school_id, 'students.update') OR app.can(school_id, 'students.archive'));

-- staff
CREATE POLICY staff_read ON public.staff FOR SELECT TO authenticated USING (
  app.can(school_id, 'staff.view') OR user_id = (SELECT auth.uid())
);
CREATE POLICY staff_insert ON public.staff FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'staff.create'));
CREATE POLICY staff_update ON public.staff FOR UPDATE TO authenticated
  USING (app.can(school_id, 'staff.update') OR app.can(school_id, 'staff.archive'))
  WITH CHECK (app.can(school_id, 'staff.update') OR app.can(school_id, 'staff.archive'));

-- guardians
CREATE POLICY guardians_read ON public.guardians FOR SELECT TO authenticated USING (
  app.can(school_id, 'guardians.view') OR user_id = (SELECT auth.uid())
);
CREATE POLICY guardians_write ON public.guardians FOR ALL TO authenticated
  USING (app.can(school_id, 'guardians.manage')) WITH CHECK (app.can(school_id, 'guardians.manage'));

CREATE POLICY student_guardians_read ON public.student_guardians FOR SELECT TO authenticated USING (
  app.can(school_id, 'guardians.view')
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
);
CREATE POLICY student_guardians_write ON public.student_guardians FOR ALL TO authenticated
  USING (app.can(school_id, 'guardians.manage')) WITH CHECK (app.can(school_id, 'guardians.manage'));

-- academic years & terms
SELECT app.drop_policies('public', 'academic_years');
CREATE POLICY academic_years_read ON public.academic_years FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY academic_years_write ON public.academic_years FOR ALL TO authenticated
  USING (app.can(school_id, 'academic_years.manage')) WITH CHECK (app.can(school_id, 'academic_years.manage'));

CREATE POLICY academic_terms_read ON public.academic_terms FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY academic_terms_write ON public.academic_terms FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'academic_years.manage'));
CREATE POLICY academic_terms_update ON public.academic_terms FOR UPDATE TO authenticated
  USING (app.can(school_id, 'academic_years.manage') OR app.can(school_id, 'grades.approve'))
  WITH CHECK (app.can(school_id, 'academic_years.manage') OR app.can(school_id, 'grades.approve'));
CREATE POLICY academic_terms_delete ON public.academic_terms FOR DELETE TO authenticated
  USING (app.can(school_id, 'academic_years.manage')
         AND NOT EXISTS (SELECT 1 FROM public.grades g WHERE g.academic_term_id = academic_terms.id));

-- rooms
CREATE POLICY rooms_read ON public.rooms FOR SELECT TO authenticated USING (app.can_read_school(school_id));
CREATE POLICY rooms_write ON public.rooms FOR ALL TO authenticated
  USING (app.can(school_id, 'timetable.manage') OR app.can(school_id, 'classes.update'))
  WITH CHECK (app.can(school_id, 'timetable.manage') OR app.can(school_id, 'classes.update'));

-- classes
SELECT app.drop_policies('public', 'classes');
CREATE POLICY classes_read ON public.classes FOR SELECT TO authenticated USING (
  (school_id = (SELECT app.current_school_id()) AND is_active)
  OR app.can(school_id, 'classes.view')
);
CREATE POLICY classes_insert ON public.classes FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'classes.create'));
CREATE POLICY classes_update ON public.classes FOR UPDATE TO authenticated
  USING (app.can(school_id, 'classes.update') OR app.can(school_id, 'classes.archive'))
  WITH CHECK (app.can(school_id, 'classes.update') OR app.can(school_id, 'classes.archive'));

-- subjects
SELECT app.drop_policies('public', 'subjects');
CREATE POLICY subjects_read ON public.subjects FOR SELECT TO authenticated USING (
  (school_id = (SELECT app.current_school_id()) AND is_active)
  OR app.can(school_id, 'subjects.view')
);
CREATE POLICY subjects_write ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'subjects.manage'));
CREATE POLICY subjects_update ON public.subjects FOR UPDATE TO authenticated
  USING (app.can(school_id, 'subjects.manage')) WITH CHECK (app.can(school_id, 'subjects.manage'));

-- class subjects
CREATE POLICY class_subjects_read ON public.class_subjects FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY class_subjects_write ON public.class_subjects FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'subjects.manage') OR app.can(school_id, 'classes.update'));
CREATE POLICY class_subjects_update ON public.class_subjects FOR UPDATE TO authenticated
  USING (app.can(school_id, 'subjects.manage') OR app.can(school_id, 'classes.update'))
  WITH CHECK (app.can(school_id, 'subjects.manage') OR app.can(school_id, 'classes.update'));
CREATE POLICY class_subjects_delete ON public.class_subjects FOR DELETE TO authenticated USING (
  (app.can(school_id, 'subjects.manage') OR app.can(school_id, 'classes.update'))
  AND NOT EXISTS (SELECT 1 FROM public.grades g WHERE g.class_subject_id = class_subjects.id)
  AND NOT EXISTS (SELECT 1 FROM public.attendance_records a WHERE a.class_subject_id = class_subjects.id)
  AND NOT EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.class_subject_id = class_subjects.id)
);

-- enrollments
CREATE POLICY enrollments_read ON public.enrollments FOR SELECT TO authenticated USING (
  app.can(school_id, 'students.view')
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
  OR class_id = ANY ((SELECT app.my_class_ids())::uuid[])
);
CREATE POLICY enrollments_insert ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'enrollments.manage'));
CREATE POLICY enrollments_update ON public.enrollments FOR UPDATE TO authenticated
  USING (app.can(school_id, 'enrollments.manage')) WITH CHECK (app.can(school_id, 'enrollments.manage'));

-- assessment types
CREATE POLICY assessment_types_read ON public.assessment_types FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY assessment_types_write ON public.assessment_types FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'assessments.manage'));
CREATE POLICY assessment_types_update ON public.assessment_types FOR UPDATE TO authenticated
  USING (app.can(school_id, 'assessments.manage')) WITH CHECK (app.can(school_id, 'assessments.manage'));

-- grades
CREATE POLICY grades_read ON public.grades FOR SELECT TO authenticated USING (
  app.can(school_id, 'grades.view')
  OR class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
  OR (student_id = ANY ((SELECT app.my_taught_student_ids())::uuid[])
      AND EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.id = class_subject_id
                  AND cs.class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[])))
);
CREATE POLICY grades_insert ON public.grades FOR INSERT TO authenticated WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
);
CREATE POLICY grades_update ON public.grades FOR UPDATE TO authenticated USING (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
  OR app.can(school_id, 'grades.approve')
) WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('grades.enter')))
  OR app.can(school_id, 'grades.update')
  OR app.can(school_id, 'grades.approve')
);
CREATE POLICY grades_delete ON public.grades FOR DELETE TO authenticated
  USING (app.can(school_id, 'grades.update'));

-- attendance
CREATE POLICY attendance_read ON public.attendance_records FOR SELECT TO authenticated USING (
  app.can(school_id, 'attendance.view')
  OR class_id = ANY ((SELECT app.my_class_ids())::uuid[])
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
);
CREATE POLICY attendance_insert ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  (
    (SELECT app.has_own_permission('attendance.mark'))
    AND (
      (class_subject_id IS NOT NULL AND class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
      OR (class_subject_id IS NULL AND class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[]))
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
    )
  )
  OR app.can(school_id, 'attendance.update')
) WITH CHECK (
  (
    (SELECT app.has_own_permission('attendance.mark'))
    AND (
      (class_subject_id IS NOT NULL AND class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
      OR (class_subject_id IS NULL AND class_id = ANY ((SELECT app.my_homeroom_class_ids())::uuid[]))
    )
  )
  OR app.can(school_id, 'attendance.update')
);
CREATE POLICY attendance_delete ON public.attendance_records FOR DELETE TO authenticated
  USING (app.can(school_id, 'attendance.update'));

-- homework assignments
CREATE POLICY homework_read ON public.homework_assignments FOR SELECT TO authenticated USING (
  app.can(school_id, 'homework.view')
  OR class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
  OR (status = 'published' AND EXISTS (
        SELECT 1 FROM public.class_subjects cs
        WHERE cs.id = class_subject_id AND cs.class_id = ANY ((SELECT app.my_family_class_ids())::uuid[])))
);
CREATE POLICY homework_insert ON public.homework_assignments FOR INSERT TO authenticated WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('homework.create')))
  OR (app.can(school_id, 'homework.view') AND app.can(school_id, 'homework.create'))
);
CREATE POLICY homework_update ON public.homework_assignments FOR UPDATE TO authenticated USING (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('homework.create')))
  OR (app.can(school_id, 'homework.view') AND app.can(school_id, 'homework.create'))
) WITH CHECK (
  (class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('homework.create')))
  OR (app.can(school_id, 'homework.view') AND app.can(school_id, 'homework.create'))
);

-- homework submissions
CREATE POLICY homework_submissions_read ON public.homework_submissions FOR SELECT TO authenticated USING (
  app.can(school_id, 'homework.view')
  OR student_id = (SELECT app.my_student_id())
  OR student_id = ANY ((SELECT app.my_child_ids())::uuid[])
  OR EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id
             AND h.class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]))
);
CREATE POLICY homework_submissions_insert ON public.homework_submissions FOR INSERT TO authenticated WITH CHECK (
  student_id = (SELECT app.my_student_id())
  OR EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id
             AND h.class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
             AND (SELECT app.has_own_permission('homework.review')))
);
CREATE POLICY homework_submissions_update ON public.homework_submissions FOR UPDATE TO authenticated USING (
  student_id = (SELECT app.my_student_id())
  OR EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id
             AND h.class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
             AND (SELECT app.has_own_permission('homework.review')))
  OR (app.can(school_id, 'homework.view') AND app.can(school_id, 'homework.review'))
) WITH CHECK (
  student_id = (SELECT app.my_student_id())
  OR EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id
             AND h.class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[])
             AND (SELECT app.has_own_permission('homework.review')))
  OR (app.can(school_id, 'homework.view') AND app.can(school_id, 'homework.review'))
);

-- homework attachments follow their parent
CREATE POLICY homework_attachments_read ON public.homework_attachments FOR SELECT TO authenticated USING (
  (assignment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id))
  OR (submission_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.homework_submissions s WHERE s.id = submission_id))
);
CREATE POLICY homework_attachments_insert ON public.homework_attachments FOR INSERT TO authenticated WITH CHECK (
  (assignment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.homework_assignments h WHERE h.id = assignment_id
    AND ((h.class_subject_id = ANY ((SELECT app.my_class_subject_ids())::uuid[]) AND (SELECT app.has_own_permission('homework.create')))
         OR (app.can(h.school_id, 'homework.view') AND app.can(h.school_id, 'homework.create')))))
  OR (submission_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.homework_submissions s WHERE s.id = submission_id AND s.student_id = (SELECT app.my_student_id())
    AND s.status IN ('submitted', 'late', 'returned')))
);
CREATE POLICY homework_attachments_delete ON public.homework_attachments FOR DELETE TO authenticated USING (
  uploaded_by = (SELECT auth.uid())
);

-- timetable
CREATE POLICY bell_periods_read ON public.bell_periods FOR SELECT TO authenticated USING (app.can_read_school(school_id));
CREATE POLICY bell_periods_write ON public.bell_periods FOR ALL TO authenticated
  USING (app.can(school_id, 'timetable.manage')) WITH CHECK (app.can(school_id, 'timetable.manage'));

CREATE POLICY timetable_read ON public.timetable_entries FOR SELECT TO authenticated USING (app.can_read_school(school_id));
CREATE POLICY timetable_write ON public.timetable_entries FOR ALL TO authenticated
  USING (app.can(school_id, 'timetable.manage')) WITH CHECK (app.can(school_id, 'timetable.manage'));

CREATE POLICY substitutions_read ON public.substitutions FOR SELECT TO authenticated USING (app.can_read_school(school_id));
CREATE POLICY substitutions_write ON public.substitutions FOR ALL TO authenticated
  USING (app.can(school_id, 'timetable.manage')) WITH CHECK (app.can(school_id, 'timetable.manage'));

-- legacy tables become read-only views of history
SELECT app.drop_policies('public', 'class_students');
CREATE POLICY class_students_legacy_read ON public.class_students FOR SELECT TO authenticated
  USING (app.can(school_id, 'students.view'));
REVOKE INSERT, UPDATE, DELETE ON public.class_students FROM anon, authenticated;

SELECT app.drop_policies('public', 'teacher_subjects');
CREATE POLICY teacher_subjects_legacy_read ON public.teacher_subjects FOR SELECT TO authenticated
  USING (app.can(school_id, 'subjects.view'));
REVOKE INSERT, UPDATE, DELETE ON public.teacher_subjects FROM anon, authenticated;

SELECT app.drop_policies('public', 'student_enrollments');
CREATE POLICY student_enrollments_legacy_read ON public.student_enrollments FOR SELECT TO authenticated
  USING (app.can(school_id, 'students.view'));
REVOKE INSERT, UPDATE, DELETE ON public.student_enrollments FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Default assessment types for every school (configurable afterwards)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.provision_assessment_types(p_school_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.assessment_types (school_id, code, name_tg, name_ru, name_en, weight, max_score, is_final, sort_order)
  VALUES
    (p_school_id, 'classwork', 'Кори синфӣ', 'Работа на уроке', 'Classwork', 1, 5, false, 1),
    (p_school_id, 'homework', 'Вазифаи хонагӣ', 'Домашнее задание', 'Homework', 1, 5, false, 2),
    (p_school_id, 'test', 'Кори санҷишӣ', 'Контрольная работа', 'Test', 2, 5, false, 3),
    (p_school_id, 'exam', 'Имтиҳон', 'Экзамен', 'Examination', 3, 5, false, 4),
    (p_school_id, 'term_final', 'Баҳои чорякӣ', 'Четвертная оценка', 'Term grade', 0, 5, true, 5),
    (p_school_id, 'year_final', 'Баҳои солона', 'Годовая оценка', 'Annual grade', 0, 5, true, 6)
  ON CONFLICT (school_id, code) DO NOTHING
$$;
REVOKE EXECUTE ON FUNCTION app.provision_assessment_types(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.after_school_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.provision_school(NEW.id);
  PERFORM app.provision_assessment_types(NEW.id);
  RETURN NEW;
END;
$$;

SELECT app.provision_assessment_types(id) FROM public.schools;

-- ----------------------------------------------------------------------------
-- 9. Data migration from legacy structures
-- ----------------------------------------------------------------------------
INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth,
                             admission_date, status)
SELECT u.school_id, u.id, u.first_name, u.last_name, u.middle_name, u.gender, u.date_of_birth,
       u.created_at::date,
       CASE WHEN u.status = 'graduated' THEN 'graduated' WHEN u.is_active THEN 'active' ELSE 'inactive' END
FROM public.users u
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = u.id AND r.slug = 'student'
)
AND u.status NOT IN ('pending', 'rejected')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.staff (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, staff_type, status)
SELECT DISTINCT ON (u.id)
       u.school_id, u.id, u.first_name, u.last_name, u.middle_name, u.gender, u.date_of_birth,
       CASE r.slug WHEN 'director' THEN 'director' WHEN 'vice_principal' THEN 'vice_principal'
                   WHEN 'librarian' THEN 'librarian' WHEN 'admin' THEN 'administrator' ELSE 'teacher' END,
       CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END
FROM public.users u
JOIN public.user_roles ur ON ur.user_id = u.id
JOIN public.roles r ON r.id = ur.role_id
WHERE r.slug IN ('teacher', 'director', 'vice_principal', 'librarian')
  AND u.status NOT IN ('pending', 'rejected')
ORDER BY u.id, r.level
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.classes c SET homeroom_staff_id = s.id
FROM public.staff s
WHERE s.user_id = c.homeroom_teacher_id AND c.homeroom_staff_id IS NULL;

INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id)
SELECT DISTINCT ON (ts.class_id, ts.subject_id) ts.school_id, ts.class_id, ts.subject_id, s.id
FROM public.teacher_subjects ts
LEFT JOIN public.staff s ON s.user_id = ts.teacher_id
ORDER BY ts.class_id, ts.subject_id
ON CONFLICT (class_id, subject_id) DO NOTHING;

INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, status, enrolled_on)
SELECT DISTINCT ON (st.id, c.academic_year_id)
       cs.school_id, st.id, cs.class_id, c.academic_year_id, 'active', cs.enrolled_at::date
FROM public.class_students cs
JOIN public.students st ON st.user_id = cs.student_id
JOIN public.classes c ON c.id = cs.class_id
ORDER BY st.id, c.academic_year_id, cs.enrolled_at DESC
ON CONFLICT DO NOTHING;

INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, status, enrolled_on)
SELECT se.school_id, st.id, se.class_id, se.academic_year_id,
       CASE WHEN ay.is_current THEN 'active' ELSE 'completed' END, se.enrolled_at::date
FROM public.student_enrollments se
JOIN public.students st ON st.user_id = se.student_id
JOIN public.academic_years ay ON ay.id = se.academic_year_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.enrollments e WHERE e.student_id = st.id AND e.academic_year_id = se.academic_year_id
);

COMMENT ON TABLE public.class_students IS 'DEPRECATED (00024): superseded by public.enrollments. Read-only; scheduled for removal after production data verification.';
COMMENT ON TABLE public.teacher_subjects IS 'DEPRECATED (00024): superseded by public.class_subjects. Read-only; scheduled for removal after production data verification.';
COMMENT ON TABLE public.student_enrollments IS 'DEPRECATED (00024): superseded by public.enrollments. Read-only; scheduled for removal after production data verification.';
COMMENT ON COLUMN public.classes.homeroom_teacher_id IS 'DEPRECATED (00024): use homeroom_staff_id.';
