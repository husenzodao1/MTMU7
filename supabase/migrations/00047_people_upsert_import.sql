-- Importing the register from a spreadsheet, twice, and getting the same school.
--
-- The office fills in a workbook, the portal fills in the login and password
-- columns and hands it back, and the office keeps that file. When something
-- changes — a corrected surname, a new pupil in 5Б — they edit the same file and
-- import it again. So this is an upsert, not an insert: a row that is already
-- here is updated, and its password is left alone. Rotating a thousand passwords
-- because one telephone number was wrong is the failure mode that matters.
--
-- Identity is resolved in this order:
--   1. the Логин column, when the office is re-importing what we gave them;
--   2. the teacher's number, which the school already treats as an identifier;
--   3. for a pupil, class + surname + name + date of birth.
-- A login that matches nothing is an error and never a new person: a typo must
-- not quietly produce a second pupil with the same name.
--
-- Everything is validated before anything is written, and the caller sees the
-- whole list of problems at once — a spreadsheet is corrected in one pass, not
-- one row per attempt.

CREATE OR REPLACE FUNCTION app.parse_gender(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(btrim(coalesce(p_value, '')))
    WHEN '' THEN NULL
    WHEN 'писар' THEN 'male'   WHEN 'мард' THEN 'male'
    WHEN 'male' THEN 'male'    WHEN 'м' THEN 'male'   WHEN 'm' THEN 'male'
    WHEN 'духтар' THEN 'female' WHEN 'зан' THEN 'female'
    WHEN 'female' THEN 'female' WHEN 'з' THEN 'female' WHEN 'f' THEN 'female'
    ELSE 'invalid'
  END
$$;
GRANT EXECUTE ON FUNCTION app.parse_gender(text) TO authenticated;

-- The words a Tajik school writes in the Вазифа column, and the staff_type the
-- schema knows them by.
CREATE OR REPLACE FUNCTION app.parse_staff_type(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(btrim(coalesce(p_value, '')))
    WHEN '' THEN 'teacher'
    WHEN 'омӯзгор' THEN 'teacher'  WHEN 'муаллим' THEN 'teacher'  WHEN 'teacher' THEN 'teacher'
    WHEN 'директор' THEN 'director' WHEN 'director' THEN 'director'
    WHEN 'муовини директор' THEN 'vice_principal' WHEN 'муовин' THEN 'vice_principal'
    WHEN 'vice_principal' THEN 'vice_principal'
    WHEN 'китобдор' THEN 'librarian' WHEN 'librarian' THEN 'librarian'
    ELSE 'invalid'
  END
$$;
GRANT EXECUTE ON FUNCTION app.parse_staff_type(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_people(
  p_kind text,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_total int;
  v_errors jsonb := '[]'::jsonb;
  v_credentials jsonb := '[]'::jsonb;
  v_new_classes text[] := ARRAY[]::text[];
  v_created int := 0;
  v_updated int := 0;

  v_row jsonb;
  v_index int;
  v_number int;

  v_login text; v_last text; v_first text; v_middle text; v_email text;
  v_phone text; v_dob date; v_gender text; v_class text; v_employee text;
  v_staff_type text; v_homeroom text;

  v_seen_login text[] := ARRAY[]::text[];
  v_seen_email text[] := ARRAY[]::text[];
  v_seen_key text[] := ARRAY[]::text[];
  v_key text;

  v_user_id uuid; v_person_id uuid; v_class_id uuid; v_role_id uuid;
  v_password text; v_public_id text; v_matches int;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('students', 'staff') THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT app.can(v_school, CASE WHEN p_kind = 'students' THEN 'students.import' ELSE 'staff.create' END) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
  END IF;

  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023';
  END IF;
  IF v_total > 2000 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;

  v_year := app.current_year_id(v_school);
  IF p_kind = 'students' AND v_year IS NULL THEN
    RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------- validate
  FOR v_index IN 0 .. v_total - 1 LOOP
    v_number := v_index + 1;
    v_row := p_rows -> v_index;

    v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
    v_last := nullif(btrim(coalesce(v_row ->> 'last_name', '')), '');
    v_first := nullif(btrim(coalesce(v_row ->> 'first_name', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');

    IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'required'); END IF;
    IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'first_name', 'code', 'required'); END IF;

    IF v_email IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'required');
    ELSIF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'invalid_email');
    ELSIF v_email = ANY (v_seen_email) THEN
      -- One address, one account: GoTrue allows no more, so two siblings on a
      -- family address cannot both be imported. The sheet has to say which.
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_in_file');
    ELSE
      v_seen_email := v_seen_email || v_email;
    END IF;

    IF v_login IS NOT NULL THEN
      IF v_login = ANY (v_seen_login) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'login', 'code', 'duplicate_in_file');
      ELSE
        v_seen_login := v_seen_login || v_login;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.school_id = v_school AND upper(u.public_id) = v_login) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'login', 'code', 'unknown_login');
      END IF;
    END IF;

    IF p_kind = 'students' THEN
      IF v_class IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'required');
      ELSIF v_class !~ '^(1[01]|[1-9])[А-ЯЁҲҶҚҒӢӮ]?$' THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'invalid_class');
      END IF;
      BEGIN
        v_dob := app.try_date(v_row ->> 'date_of_birth');
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'invalid_date');
      END;
      IF v_dob IS NULL AND nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN
        -- Without it, two children of the same name in the same class cannot be
        -- told apart on a later import.
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'required');
      ELSIF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '30 years') THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'out_of_range');
      END IF;
      v_key := coalesce(v_class, '') || '|' || lower(coalesce(v_last, '')) || '|' || lower(coalesce(v_first, '')) || '|' || coalesce(v_dob::text, '');
      IF v_login IS NULL AND v_key = ANY (v_seen_key) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'duplicate_in_file');
      ELSE
        v_seen_key := v_seen_key || v_key;
      END IF;
    ELSE
      IF v_employee IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'required');
      ELSIF v_employee !~ '^[A-Za-z0-9-]{1,32}$' THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'invalid_number');
      ELSIF v_employee = ANY (v_seen_key) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'employee_number', 'code', 'duplicate_in_file');
      ELSE
        v_seen_key := v_seen_key || v_employee;
      END IF;
      IF app.parse_staff_type(v_row ->> 'position') = 'invalid' THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'position', 'code', 'invalid_enum');
      END IF;
      v_homeroom := app.normalize_class_name(v_row ->> 'homeroom_class');
      IF v_homeroom IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.school_id = v_school AND c.academic_year_id = v_year AND app.normalize_class_name(c.name) = v_homeroom
      ) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'homeroom_class', 'code', 'unknown_class');
      END IF;
    END IF;

    IF app.parse_gender(v_row ->> 'gender') = 'invalid' THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'gender', 'code', 'invalid_enum');
    END IF;

    -- The address must be free, unless it already belongs to the very person
    -- this row is about.
    IF v_email IS NOT NULL THEN
      SELECT count(*) INTO v_matches
      FROM public.users u
      WHERE u.email = v_email
        AND (v_login IS NULL OR upper(u.public_id) <> v_login);
      IF v_matches > 0 AND v_login IS NULL THEN
        -- Without a login this row would create somebody; the address says
        -- otherwise. Re-import the workbook we handed back, which carries it.
        SELECT count(*) INTO v_matches FROM public.users u WHERE u.email = v_email AND u.school_id = v_school;
        IF v_matches = 0 THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_existing');
        END IF;
      ELSIF v_matches > 0 THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'duplicate_existing');
      END IF;
    END IF;
  END LOOP;

  IF p_dry_run OR jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object(
      'valid', jsonb_array_length(v_errors) = 0, 'total', v_total, 'errors', v_errors,
      'created', 0, 'updated', 0, 'credentials', '[]'::jsonb,
      'newClasses', to_jsonb(app.classes_to_create(v_school, v_year, p_kind, p_rows))
    );
  END IF;

  -- ------------------------------------------------------------------- write
  FOR v_index IN p_offset .. least(p_offset + p_limit, v_total) - 1 LOOP
    v_number := v_index + 1;
    v_row := p_rows -> v_index;

    v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
    v_last := btrim(v_row ->> 'last_name');
    v_first := btrim(v_row ->> 'first_name');
    v_middle := nullif(btrim(coalesce(v_row ->> 'middle_name', '')), '');
    v_email := lower(btrim(v_row ->> 'email'));
    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    v_gender := nullif(app.parse_gender(v_row ->> 'gender'), 'invalid');
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');
    v_dob := CASE WHEN nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN NULL ELSE app.try_date(v_row ->> 'date_of_birth') END;
    v_user_id := NULL;
    v_person_id := NULL;

    -- 1. Who is this row about?
    IF v_login IS NOT NULL THEN
      SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND upper(u.public_id) = v_login;
    ELSIF p_kind = 'staff' THEN
      SELECT s.id, s.user_id INTO v_person_id, v_user_id
      FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee;
    ELSE
      SELECT st.id, st.user_id INTO v_person_id, v_user_id
      FROM public.students st
      JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active' AND e.academic_year_id = v_year
      JOIN public.classes c ON c.id = e.class_id
      WHERE st.school_id = v_school
        AND app.normalize_class_name(c.name) = v_class
        AND lower(st.last_name) = lower(v_last)
        AND lower(st.first_name) = lower(v_first)
        AND st.date_of_birth IS NOT DISTINCT FROM v_dob;
    END IF;

    -- 2. The class, made if the school has not made it yet.
    IF p_kind = 'students' THEN
      SELECT c.id INTO v_class_id FROM public.classes c
      WHERE c.school_id = v_school AND c.academic_year_id = v_year AND app.normalize_class_name(c.name) = v_class;
      IF v_class_id IS NULL THEN
        INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
        VALUES (v_school, v_year, v_class, (regexp_match(v_class, '^(\d+)'))[1]::int)
        RETURNING id INTO v_class_id;
        v_new_classes := v_new_classes || v_class;
      END IF;
    END IF;

    -- 3. The account.
    IF v_user_id IS NULL THEN
      v_password := app.random_password();
      v_user_id := app.create_login(v_email, v_password);
      INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
                                status, is_active, credentials_issued_at)
      VALUES (v_user_id, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, 'active', true, now());
      SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_user_id;
      v_credentials := v_credentials || jsonb_build_object('row', v_number, 'login', v_public_id, 'password', v_password);
      v_created := v_created + 1;
    ELSE
      -- A row we already hold keeps its password; only what the sheet says is
      -- refreshed. A changed address has to be proved again, like any other.
      UPDATE auth.users SET
        email = v_email,
        email_confirmed_at = CASE WHEN email = v_email THEN email_confirmed_at ELSE NULL END,
        updated_at = now()
      WHERE id = v_user_id;
      UPDATE public.users SET
        email = v_email, first_name = v_first, last_name = v_last, middle_name = v_middle,
        phone = coalesce(v_phone, phone), date_of_birth = coalesce(v_dob, date_of_birth),
        gender = coalesce(v_gender, gender), updated_at = now()
      WHERE id = v_user_id;
      v_updated := v_updated + 1;
    END IF;

    -- 4. The person record and what it is attached to.
    IF p_kind = 'students' THEN
      IF v_person_id IS NULL THEN
        SELECT st.id INTO v_person_id FROM public.students st WHERE st.user_id = v_user_id;
      END IF;
      IF v_person_id IS NULL THEN
        INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, phone, admission_date)
        VALUES (v_school, v_user_id, v_first, v_last, v_middle, v_gender, v_dob, v_phone, current_date)
        RETURNING id INTO v_person_id;
      ELSE
        UPDATE public.students SET
          user_id = coalesce(user_id, v_user_id), first_name = v_first, last_name = v_last, middle_name = v_middle,
          gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
          phone = coalesce(v_phone, phone), updated_at = now()
        WHERE id = v_person_id;
      END IF;

      -- Moving a pupil is a transfer, not an overwrite: the class they left is
      -- part of their record.
      UPDATE public.enrollments SET status = 'transferred', left_on = current_date
      WHERE student_id = v_person_id AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
      IF NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = v_person_id AND e.academic_year_id = v_year AND e.status = 'active'
      ) THEN
        INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id)
        VALUES (v_school, v_person_id, v_class_id, v_year);
      END IF;
    ELSE
      v_staff_type := app.parse_staff_type(v_row ->> 'position');
      IF v_person_id IS NULL THEN
        SELECT s.id INTO v_person_id FROM public.staff s
        WHERE s.school_id = v_school AND (s.user_id = v_user_id OR s.employee_number = v_employee)
        ORDER BY (s.user_id = v_user_id) DESC LIMIT 1;
      END IF;
      IF v_person_id IS NULL THEN
        INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender,
                                  date_of_birth, staff_type, phone, email, hire_date)
        VALUES (v_school, v_user_id, v_employee, v_first, v_last, v_middle, v_gender, v_dob, v_staff_type, v_phone, v_email, current_date)
        RETURNING id INTO v_person_id;
      ELSE
        UPDATE public.staff SET
          user_id = coalesce(user_id, v_user_id), employee_number = v_employee,
          first_name = v_first, last_name = v_last, middle_name = v_middle,
          gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
          staff_type = v_staff_type, phone = coalesce(v_phone, phone), email = v_email, updated_at = now()
        WHERE id = v_person_id;
      END IF;

      v_homeroom := app.normalize_class_name(v_row ->> 'homeroom_class');
      IF v_homeroom IS NOT NULL THEN
        UPDATE public.classes SET homeroom_staff_id = v_person_id, updated_at = now()
        WHERE school_id = v_school AND academic_year_id = v_year AND app.normalize_class_name(name) = v_homeroom;
      END IF;
    END IF;

    -- 5. The role, which is what the portal actually reads.
    SELECT r.id INTO v_role_id FROM public.roles r
    WHERE r.school_id = v_school AND r.is_active
      AND r.slug = CASE
        WHEN p_kind = 'students' THEN 'student'
        WHEN app.parse_staff_type(v_row ->> 'position') = 'director' THEN 'director'
        WHEN app.parse_staff_type(v_row ->> 'position') = 'vice_principal' THEN 'vice_principal'
        WHEN app.parse_staff_type(v_row ->> 'position') = 'librarian' THEN 'librarian'
        ELSE 'teacher'
      END;
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, school_id)
      VALUES (v_user_id, v_role_id, v_school)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  PERFORM app.write_audit(v_school, 'import', p_kind, NULL, NULL, NULL,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'rows', v_total));
  IF jsonb_array_length(v_credentials) > 0 THEN
    -- Issuing secrets is its own event, distinguishable in the log from the
    -- import that happened to issue them. The count only; never the passwords.
    PERFORM app.write_audit(v_school, 'issue_credentials', p_kind, NULL, NULL, NULL,
      jsonb_build_object('count', jsonb_array_length(v_credentials)));
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 'total', v_total, 'errors', '[]'::jsonb,
    'created', v_created, 'updated', v_updated, 'credentials', v_credentials,
    'newClasses', to_jsonb(v_new_classes)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) TO authenticated;

-- Which classes a dry run would bring into being. Shown before anything is
-- written, because "5Г will be created" is the moment a typo is caught.
CREATE OR REPLACE FUNCTION app.classes_to_create(p_school uuid, p_year uuid, p_kind text, p_rows jsonb)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT name ORDER BY name), ARRAY[]::text[])
  FROM (
    SELECT app.normalize_class_name(row_value ->> 'class_name') AS name
    FROM jsonb_array_elements(p_rows) AS row_value
    WHERE p_kind = 'students'
  ) candidates
  WHERE name IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.school_id = p_school AND c.academic_year_id = p_year
        AND app.normalize_class_name(c.name) = candidates.name
    )
$$;
REVOKE EXECUTE ON FUNCTION app.classes_to_create(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
