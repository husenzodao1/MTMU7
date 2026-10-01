-- School provisioning by the platform owner.
--
-- Until now a school could only appear through a seed or a hand-written INSERT.
-- The owner needs to add one from the administration centre: its name, its
-- photograph, its social accounts, and the address of the person who will run
-- it. Inserting the row is enough to build the school, because
-- trg_provision_school already creates its roles, permissions and assessment
-- types.

-- ----------------------------------------------------------------------------
-- 1. The nominated administrator
-- ----------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS admin_email varchar(255),
  ADD COLUMN IF NOT EXISTS admin_claimed_at timestamptz;

-- One address cannot be promised two schools.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_admin_email
  ON public.schools (lower(admin_email)) WHERE admin_email IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Creating a school
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_school(
  p_short_name text,
  p_full_name text,
  p_slug text,
  p_id_prefix text,
  p_admin_email text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_social_links jsonb DEFAULT '{}'::jsonb,
  p_code text DEFAULT NULL,
  p_region_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_prefix text := upper(btrim(coalesce(p_id_prefix, '')));
  v_email text := nullif(lower(btrim(coalesce(p_admin_email, ''))), '');
  v_links jsonb := coalesce(p_social_links, '{}'::jsonb);
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_short_name, ''))) NOT BETWEEN 1 AND 100
     OR length(btrim(coalesce(p_full_name, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) > 100 THEN
    RAISE EXCEPTION 'invalid_slug' USING ERRCODE = '22023';
  END IF;
  IF v_prefix !~ '^[A-Z0-9]{1,5}$' THEN
    RAISE EXCEPTION 'invalid_prefix' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_links) <> 'object' OR length(v_links::text) > 2000 THEN
    RAISE EXCEPTION 'invalid_details' USING ERRCODE = '22023';
  END IF;

  -- Only accounts the footer and the school page know how to render, and only
  -- over https, so a stored link can never become a javascript: payload.
  SELECT coalesce(jsonb_object_agg(t.key, t.value), '{}'::jsonb) INTO v_links
  FROM jsonb_each_text(v_links) AS t(key, value)
  WHERE t.key IN ('telegram', 'instagram', 'whatsapp', 'facebook', 'youtube')
    AND t.value ~ '^https://[^[:space:]]{3,200}$';

  IF EXISTS (SELECT 1 FROM public.schools s WHERE s.slug = v_slug) THEN
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools s WHERE s.id_prefix = v_prefix) THEN
    RAISE EXCEPTION 'prefix_taken' USING ERRCODE = '23505';
  END IF;
  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.schools s WHERE lower(s.admin_email) = v_email) THEN
    RAISE EXCEPTION 'admin_email_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.schools (short_name, full_name, slug, id_prefix, admin_email,
                              photo_url, logo_url, address, social_links, code,
                              region_id, district_id, status, is_active)
  VALUES (btrim(p_short_name), btrim(p_full_name), v_slug, v_prefix, v_email,
          nullif(btrim(coalesce(p_photo_url, '')), ''), nullif(btrim(coalesce(p_logo_url, '')), ''),
          nullif(btrim(coalesce(p_address, '')), ''), v_links, nullif(btrim(coalesce(p_code, '')), ''),
          p_region_id, p_district_id, 'active', true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.create_school(text, text, text, text, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_school(text, text, text, text, text, text, text, text, jsonb, text, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Editing what the owner set
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_school_identity(
  p_school_id uuid,
  p_photo_url text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_social_links jsonb DEFAULT NULL,
  p_admin_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_email text := nullif(lower(btrim(coalesce(p_admin_email, ''))), '');
  v_links jsonb;
BEGIN
  IF v_uid IS NULL OR NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_social_links IS NOT NULL THEN
    IF jsonb_typeof(p_social_links) <> 'object' OR length(p_social_links::text) > 2000 THEN
      RAISE EXCEPTION 'invalid_details' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_object_agg(t.key, t.value), '{}'::jsonb) INTO v_links
    FROM jsonb_each_text(p_social_links) AS t(key, value)
    WHERE t.key IN ('telegram', 'instagram', 'whatsapp', 'facebook', 'youtube')
      AND t.value ~ '^https://[^[:space:]]{3,200}$';
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.schools s WHERE lower(s.admin_email) = v_email AND s.id <> p_school_id
  ) THEN
    RAISE EXCEPTION 'admin_email_taken' USING ERRCODE = '23505';
  END IF;

  UPDATE public.schools s SET
    photo_url = coalesce(nullif(btrim(coalesce(p_photo_url, '')), ''), s.photo_url),
    logo_url = coalesce(nullif(btrim(coalesce(p_logo_url, '')), ''), s.logo_url),
    social_links = coalesce(v_links, s.social_links),
    -- A nominated address may be changed only while it is still unclaimed.
    admin_email = CASE WHEN s.admin_claimed_at IS NULL THEN coalesce(v_email, s.admin_email) ELSE s.admin_email END,
    updated_at = now()
  WHERE s.id = p_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_school' USING ERRCODE = '22023';
  END IF;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.update_school_identity(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_school_identity(uuid, text, text, jsonb, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. The public list carries each school's own artwork
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_public_schools();
CREATE FUNCTION public.list_public_schools()
RETURNS TABLE (id uuid, slug varchar, short_name varchar, full_name varchar, logo_url varchar,
               photo_url varchar, address varchar, district_id uuid, registration_open boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT s.id, s.slug, s.short_name, s.full_name, s.logo_url, s.photo_url, s.address, s.district_id,
         coalesce((s.settings ->> 'registration_open')::boolean, true)
  FROM public.schools s
  WHERE s.status = 'active'
  ORDER BY s.short_name
$fn$;
GRANT EXECUTE ON FUNCTION public.list_public_schools() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Registration recognises the nominated administrator
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
-- 6. The registration guard learns about the nomination
-- ----------------------------------------------------------------------------
-- A registration request may never ask for an administrator role: that rule
-- stands. The single exception is the address the platform owner wrote onto the
-- school when creating it, and only while that nomination is unclaimed. The
-- condition is read from the school row, never from anything the applicant
-- sends, and submit_registration closes the nomination in the same transaction.
CREATE OR REPLACE FUNCTION public.check_registration_role_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.requested_role_id AND level <= 1) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = NEW.school_id
        AND s.admin_email IS NOT NULL
        AND s.admin_claimed_at IS NULL
        AND lower(s.admin_email) = lower(NEW.email)
    ) THEN
      RAISE EXCEPTION 'Registration cannot request administrator roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
