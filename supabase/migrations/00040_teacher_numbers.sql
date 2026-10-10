-- Staff numbers, so a timetable can be built before the teachers have accounts.
--
-- The deputy head writes the timetable against a short number for each teacher
-- — "period 2, class 11A, teacher 19" — and that number is what the printed
-- timetable shows. public.staff already carries employee_number, unique within
-- a school, and its user_id is nullable, so a staff record can exist and be
-- assigned work long before the person registers.
--
-- What was missing is the join: someone registering says which number is
-- theirs, and on approval they are attached to the record that already holds
-- their classes.
--
-- The number is an identifier, never a credential. Numbers are short and easy
-- to guess, so claiming one does NOT admit anyone: the request still waits for
-- an administrator, exactly as before, and the attachment happens only when
-- that person approves it. An invitation code remains the way to skip approval.

-- ----------------------------------------------------------------------------
-- 1. Registration may carry the number
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
  v_admin_claim boolean := false;
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

  -- A school created by the platform owner names the address that is to run
  -- it. The claim is one-shot: admin_claimed_at closes it for good, so the
  -- address cannot be used again if that account is later removed.
  IF v_school.admin_email IS NOT NULL
     AND v_school.admin_claimed_at IS NULL
     AND lower(v_auth.email) = lower(v_school.admin_email)
     AND coalesce(btrim(p_invitation_code), '') = '' THEN
    v_admin_claim := true;
  END IF;

  -- Whitelisted, size-limited details.
  v_details := coalesce(p_details, '{}'::jsonb);
  IF jsonb_typeof(v_details) <> 'object' OR length(v_details::text) > 4000 THEN
    RAISE EXCEPTION 'invalid_details' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_details
  FROM jsonb_each(v_details)
  WHERE key IN ('phone', 'subject_ids', 'education', 'university', 'work_start_year', 'enrollment_year',
                'relationship', 'children_names', 'employee_number');

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
  ELSIF v_admin_claim THEN
    -- The first administrator of a new school has nobody to approve them, so
    -- this path alone may take a level 1 role and skip the open-registration
    -- switch. Only an address a super admin wrote onto the school reaches here.
    SELECT * INTO v_role FROM public.roles
    WHERE school_id = v_school.id AND slug = 'admin' AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
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
  VALUES (v_school.id, v_uid, 'registered', v_role.slug,
          CASE WHEN v_admin_claim THEN 'school_admin_claim' WHEN v_active THEN 'invitation' END);

  IF v_active THEN
    INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
    VALUES (v_uid, v_role.id, v_school.id, v_code.created_by);

    IF v_admin_claim THEN
      UPDATE public.schools SET admin_claimed_at = now()
      WHERE id = v_school.id AND admin_claimed_at IS NULL;
    END IF;

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
    VALUES (v_school.id, v_uid, 'approved', 'pending', 'active', v_code.created_by,
            CASE WHEN v_admin_claim THEN 'school_admin_claim' ELSE 'invitation' END);
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN v_active THEN 'active' ELSE 'pending' END, 'request_id', v_request_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Approval attaches the person to the record that holds their work
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
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.registration_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_number text;
  v_staff public.staff%ROWTYPE;
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

  -- The number the applicant gave, when the role is one that holds a staff
  -- record. Claiming an unattached record hands over the classes already
  -- assigned to it; a number that is unknown, or already attached to someone,
  -- simply does not match and a fresh record is created below instead.
  v_number := nullif(btrim(coalesce(v_request.additional_data ->> 'employee_number', '')), '');
  IF v_number IS NOT NULL AND v_role.slug IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    SELECT * INTO v_staff FROM public.staff s
    WHERE s.school_id = v_request.school_id
      AND s.employee_number = v_number
      AND s.user_id IS NULL
    FOR UPDATE;
    IF FOUND THEN
      -- The attachment needs no history row of its own: the staff record now
      -- names its holder, and the approval beside it says when that happened.
      UPDATE public.staff SET user_id = v_request.auth_user_id, updated_at = now() WHERE id = v_staff.id;
    END IF;
  END IF;

  -- Creates the person record when the step above did not already attach one.
  PERFORM app.ensure_person_record(v_request.auth_user_id, v_role.slug,
    CASE WHEN v_role.slug = 'student' THEN coalesce(p_class_id, v_request.requested_class_id) END, v_actor);

  -- A record created just now still deserves the number, so the timetable that
  -- names it keeps working.
  IF v_number IS NOT NULL AND v_role.slug IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    UPDATE public.staff s SET employee_number = v_number, updated_at = now()
    WHERE s.user_id = v_request.auth_user_id
      AND s.employee_number IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.staff o
        WHERE o.school_id = s.school_id AND o.employee_number = v_number AND o.id <> s.id
      );
  END IF;

  UPDATE public.registration_requests
  SET status = 'approved', reviewed_by = v_actor, reviewed_at = now(), requested_role_id = v_role.id
  WHERE id = p_request_id;
  INSERT INTO public.user_status_history (school_id, user_id, action, old_value, new_value, performed_by)
  VALUES (v_request.school_id, v_request.auth_user_id, 'approved', 'pending', v_role.slug, v_actor);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.review_registration(uuid, boolean, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_registration(uuid, boolean, uuid, uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. A number must look like one
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.staff ADD CONSTRAINT staff_employee_number_format
    CHECK (employee_number IS NULL OR employee_number ~ '^[A-Za-z0-9-]{1,32}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
