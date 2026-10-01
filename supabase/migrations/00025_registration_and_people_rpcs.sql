-- ============================================================================
-- 00025 · Registration, approvals, student lifecycle and validated import.
--
-- Registration no longer needs the service role: after the user proves email
-- ownership (OTP) and holds a session, submit_registration() creates the
-- account row atomically. Findings addressed: SEC-002 (registration path),
-- SEC-009, FUN-009 (hardcoded school), FUN-014.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Invitation codes can be personal (linked to an existing people record)
-- ----------------------------------------------------------------------------
ALTER TABLE public.invitation_codes
  ADD COLUMN IF NOT EXISTS person_type varchar(10),
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note varchar(200),
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.invitation_codes ADD CONSTRAINT invitation_codes_person_check CHECK (
    (person_type IS NULL AND person_id IS NULL)
    OR (person_type IN ('student', 'staff', 'guardian') AND person_id IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.invitation_codes ALTER COLUMN code TYPE varchar(16);

CREATE OR REPLACE FUNCTION public.check_invitation_role_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id AND level = 1) THEN
    RAISE EXCEPTION 'Invitation codes cannot grant admin-level roles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Invitation role must belong to the same school';
  END IF;
  IF NEW.person_type = 'student' THEN
    PERFORM app.assert_same_school(NEW.school_id, 'students', NEW.person_id);
  ELSIF NEW.person_type = 'staff' THEN
    PERFORM app.assert_same_school(NEW.school_id, 'staff', NEW.person_id);
  ELSIF NEW.person_type = 'guardian' THEN
    PERFORM app.assert_same_school(NEW.school_id, 'guardians', NEW.person_id);
  END IF;
  PERFORM app.assert_same_school(NEW.school_id, 'classes', NEW.class_id);
  RETURN NEW;
END;
$$;

-- Registration requests may target any non-administrator role; which roles are
-- self-service is decided by school settings inside submit_registration().
CREATE OR REPLACE FUNCTION public.check_registration_role_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.requested_role_id AND level <= 1) THEN
    RAISE EXCEPTION 'Registration cannot request administrator roles';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS invitation_code_id uuid REFERENCES public.invitation_codes(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. Registration options (anonymous)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.registration_roles(p_school uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT array_agg(value) FROM public.schools s, jsonb_array_elements_text(s.settings -> 'registration_roles') AS value
     WHERE s.id = p_school AND jsonb_typeof(s.settings -> 'registration_roles') = 'array'),
    ARRAY['student', 'teacher', 'parent']
  )
$$;

CREATE OR REPLACE FUNCTION public.get_registration_options(p_school_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school public.schools%ROWTYPE;
  v_roles text[];
BEGIN
  SELECT * INTO v_school FROM public.schools WHERE slug = lower(p_school_slug) AND status = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_roles := app.registration_roles(v_school.id);
  RETURN jsonb_build_object(
    'school', jsonb_build_object('id', v_school.id, 'slug', v_school.slug, 'short_name', v_school.short_name,
      'full_name', v_school.full_name, 'logo_url', v_school.logo_url),
    'registration_open', coalesce((v_school.settings ->> 'registration_open')::boolean, true),
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
      FROM public.roles r
      WHERE r.school_id = v_school.id AND r.is_active AND r.level > 1 AND r.slug = ANY (v_roles)
    ), '[]'::jsonb),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'grade_level', c.grade_level) ORDER BY c.grade_level, c.name)
      FROM public.classes c
      JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
      WHERE c.school_id = v_school.id AND c.is_active
    ), '[]'::jsonb),
    'subjects', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_tg', s.name_tg, 'name_ru', s.name_ru, 'name_en', s.name_en) ORDER BY s.name_tg)
      FROM public.subjects s WHERE s.school_id = v_school.id AND s.is_active
    ), '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_registration_options(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Person record helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_person_record(
  p_user_id uuid,
  p_role_slug text,
  p_class_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_student_id uuid;
  v_class public.classes%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;

  IF p_role_slug = 'student' THEN
    INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, admission_date, created_by)
    VALUES (v_user.school_id, v_user.id, v_user.first_name, v_user.last_name, v_user.middle_name, v_user.gender,
            v_user.date_of_birth, current_date, p_actor)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id INTO v_student_id FROM public.students WHERE user_id = p_user_id;

    IF p_class_id IS NOT NULL THEN
      SELECT * INTO v_class FROM public.classes WHERE id = p_class_id AND school_id = v_user.school_id AND is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid class' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, created_by)
      SELECT v_user.school_id, v_student_id, v_class.id, v_class.academic_year_id, p_actor
      WHERE NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = v_student_id AND e.academic_year_id = v_class.academic_year_id AND e.status = 'active'
      );
    END IF;
  ELSIF p_role_slug IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    INSERT INTO public.staff (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, staff_type, created_by)
    VALUES (v_user.school_id, v_user.id, v_user.first_name, v_user.last_name, v_user.middle_name, v_user.gender,
            v_user.date_of_birth,
            CASE p_role_slug WHEN 'staff' THEN 'support' ELSE p_role_slug END, p_actor)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF p_role_slug = 'parent' THEN
    INSERT INTO public.guardians (school_id, user_id, first_name, last_name, middle_name, phone, email)
    VALUES (v_user.school_id, v_user.id, v_user.first_name, v_user.last_name, v_user.middle_name, v_user.phone, v_user.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.ensure_person_record(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Self-registration
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_registration(
  p_school_slug text,
  p_first_name text,
  p_last_name text,
  p_middle_name text DEFAULT NULL,
  p_role_slug text DEFAULT NULL,
  p_class_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_invitation_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_auth record;
  v_school public.schools%ROWTYPE;
  v_code public.invitation_codes%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_middle text := nullif(btrim(coalesce(p_middle_name, '')), '');
  v_details jsonb;
  v_request_id uuid;
  v_active boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT id, email, email_confirmed_at INTO v_auth FROM auth.users WHERE id = v_uid;
  IF v_auth.email IS NULL OR v_auth.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'email_not_verified' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'already_registered' USING ERRCODE = '23505';
  END IF;
  IF length(v_first) NOT BETWEEN 1 AND 100 OR length(v_last) NOT BETWEEN 1 AND 100 OR length(coalesce(v_middle, '')) > 100 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_school FROM public.schools WHERE slug = lower(p_school_slug) AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_school' USING ERRCODE = '22023';
  END IF;

  -- Whitelisted, size-limited details.
  v_details := coalesce(p_details, '{}'::jsonb);
  IF jsonb_typeof(v_details) <> 'object' OR length(v_details::text) > 4000 THEN
    RAISE EXCEPTION 'invalid_details' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_details
  FROM jsonb_each(v_details)
  WHERE key IN ('phone', 'subject_ids', 'education', 'university', 'work_start_year', 'enrollment_year', 'relationship', 'children_names');

  IF p_invitation_code IS NOT NULL AND btrim(p_invitation_code) <> '' THEN
    SELECT * INTO v_code FROM public.invitation_codes
    WHERE code = upper(btrim(p_invitation_code)) FOR UPDATE;
    IF NOT FOUND OR NOT v_code.is_active OR v_code.school_id <> v_school.id
       OR (v_code.expires_at IS NOT NULL AND v_code.expires_at < now())
       OR v_code.used_count >= v_code.max_uses THEN
      RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_role FROM public.roles WHERE id = v_code.role_id AND is_active;
    IF NOT FOUND OR v_role.level <= 1 THEN
      RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '22023';
    END IF;
    v_active := true;
  ELSE
    IF NOT coalesce((v_school.settings ->> 'registration_open')::boolean, true) THEN
      RAISE EXCEPTION 'registration_closed' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_role FROM public.roles
    WHERE school_id = v_school.id AND slug = p_role_slug AND is_active AND level > 1
      AND slug = ANY (app.registration_roles(v_school.id));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.classes c JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
    WHERE c.id = p_class_id AND c.school_id = v_school.id AND c.is_active
  ) THEN
    RAISE EXCEPTION 'invalid_class' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, status, is_active)
  VALUES (v_uid, v_school.id, v_auth.email, v_first, v_last, v_middle, left(v_details ->> 'phone', 50),
          CASE WHEN v_active THEN 'active' ELSE 'pending' END, v_active);

  INSERT INTO public.registration_requests (school_id, auth_user_id, email, first_name, last_name, middle_name,
    requested_role_id, requested_class_id, additional_data, status, invitation_code_id, reviewed_by, reviewed_at)
  VALUES (v_school.id, v_uid, v_auth.email, v_first, v_last, v_middle, v_role.id,
          coalesce(p_class_id, v_code.class_id), v_details,
          CASE WHEN v_active THEN 'approved' ELSE 'pending' END, v_code.id,
          CASE WHEN v_active THEN v_code.created_by END, CASE WHEN v_active THEN now() END)
  RETURNING id INTO v_request_id;

  INSERT INTO public.user_status_history (school_id, user_id, action, new_value, notes)
  VALUES (v_school.id, v_uid, 'registered', v_role.slug, CASE WHEN v_active THEN 'invitation' END);

  IF v_active THEN
    INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
    VALUES (v_uid, v_role.id, v_school.id, v_code.created_by);

    IF v_code.person_id IS NOT NULL THEN
      IF v_code.person_type = 'student' THEN
        UPDATE public.students SET user_id = v_uid WHERE id = v_code.person_id AND user_id IS NULL;
      ELSIF v_code.person_type = 'staff' THEN
        UPDATE public.staff SET user_id = v_uid WHERE id = v_code.person_id AND user_id IS NULL;
      ELSE
        UPDATE public.guardians SET user_id = v_uid WHERE id = v_code.person_id AND user_id IS NULL;
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '22023';
      END IF;
    ELSE
      PERFORM app.ensure_person_record(v_uid, v_role.slug, coalesce(p_class_id, v_code.class_id), v_code.created_by);
    END IF;

    UPDATE public.invitation_codes
    SET used_count = used_count + 1, last_used_at = now(),
        is_active = (used_count + 1) < max_uses
    WHERE id = v_code.id;

    INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by, notes)
    VALUES (v_school.id, v_uid, 'approved', 'pending', 'active', v_code.created_by, 'invitation');
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN v_active THEN 'active' ELSE 'pending' END, 'request_id', v_request_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Approval queue
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_registration(
  p_request_id uuid,
  p_approve boolean,
  p_role_id uuid DEFAULT NULL,
  p_class_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.registration_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.registration_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_request.school_id, 'users.approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_reviewed' USING ERRCODE = '22023';
  END IF;

  IF NOT p_approve THEN
    IF length(btrim(coalesce(p_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.registration_requests
    SET status = 'rejected', rejection_reason = left(p_reason, 500), reviewed_by = v_actor, reviewed_at = now()
    WHERE id = p_request_id;
    UPDATE public.users SET status = 'rejected', is_active = false WHERE id = v_request.auth_user_id;
    INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by, notes)
    VALUES (v_request.school_id, v_request.auth_user_id, 'rejected', 'pending', 'rejected', v_actor, left(p_reason, 500));
    RETURN;
  END IF;

  SELECT * INTO v_role FROM public.roles
  WHERE id = coalesce(p_role_id, v_request.requested_role_id) AND school_id = v_request.school_id AND is_active;
  IF NOT FOUND OR v_role.level <= 1 OR NOT app.can_grant_role(v_role.id) THEN
    RAISE EXCEPTION 'role_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users SET status = 'active', is_active = true WHERE id = v_request.auth_user_id;
  INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
  VALUES (v_request.auth_user_id, v_role.id, v_request.school_id, v_actor)
  ON CONFLICT (user_id, role_id, school_id) DO NOTHING;
  PERFORM app.ensure_person_record(v_request.auth_user_id, v_role.slug,
    CASE WHEN v_role.slug = 'student' THEN coalesce(p_class_id, v_request.requested_class_id) END, v_actor);

  UPDATE public.registration_requests
  SET status = 'approved', reviewed_by = v_actor, reviewed_at = now(), requested_role_id = v_role.id
  WHERE id = p_request_id;
  INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by)
  VALUES (v_request.school_id, v_request.auth_user_id, 'approved', 'pending', v_role.slug, v_actor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_registration(uuid, boolean, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_registration(uuid, boolean, uuid, uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Student lifecycle
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_student_class(p_student_id uuid, p_to_class_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_new uuid;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_student.school_id, 'enrollments.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_class FROM public.classes WHERE id = p_to_class_id AND school_id = v_student.school_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_class' USING ERRCODE = '22023';
  END IF;
  IF v_student.status <> 'active' THEN
    RAISE EXCEPTION 'student_not_active' USING ERRCODE = '22023';
  END IF;

  UPDATE public.enrollments
  SET status = 'transferred', left_on = current_date, reason = left(p_reason, 500)
  WHERE student_id = p_student_id AND academic_year_id = v_class.academic_year_id AND status = 'active'
    AND class_id <> p_to_class_id;

  INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, reason, created_by)
  SELECT v_student.school_id, p_student_id, p_to_class_id, v_class.academic_year_id, left(p_reason, 500), (SELECT auth.uid())
  WHERE NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = p_student_id
                    AND e.class_id = p_to_class_id AND e.status = 'active')
  RETURNING id INTO v_new;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_student_status(p_student_ids uuid[], p_status text, p_effective_date date DEFAULT current_date, p_reason text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_count int := 0;
  v_id uuid;
BEGIN
  IF p_status NOT IN ('active', 'inactive', 'transferred', 'graduated', 'archived') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_student_ids, 1), 0) > 1000 THEN
    RAISE EXCEPTION 'too_many_students' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY coalesce(p_student_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO v_student FROM public.students WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT app.can(v_student.school_id, 'students.archive') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF v_student.status = p_status THEN
      CONTINUE;
    END IF;
    IF p_status <> 'active' THEN
      UPDATE public.enrollments
      SET status = CASE WHEN p_status = 'graduated' THEN 'completed' WHEN p_status = 'transferred' THEN 'transferred' ELSE 'withdrawn' END,
          left_on = greatest(p_effective_date, enrolled_on), reason = coalesce(left(p_reason, 500), reason)
      WHERE student_id = v_id AND status = 'active';
    END IF;
    UPDATE public.students SET status = p_status WHERE id = v_id;
    IF v_student.user_id IS NOT NULL AND p_status = 'graduated' THEN
      UPDATE public.users SET status = 'graduated', graduation_year = extract(year FROM p_effective_date)::int,
        graduation_date = p_effective_date
      WHERE id = v_student.user_id;
      INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by, notes)
      VALUES (v_student.school_id, v_student.user_id, 'graduated', 'active', 'graduated', (SELECT auth.uid()), left(p_reason, 500));
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_students(p_from_class_id uuid, p_to_class_id uuid, p_student_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from public.classes%ROWTYPE;
  v_to public.classes%ROWTYPE;
  v_count int;
BEGIN
  SELECT * INTO v_from FROM public.classes WHERE id = p_from_class_id;
  SELECT * INTO v_to FROM public.classes WHERE id = p_to_class_id AND is_active;
  IF v_from.id IS NULL OR v_to.id IS NULL OR v_from.school_id <> v_to.school_id
     OR NOT app.can(v_from.school_id, 'enrollments.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_from.academic_year_id = v_to.academic_year_id THEN
    RAISE EXCEPTION 'promotion_requires_new_year' USING ERRCODE = '22023';
  END IF;

  UPDATE public.enrollments SET status = 'completed', left_on = greatest(current_date, enrolled_on)
  WHERE class_id = p_from_class_id AND status = 'active' AND student_id = ANY (p_student_ids);

  INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, created_by)
  SELECT v_to.school_id, e.student_id, v_to.id, v_to.academic_year_id, (SELECT auth.uid())
  FROM public.enrollments e
  JOIN public.students s ON s.id = e.student_id AND s.status = 'active'
  WHERE e.class_id = p_from_class_id AND e.student_id = ANY (p_student_ids)
    AND NOT EXISTS (SELECT 1 FROM public.enrollments x WHERE x.student_id = e.student_id
                    AND x.academic_year_id = v_to.academic_year_id AND x.status = 'active')
  GROUP BY e.student_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_student_class(uuid, uuid, text), public.change_student_status(uuid[], text, date, text),
  public.promote_students(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_student_class(uuid, uuid, text), public.change_student_status(uuid[], text, date, text),
  public.promote_students(uuid, uuid, uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Validated import (upload → validate → preview → confirm → import → audit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.try_date(p_value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  IF p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'bad date';
  END IF;
  RETURN p_value::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_students(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_index int := 0;
  v_dob date;
  v_admission date;
  v_class_id uuid;
  v_year_id uuid;
  v_numbers text[] := ARRAY[]::text[];
  v_created int := 0;
  v_student_id uuid;
  v_number text;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'students.import') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_year_id FROM public.academic_years WHERE school_id = v_school AND is_current;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_index := v_index + 1;
    IF length(btrim(coalesce(v_row ->> 'first_name', ''))) NOT BETWEEN 1 AND 100 THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'first_name', 'code', 'required');
    END IF;
    IF length(btrim(coalesce(v_row ->> 'last_name', ''))) NOT BETWEEN 1 AND 100 THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'last_name', 'code', 'required');
    END IF;
    IF coalesce(v_row ->> 'gender', '') NOT IN ('', 'male', 'female') THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'gender', 'code', 'invalid_enum');
    END IF;
    BEGIN
      v_dob := app.try_date(v_row ->> 'date_of_birth');
      IF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '30 years') THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'date_of_birth', 'code', 'out_of_range');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'date_of_birth', 'code', 'invalid_date');
      v_dob := NULL;
    END;
    BEGIN
      v_admission := app.try_date(v_row ->> 'admission_date');
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'admission_date', 'code', 'invalid_date');
    END;

    v_number := nullif(btrim(coalesce(v_row ->> 'student_number', '')), '');
    IF v_number IS NOT NULL THEN
      IF v_number = ANY (v_numbers) THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'student_number', 'code', 'duplicate_in_file');
      ELSIF EXISTS (SELECT 1 FROM public.students s WHERE s.school_id = v_school AND s.student_number = v_number) THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'student_number', 'code', 'duplicate_existing');
      END IF;
      v_numbers := v_numbers || v_number;
    END IF;

    IF v_dob IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students s WHERE s.school_id = v_school AND s.date_of_birth = v_dob
        AND lower(s.first_name) = lower(btrim(v_row ->> 'first_name')) AND lower(s.last_name) = lower(btrim(v_row ->> 'last_name'))
    ) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'first_name', 'code', 'duplicate_person');
    END IF;

    IF nullif(btrim(coalesce(v_row ->> 'class_name', '')), '') IS NOT NULL THEN
      SELECT c.id INTO v_class_id FROM public.classes c
      WHERE c.school_id = v_school AND c.academic_year_id = v_year_id AND c.is_active
        AND upper(c.name) = upper(btrim(v_row ->> 'class_name'));
      IF v_class_id IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'class_name', 'code', 'unknown_class');
      END IF;
    END IF;
  END LOOP;

  IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', jsonb_array_length(v_errors) = 0, 'total', jsonb_array_length(p_rows),
                              'errors', v_errors, 'created', 0);
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.students (school_id, student_number, first_name, last_name, middle_name, gender, date_of_birth,
                                 admission_date, phone, address, created_by)
    VALUES (v_school, nullif(btrim(coalesce(v_row ->> 'student_number', '')), ''), btrim(v_row ->> 'first_name'),
            btrim(v_row ->> 'last_name'), nullif(btrim(coalesce(v_row ->> 'middle_name', '')), ''),
            nullif(v_row ->> 'gender', ''), app.try_date(v_row ->> 'date_of_birth'),
            coalesce(app.try_date(v_row ->> 'admission_date'), current_date),
            left(nullif(v_row ->> 'phone', ''), 50), nullif(v_row ->> 'address', ''), (SELECT auth.uid()))
    RETURNING id INTO v_student_id;

    IF nullif(btrim(coalesce(v_row ->> 'class_name', '')), '') IS NOT NULL THEN
      INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, created_by)
      SELECT v_school, v_student_id, c.id, c.academic_year_id, (SELECT auth.uid())
      FROM public.classes c
      WHERE c.school_id = v_school AND c.academic_year_id = v_year_id AND c.is_active
        AND upper(c.name) = upper(btrim(v_row ->> 'class_name'));
    END IF;
    v_created := v_created + 1;
  END LOOP;

  PERFORM app.write_audit(v_school, 'import', 'students', NULL, NULL, jsonb_build_object('created', v_created), NULL);
  RETURN jsonb_build_object('valid', true, 'total', jsonb_array_length(p_rows), 'errors', '[]'::jsonb, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_staff(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_index int := 0;
  v_numbers text[] := ARRAY[]::text[];
  v_number text;
  v_created int := 0;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'staff.create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_index := v_index + 1;
    IF length(btrim(coalesce(v_row ->> 'first_name', ''))) NOT BETWEEN 1 AND 100 THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'first_name', 'code', 'required');
    END IF;
    IF length(btrim(coalesce(v_row ->> 'last_name', ''))) NOT BETWEEN 1 AND 100 THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'last_name', 'code', 'required');
    END IF;
    IF coalesce(v_row ->> 'staff_type', 'teacher') NOT IN ('teacher', 'director', 'vice_principal', 'librarian', 'administrator', 'support', 'other') THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'staff_type', 'code', 'invalid_enum');
    END IF;
    IF coalesce(v_row ->> 'gender', '') NOT IN ('', 'male', 'female') THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'gender', 'code', 'invalid_enum');
    END IF;
    IF coalesce(v_row ->> 'email', '') <> '' AND (v_row ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'email', 'code', 'invalid_email');
    END IF;
    BEGIN
      PERFORM app.try_date(v_row ->> 'hire_date');
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'hire_date', 'code', 'invalid_date');
    END;
    v_number := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');
    IF v_number IS NOT NULL THEN
      IF v_number = ANY (v_numbers) THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'employee_number', 'code', 'duplicate_in_file');
      ELSIF EXISTS (SELECT 1 FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_number) THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'employee_number', 'code', 'duplicate_existing');
      END IF;
      v_numbers := v_numbers || v_number;
    END IF;
  END LOOP;

  IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', jsonb_array_length(v_errors) = 0, 'total', jsonb_array_length(p_rows),
                              'errors', v_errors, 'created', 0);
  END IF;

  INSERT INTO public.staff (school_id, employee_number, first_name, last_name, middle_name, gender, staff_type, position,
                            phone, email, hire_date, created_by)
  SELECT v_school, nullif(btrim(coalesce(r ->> 'employee_number', '')), ''), btrim(r ->> 'first_name'), btrim(r ->> 'last_name'),
         nullif(btrim(coalesce(r ->> 'middle_name', '')), ''), nullif(r ->> 'gender', ''), coalesce(nullif(r ->> 'staff_type', ''), 'teacher'),
         left(nullif(r ->> 'position', ''), 200), left(nullif(r ->> 'phone', ''), 50), left(nullif(r ->> 'email', ''), 255),
         app.try_date(r ->> 'hire_date'), (SELECT auth.uid())
  FROM jsonb_array_elements(p_rows) AS r;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  PERFORM app.write_audit(v_school, 'import', 'staff', NULL, NULL, jsonb_build_object('created', v_created), NULL);
  RETURN jsonb_build_object('valid', true, 'total', jsonb_array_length(p_rows), 'errors', '[]'::jsonb, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_classes(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_index int := 0;
  v_names text[] := ARRAY[]::text[];
  v_name text;
  v_grade int;
  v_created int := 0;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'classes.create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_year FROM public.academic_years WHERE school_id = v_school AND is_current;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 300 THEN
    RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_index := v_index + 1;
    v_name := upper(btrim(coalesce(v_row ->> 'name', '')));
    IF length(v_name) NOT BETWEEN 1 AND 20 THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'name', 'code', 'required');
    ELSIF v_name = ANY (v_names) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'name', 'code', 'duplicate_in_file');
    ELSIF EXISTS (SELECT 1 FROM public.classes c WHERE c.school_id = v_school AND c.academic_year_id = v_year AND upper(c.name) = v_name) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'name', 'code', 'duplicate_existing');
    END IF;
    v_names := v_names || v_name;
    BEGIN
      v_grade := (v_row ->> 'grade_level')::int;
      IF v_grade IS NULL OR v_grade NOT BETWEEN 1 AND 11 THEN
        v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'grade_level', 'code', 'out_of_range');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'grade_level', 'code', 'invalid_number');
    END;
    IF coalesce(v_row ->> 'homeroom_employee_number', '') <> '' AND NOT EXISTS (
      SELECT 1 FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_row ->> 'homeroom_employee_number'
    ) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index, 'field', 'homeroom_employee_number', 'code', 'unknown_staff');
    END IF;
  END LOOP;

  IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', jsonb_array_length(v_errors) = 0, 'total', jsonb_array_length(p_rows),
                              'errors', v_errors, 'created', 0);
  END IF;

  INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, shift, capacity, homeroom_staff_id)
  SELECT v_school, v_year, upper(btrim(r ->> 'name')), (r ->> 'grade_level')::int,
         coalesce(nullif(r ->> 'shift', '')::smallint, 1), nullif(r ->> 'capacity', '')::int,
         (SELECT s.id FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = nullif(r ->> 'homeroom_employee_number', ''))
  FROM jsonb_array_elements(p_rows) AS r;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  PERFORM app.write_audit(v_school, 'import', 'classes', NULL, NULL, jsonb_build_object('created', v_created), NULL);
  RETURN jsonb_build_object('valid', true, 'total', jsonb_array_length(p_rows), 'errors', '[]'::jsonb, 'created', v_created);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_students(jsonb, boolean), public.import_staff(jsonb, boolean),
  public.import_classes(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_students(jsonb, boolean), public.import_staff(jsonb, boolean),
  public.import_classes(jsonb, boolean) TO authenticated;
