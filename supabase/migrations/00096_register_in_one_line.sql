-- ============================================================================
-- 00096 · The register as schools keep it, and an import that finishes.
--
--   1. A pupil's name in one cell: «Насаб, ном ва номи падар» — «Каримов Алӣ
--      Раҳимович», surname first, as the school's own lists are kept. The
--      words are read in that order: the first is the surname, the second the
--      name, the rest the father's name. A workbook from the old template,
--      with three columns, still reads as before.
--
--   2. One login for a pupil's parents, not two. Father and mother are both
--      still written beside the pupil and both kept on the pupil's card; the
--      account goes to one of them — the one who already has it, or else the
--      father, or else the mother. Brothers and sisters written with the same
--      telephone still share that one parent.
--
--   3. Speed. Every account's password was hashed at bcrypt cost 10, about
--      75 ms each on the school's database: a school of a thousand pupils and
--      their two parents spent four minutes on hashing alone, and the import
--      ran out of time before the end. The passwords issued to pupils and
--      staff are ten random characters (50 bits) — beyond any search at any
--      cost — so they are hashed at cost 6 (5 ms); a parent's short password
--      (two letters, six digits) keeps cost 10, where the cost is what
--      protects it. A password its owner chooses later is hashed by GoTrue
--      at its own cost, as always. With one parent account instead of two, a
--      thousand pupils now take a little over a minute.
--
--   4. The telephone lookups an import makes for every parent — and the check
--      on every new account that its number is nobody else's — went through
--      every row of the table: the indexes on the number (00077, 00081) are
--      kept for rows that have one, and the queries never said so. They do
--      now, and a hundred pupils no longer spend five seconds on it.
--
-- Run again, it changes nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. An account, with the cost of its hash chosen by the caller
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_login(p_email text, p_password text, p_cost int)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    email_change_confirm_status, is_sso_user, is_anonymous,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', least(greatest(coalesce(p_cost, 10), 4), 12))),
    NULL,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '',
    '', '',
    '', '', '',
    0, false, false,
    now(), now()
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
    NULL, now(), now()
  );

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.create_login(text, text, int) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. A parent, with or without an account of their own
-- ----------------------------------------------------------------------------
-- As 00088's app.attach_parent, with one more argument: p_account says
-- whether this parent is the one who gets the login. The other is found or
-- written, and linked to the pupil, all the same.
CREATE OR REPLACE FUNCTION app.attach_parent(
  p_school uuid,
  p_student uuid,
  p_relationship text,
  p_name text,
  p_phone text,
  p_workplace text,
  p_email text,
  p_account boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parts text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
  v_last text;
  v_first text;
  v_middle text;
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_workplace text := nullif(btrim(coalesce(p_workplace, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_rel text := CASE WHEN p_relationship IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other') THEN p_relationship ELSE 'guardian' END;
  v_guardian public.guardians%ROWTYPE;
  v_user uuid;
  v_holder uuid;
  v_holder_is_pupil boolean;
  v_password text;
  v_login text;
  v_role uuid;
BEGIN
  v_last := v_parts[1];
  v_first := coalesce(v_parts[2], v_parts[1]);
  v_middle := nullif(array_to_string(v_parts[3:], ' '), '');

  SELECT * INTO v_guardian FROM public.guardians g
  WHERE g.school_id = p_school AND g.phone IS NOT NULL AND app.phone_key(g.phone) = app.phone_key(v_phone)
  ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
  LIMIT 1;

  IF v_guardian.id IS NULL THEN
    INSERT INTO public.guardians (school_id, first_name, last_name, middle_name, phone, email, workplace)
    VALUES (p_school, v_first, v_last, v_middle, v_phone, v_email, v_workplace)
    RETURNING * INTO v_guardian;
  ELSE
    UPDATE public.guardians SET
      first_name = coalesce(v_first, first_name),
      last_name = coalesce(v_last, last_name),
      middle_name = coalesce(v_middle, middle_name),
      email = coalesce(v_email, email),
      workplace = coalesce(v_workplace, workplace),
      status = 'active',
      updated_at = now()
    WHERE id = v_guardian.id
      AND (first_name IS DISTINCT FROM coalesce(v_first, first_name)
           OR last_name IS DISTINCT FROM coalesce(v_last, last_name)
           OR middle_name IS DISTINCT FROM coalesce(v_middle, middle_name)
           OR email IS DISTINCT FROM coalesce(v_email, email)
           OR workplace IS DISTINCT FROM coalesce(v_workplace, workplace)
           OR status <> 'active')
    RETURNING * INTO v_guardian;
    IF v_guardian.id IS NULL THEN
      SELECT * INTO v_guardian FROM public.guardians g
      WHERE g.school_id = p_school AND g.phone IS NOT NULL AND app.phone_key(g.phone) = app.phone_key(v_phone)
      ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
      LIMIT 1;
    END IF;
  END IF;

  v_user := v_guardian.user_id;
  IF v_user IS NULL AND p_account THEN
    SELECT u.id, EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = u.id)
      INTO v_holder, v_holder_is_pupil
    FROM public.users u
    WHERE u.school_id = p_school AND u.phone IS NOT NULL AND app.phone_key(u.phone) = app.phone_key(v_phone)
    LIMIT 1;

    IF v_holder IS NOT NULL AND NOT v_holder_is_pupil
       AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.user_id = v_holder) THEN
      -- A teacher who is also a parent keeps the one account.
      v_user := v_holder;
    ELSE
      v_password := app.random_parent_password();
      v_user := app.create_login('p' || app.random_password(12) || '@parents.invalid', v_password);
      UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
      INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, status, is_active, credentials_issued_at)
      SELECT v_user, p_school, au.email, v_first, v_last, v_middle,
             CASE WHEN v_holder IS NULL THEN v_phone END, 'active', true, now()
      FROM auth.users au WHERE au.id = v_user;
    END IF;
    UPDATE public.guardians SET user_id = v_user, updated_at = now() WHERE id = v_guardian.id;
  END IF;

  IF v_user IS NOT NULL THEN
    SELECT r.id INTO v_role FROM public.roles r
    WHERE r.school_id = p_school AND r.is_active AND r.slug = 'parent'
    ORDER BY r.level LIMIT 1;
    IF v_role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, school_id)
      VALUES (v_user, v_role, p_school)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
  VALUES (p_student, v_guardian.id, p_school, v_rel,
          NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = p_student AND x.is_primary))
  ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship
  WHERE public.student_guardians.relationship IS DISTINCT FROM EXCLUDED.relationship;

  IF v_user IS NOT NULL THEN
    SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;
  END IF;
  RETURN jsonb_build_object('guardianId', v_guardian.id, 'login', v_login, 'password', v_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.attach_parent(uuid, uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The name in a row: one cell, or the old three
-- ----------------------------------------------------------------------------
-- {surname, name, father's name, the column a mistake is reported against}.
-- «Каримов Алӣ Раҳимович» → {Каримов, Алӣ, Раҳимович, full_name}; a father's
-- name of two words («Раҳим ӯғли») stays whole. The three cells win when they
-- are there: the portal sends them split already (templates.ts, withNames),
-- and a file of the old template has them as they were typed — a surname of
-- two words («Абдулло Зода») among them.
CREATE OR REPLACE FUNCTION app.register_names(p_row jsonb)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_full text := nullif(btrim(regexp_replace(coalesce(p_row ->> 'full_name', ''), '\s+', ' ', 'g')), '');
  v_last text := nullif(btrim(coalesce(p_row ->> 'last_name', '')), '');
  v_first text := nullif(btrim(coalesce(p_row ->> 'first_name', '')), '');
  v_middle text := nullif(btrim(coalesce(p_row ->> 'middle_name', '')), '');
  v_parts text[];
BEGIN
  IF v_last IS NOT NULL OR v_first IS NOT NULL THEN
    RETURN ARRAY[v_last, v_first, v_middle, CASE WHEN v_full IS NOT NULL THEN 'full_name' ELSE 'last_name' END];
  END IF;
  IF v_full IS NOT NULL THEN
    v_parts := string_to_array(v_full, ' ');
    RETURN ARRAY[v_parts[1], v_parts[2], nullif(array_to_string(v_parts[3:], ' '), ''), 'full_name'];
  END IF;
  -- Nothing at all: said against the one cell of the new template, or the
  -- surname of the old.
  RETURN ARRAY[NULL, NULL, NULL, CASE WHEN p_row ? 'full_name' THEN 'full_name' ELSE 'last_name' END];
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. The import (00092's, with the three changes above)
-- ----------------------------------------------------------------------------
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
  v_year_start date;
  v_moved int;
  v_total int;
  v_errors jsonb := '[]'::jsonb;
  v_credentials jsonb := '[]'::jsonb;
  v_parents jsonb := '[]'::jsonb;
  v_logins jsonb := '[]'::jsonb;
  v_new_classes text[] := ARRAY[]::text[];
  v_created int := 0;
  v_updated int := 0;

  v_row jsonb;
  v_index int;
  v_number int;

  v_login text; v_last text; v_first text; v_middle text; v_email text;
  v_phone text; v_dob date; v_gender text; v_class text; v_employee text;
  v_staff_type text; v_homeroom text; v_position text; v_subjects text;

  v_seen_login text[] := ARRAY[]::text[];
  v_seen_email text[] := ARRAY[]::text[];
  v_seen_key text[] := ARRAY[]::text[];
  v_key text;

  v_user_id uuid; v_person_id uuid; v_class_id uuid; v_role_id uuid;
  v_password text; v_public_id text; v_matches int;
  v_managed int; v_required int; v_grade int; v_placeholder boolean;
  v_full boolean;
  v_own_classes text[];
  v_prefix text;
  v_parent jsonb;
  v_existing public.users%ROWTYPE;
  v_names text[];
  v_holder text;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('students', 'staff') THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  v_full := app.can(v_school, CASE WHEN p_kind = 'students' THEN 'students.import' ELSE 'staff.create' END);
  IF NOT v_full THEN
    -- A class teacher imports the pupils of their own class, and no others.
    IF p_kind <> 'students' OR cardinality(app.my_homeroom_class_ids()) = 0 THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
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

  -- The year and its classes are there before anybody is put in one.
  v_year := app.ensure_school_basics(v_school);
  v_managed := app.parent_managed_max_grade(v_school);
  v_required := app.parent_required_max_grade(v_school);
  SELECT y.start_date INTO v_year_start FROM public.academic_years y WHERE y.id = v_year;
  IF p_kind = 'students' AND v_year IS NULL THEN
    RAISE EXCEPTION 'no_current_academic_year' USING ERRCODE = '22023';
  END IF;
  IF NOT v_full THEN
    SELECT array_agg(app.class_name_key(c.name)) INTO v_own_classes
    FROM public.classes c
    WHERE c.id = ANY (app.my_homeroom_class_ids()) AND c.academic_year_id = v_year;
    v_own_classes := coalesce(v_own_classes, ARRAY[]::text[]);
  END IF;

  -- ---------------------------------------------------------------- validate
  FOR v_index IN 0 .. v_total - 1 LOOP
    v_number := v_index + 1;
    v_row := p_rows -> v_index;

    v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
    v_names := app.register_names(v_row);
    v_last := v_names[1];
    v_first := v_names[2];
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');

    IF v_names[4] = 'full_name' THEN
      -- One cell: a surname and a name at least.
      IF v_last IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'full_name', 'code', 'required');
      ELSIF v_first IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'full_name', 'code', 'full_name_parts');
      END IF;
    ELSE
      IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'required'); END IF;
      IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'first_name', 'code', 'required'); END IF;
    END IF;

    v_grade := CASE WHEN p_kind = 'students' THEN (regexp_match(coalesce(v_class, ''), '^(\d+)'))[1]::int END;
    -- An address is never required (00092): without one the account signs in
    -- with the login the school issued, and a known one keeps what it has.
    IF v_email IS NULL THEN
      NULL;
    ELSIF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'invalid_email');
    ELSIF v_email = ANY (v_seen_email) THEN
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
      ELSIF NOT v_full AND NOT (app.class_name_key(v_class) = ANY (v_own_classes)) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'class_name', 'code', 'not_your_class');
      END IF;
      BEGIN
        v_dob := app.try_date(v_row ->> 'date_of_birth');
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'invalid_date');
      END;
      IF v_dob IS NULL AND nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'required');
      ELSIF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '30 years') THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'date_of_birth', 'code', 'out_of_range');
      END IF;
      -- The same child twice in one file, whichever class each row says.
      v_key := lower(coalesce(v_last, '')) || '|' || lower(coalesce(v_first, '')) || '|' || coalesce(v_dob::text, '');
      IF v_login IS NULL AND v_key = ANY (v_seen_key) THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', v_names[4], 'code', 'duplicate_in_file');
      ELSE
        v_seen_key := v_seen_key || v_key;
      END IF;

      -- The parents beside the pupil.
      FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
        v_errors := v_errors || app.parent_cell_errors(v_row, v_number, v_prefix);
      END LOOP;
      IF v_grade IS NOT NULL AND v_grade <= v_required
         AND nullif(btrim(coalesce(v_row ->> 'father_name', '')), '') IS NULL
         AND nullif(btrim(coalesce(v_row ->> 'mother_name', '')), '') IS NULL
         AND v_login IS NULL THEN
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'mother_name', 'code', 'guardian_required');
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
        WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
          AND app.class_name_key(c.name) = app.class_name_key(v_homeroom)
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
      'created', 0, 'updated', 0, 'credentials', '[]'::jsonb, 'parents', '[]'::jsonb, 'logins', '[]'::jsonb,
      'newClasses', to_jsonb(app.classes_to_create(v_school, v_year, p_kind, p_rows))
    );
  END IF;

  -- ------------------------------------------------------------------- write
  FOR v_index IN p_offset .. least(p_offset + p_limit, v_total) - 1 LOOP
    v_number := v_index + 1;
    v_row := p_rows -> v_index;

    v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
    v_names := app.register_names(v_row);
    v_last := v_names[1];
    v_first := v_names[2];
    v_middle := v_names[3];
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    v_gender := nullif(app.parse_gender(v_row ->> 'gender'), 'invalid');
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');
    v_position := nullif(btrim(coalesce(v_row ->> 'position', '')), '');
    v_subjects := nullif(left(btrim(coalesce(v_row ->> 'subjects', '')), 500), '');
    v_dob := CASE WHEN nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), '') IS NULL THEN NULL ELSE app.try_date(v_row ->> 'date_of_birth') END;
    v_user_id := NULL;
    v_person_id := NULL;
    v_password := NULL;

    -- 1. Who is this row about? Recognised, never made twice.
    IF v_login IS NOT NULL THEN
      SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND upper(u.public_id) = v_login;
    ELSIF p_kind = 'staff' THEN
      SELECT s.id, s.user_id INTO v_person_id, v_user_id
      FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee;
      IF v_user_id IS NULL AND v_email IS NOT NULL THEN
        SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND u.email = v_email;
      END IF;
    ELSE
      -- A pupil is the same pupil whichever class they are in now: by name
      -- and date of birth, those still at the school first, then the one in
      -- the class the row names.
      SELECT st.id, st.user_id INTO v_person_id, v_user_id
      FROM public.students st
      WHERE st.school_id = v_school
        AND lower(st.last_name) = lower(v_last)
        AND lower(st.first_name) = lower(v_first)
        AND st.date_of_birth IS NOT DISTINCT FROM v_dob
      ORDER BY (st.status = 'active') DESC,
               (app.class_name_key((SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(st.id)))
                  = app.class_name_key(v_class)) DESC NULLS LAST,
               st.created_at
      LIMIT 1;
      IF v_user_id IS NULL AND v_email IS NOT NULL THEN
        SELECT u.id INTO v_user_id FROM public.users u WHERE u.school_id = v_school AND u.email = v_email;
      END IF;
    END IF;

    -- 2. The class (1А … 11Д are always there; anything else is made).
    IF p_kind = 'students' THEN
      SELECT c.id INTO v_class_id FROM public.classes c
      WHERE c.school_id = v_school AND c.academic_year_id = v_year AND c.is_active
        AND app.class_name_key(c.name) = app.class_name_key(v_class);
      IF v_class_id IS NULL THEN
        INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
        VALUES (v_school, v_year, v_class, (regexp_match(v_class, '^(\d+)'))[1]::int)
        RETURNING id INTO v_class_id;
        v_new_classes := v_new_classes || v_class;
      END IF;
    END IF;

    -- 3. The account.
    IF v_user_id IS NULL THEN
      v_placeholder := v_email IS NULL;
      IF v_placeholder THEN
        v_email := CASE WHEN p_kind = 'staff' THEN 't' ELSE 's' END || app.random_password(12)
                   || CASE WHEN p_kind = 'staff' THEN '@staff.invalid' ELSE '@pupils.invalid' END;
      END IF;
      v_password := app.random_password();
      -- Ten random characters: cost 6 is plenty, and seventy milliseconds
      -- less a row (the header above).
      v_user_id := app.create_login(v_email, v_password, 6);
      IF v_placeholder THEN
        UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
      END IF;
      INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
                                status, is_active, credentials_issued_at)
      VALUES (v_user_id, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, 'active', true, now());
      SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_user_id;
      v_credentials := v_credentials || jsonb_build_object('row', v_number, 'login', v_public_id, 'password', v_password);
      v_created := v_created + 1;
    ELSE
      -- Known: only what the sheet says differently is written. The password
      -- is never touched; a new address has to be confirmed again.
      SELECT * INTO v_existing FROM public.users u WHERE u.id = v_user_id;
      IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_existing.email THEN
        UPDATE auth.users SET email = v_email, email_confirmed_at = NULL, updated_at = now() WHERE id = v_user_id;
        UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
        WHERE user_id = v_user_id AND provider = 'email';
      ELSE
        v_email := v_existing.email;
      END IF;
      UPDATE public.users SET
        email = v_email, first_name = v_first, last_name = v_last,
        middle_name = coalesce(v_middle, middle_name),
        phone = coalesce(v_phone, phone), date_of_birth = coalesce(v_dob, date_of_birth),
        gender = coalesce(v_gender, gender), updated_at = now()
      WHERE id = v_user_id
        AND (email IS DISTINCT FROM v_email OR first_name IS DISTINCT FROM v_first OR last_name IS DISTINCT FROM v_last
             OR middle_name IS DISTINCT FROM coalesce(v_middle, middle_name)
             OR phone IS DISTINCT FROM coalesce(v_phone, phone)
             OR date_of_birth IS DISTINCT FROM coalesce(v_dob, date_of_birth)
             OR gender IS DISTINCT FROM coalesce(v_gender, gender));
      SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_user_id;
      v_updated := v_updated + 1;
    END IF;
    v_logins := v_logins || jsonb_build_object('row', v_number, 'login', v_public_id);

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
          user_id = coalesce(user_id, v_user_id), first_name = v_first, last_name = v_last,
          middle_name = coalesce(v_middle, middle_name),
          gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
          phone = coalesce(v_phone, phone),
          -- Back at the school: a pupil who had left and is in the register again.
          status = CASE WHEN status IN ('inactive', 'transferred') THEN 'active' ELSE status END,
          updated_at = now()
        WHERE id = v_person_id;
        UPDATE public.users SET status = 'active', is_active = true, updated_at = now()
        WHERE id = v_user_id AND status = 'inactive'
          AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_person_id AND s.status = 'active');
      END IF;

      -- Moving a pupil is a transfer, not an overwrite.
      UPDATE public.enrollments SET status = 'transferred', left_on = greatest(current_date, enrolled_on), updated_at = now()
      WHERE student_id = v_person_id AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      IF NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = v_person_id AND e.academic_year_id = v_year AND e.status = 'active'
      ) THEN
        INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
        VALUES (v_school, v_person_id, v_class_id, v_year,
                CASE WHEN v_moved > 0 THEN current_date
                     ELSE least(current_date, coalesce(v_year_start, current_date)) END);
      END IF;

      -- 4b. The parents, each found or made; one login between them — the
      -- parent who already has one, or else the first written.
      v_holder := NULL;
      FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
        CONTINUE WHEN nullif(btrim(coalesce(v_row ->> (v_prefix || '_name'), '')), '') IS NULL
                   OR app.phone_key(v_row ->> (v_prefix || '_phone')) IS NULL;
        IF EXISTS (
          SELECT 1 FROM public.guardians g
          WHERE g.school_id = v_school AND g.user_id IS NOT NULL AND g.phone IS NOT NULL
            AND app.phone_key(g.phone) = app.phone_key(v_row ->> (v_prefix || '_phone'))
        ) THEN
          v_holder := v_prefix;
          EXIT;
        END IF;
        v_holder := coalesce(v_holder, v_prefix);
      END LOOP;
      FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
        CONTINUE WHEN nullif(btrim(coalesce(v_row ->> (v_prefix || '_name'), '')), '') IS NULL
                   OR app.phone_key(v_row ->> (v_prefix || '_phone')) IS NULL;
        v_parent := app.attach_parent(
          v_school, v_person_id, v_prefix,
          v_row ->> (v_prefix || '_name'), v_row ->> (v_prefix || '_phone'),
          v_row ->> (v_prefix || '_workplace'), v_row ->> (v_prefix || '_email'),
          v_prefix = v_holder);
        IF v_prefix = v_holder THEN
          v_parents := v_parents || jsonb_build_object(
            'row', v_number, 'relation', v_prefix, 'login', v_parent ->> 'login', 'password', v_parent ->> 'password');
        END IF;
      END LOOP;
    ELSE
      v_staff_type := app.parse_staff_type(v_position);
      IF v_person_id IS NULL THEN
        SELECT s.id INTO v_person_id FROM public.staff s
        WHERE s.school_id = v_school AND (s.user_id = v_user_id OR s.employee_number = v_employee)
        ORDER BY (s.user_id = v_user_id) DESC LIMIT 1;
      END IF;
      IF v_person_id IS NULL THEN
        INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender,
                                  date_of_birth, staff_type, phone, email, hire_date, subjects_note)
        VALUES (v_school, v_user_id, v_employee, v_first, v_last, v_middle, v_gender, v_dob, v_staff_type, v_phone,
                CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, current_date, v_subjects)
        RETURNING id INTO v_person_id;
      ELSE
        UPDATE public.staff SET
          user_id = coalesce(user_id, v_user_id), employee_number = v_employee,
          first_name = v_first, last_name = v_last, middle_name = coalesce(v_middle, middle_name),
          gender = coalesce(v_gender, gender), date_of_birth = coalesce(v_dob, date_of_birth),
          -- An empty «Вазифа» keeps the post the person holds.
          staff_type = CASE WHEN v_position IS NULL THEN staff_type ELSE v_staff_type END,
          phone = coalesce(v_phone, phone),
          email = coalesce(CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, email),
          subjects_note = coalesce(v_subjects, subjects_note),
          status = CASE WHEN status = 'archived' THEN 'active' ELSE status END,
          updated_at = now()
        WHERE id = v_person_id;
        SELECT s.staff_type INTO v_staff_type FROM public.staff s WHERE s.id = v_person_id;
      END IF;

      v_homeroom := app.normalize_class_name(v_row ->> 'homeroom_class');
      IF v_homeroom IS NOT NULL THEN
        -- One class per class teacher: the class named here, and no longer
        -- the one they had.
        UPDATE public.classes SET homeroom_staff_id = NULL, updated_at = now()
        WHERE school_id = v_school AND academic_year_id = v_year AND homeroom_staff_id = v_person_id
          AND app.class_name_key(name) <> app.class_name_key(v_homeroom);
        UPDATE public.classes SET homeroom_staff_id = v_person_id, updated_at = now()
        WHERE school_id = v_school AND academic_year_id = v_year AND is_active
          AND app.class_name_key(name) = app.class_name_key(v_homeroom)
          AND homeroom_staff_id IS DISTINCT FROM v_person_id;
      END IF;
    END IF;

    -- 5. The role, which is what the portal actually reads.
    SELECT r.id INTO v_role_id FROM public.roles r
    WHERE r.school_id = v_school AND r.is_active
      AND r.slug = CASE
        WHEN p_kind = 'students' THEN 'student'
        WHEN v_staff_type = 'director' THEN 'director'
        WHEN v_staff_type = 'vice_principal' THEN 'vice_principal'
        WHEN v_staff_type = 'librarian' THEN 'librarian'
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
  IF jsonb_array_length(v_credentials) > 0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_parents) p WHERE p ->> 'password' IS NOT NULL) THEN
    PERFORM app.write_audit(v_school, 'issue_credentials', p_kind, NULL, NULL, NULL,
      jsonb_build_object('count', jsonb_array_length(v_credentials),
                         'parents', (SELECT count(*) FROM jsonb_array_elements(v_parents) p WHERE p ->> 'password' IS NOT NULL)));
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 'total', v_total, 'errors', '[]'::jsonb,
    'created', v_created, 'updated', v_updated, 'credentials', v_credentials,
    'parents', v_parents, 'logins', v_logins,
    'newClasses', to_jsonb(v_new_classes)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. A number nobody else in the school has (00077), found by its index
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_unique_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.phone_key(NEW.phone) IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND app.phone_key(OLD.phone) IS NOT DISTINCT FROM app.phone_key(NEW.phone) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.school_id = NEW.school_id AND u.phone IS NOT NULL AND u.id <> NEW.id
      AND app.phone_key(u.phone) = app.phone_key(NEW.phone)
  ) THEN
    RAISE EXCEPTION 'phone_taken' USING ERRCODE = '23505', CONSTRAINT = 'users_phone_taken';
  END IF;
  RETURN NEW;
END;
$$;
