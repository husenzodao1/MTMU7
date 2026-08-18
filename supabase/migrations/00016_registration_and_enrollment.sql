-- ============================================================
-- 00016: Registration Requests, Student Enrollments, User Status History
-- ============================================================

-- 1. Add status and graduation columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'approved', 'active', 'blocked', 'graduated', 'rejected'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS graduation_year INT,
  ADD COLUMN IF NOT EXISTS graduation_date DATE,
  ADD COLUMN IF NOT EXISTS years_in_school INT;

-- 2. Registration requests table
CREATE TABLE public.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  auth_user_id UUID,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  avatar_url TEXT,
  requested_role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  requested_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  enrollment_year INT,
  additional_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registration_requests_school_status
  ON public.registration_requests(school_id, status);
CREATE INDEX idx_registration_requests_email
  ON public.registration_requests(email);
CREATE INDEX idx_registration_requests_auth_user
  ON public.registration_requests(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 3. Prevent requesting admin-level roles in registration
CREATE OR REPLACE FUNCTION public.check_registration_role_level()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.requested_role_id AND level <= 1) THEN
    RAISE EXCEPTION 'Registration cannot request admin-level roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_registration_role_level
  BEFORE INSERT OR UPDATE ON public.registration_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_registration_role_level();

-- 4. Student enrollments table
CREATE TABLE public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT student_enrollments_unique UNIQUE (student_id, academic_year_id)
);

CREATE INDEX idx_student_enrollments_school ON public.student_enrollments(school_id);
CREATE INDEX idx_student_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX idx_student_enrollments_class ON public.student_enrollments(class_id);

-- 5. User status history table (immutable)
CREATE TABLE public.user_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('registered', 'approved', 'rejected', 'role_changed',
      'class_changed', 'graduated', 'blocked', 'unblocked', 'reactivated')),
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_status_history_user ON public.user_status_history(user_id);
CREATE INDEX idx_user_status_history_school ON public.user_status_history(school_id);

-- Make user_status_history immutable (same pattern as audit_logs)
CREATE OR REPLACE FUNCTION public.prevent_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'user_status_history records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_status_history_immutable
  BEFORE UPDATE OR DELETE ON public.user_status_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_status_history_mutation();

-- 6. RLS on registration_requests
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Service role (admin client) can do everything — used during registration
-- Authenticated users can read their own requests
CREATE POLICY registration_requests_self_read ON public.registration_requests
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Admin can read all requests in their school
CREATE POLICY registration_requests_admin_read ON public.registration_requests
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can update requests in their school (approve/reject)
CREATE POLICY registration_requests_admin_update ON public.registration_requests
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 7. RLS on student_enrollments
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

-- Students can read their own enrollments
CREATE POLICY student_enrollments_self_read ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Admin can do everything in their school
CREATE POLICY student_enrollments_admin_all ON public.student_enrollments
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 8. RLS on user_status_history
ALTER TABLE public.user_status_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own history
CREATE POLICY user_status_history_self_read ON public.user_status_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin can read all in their school
CREATE POLICY user_status_history_admin_read ON public.user_status_history
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can insert history records
CREATE POLICY user_status_history_admin_insert ON public.user_status_history
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());
