-- ============================================================================
-- 00088 · Parents come from the register; nothing is issued twice.
--
-- 1. Parents are written in one place: the pupils' workbook, a father and a
--    mother beside each pupil (name, workplace, telephone, e-mail). Nobody
--    types a parent anywhere else — not the pupil in their profile, not the
--    office in a form. Brothers and sisters written with the same telephone
--    share one parent.
-- 2. Every parent gets an account when their child is imported: the login the
--    platform issues everybody (MT10123) and a short password, two letters
--    and six digits, that can be read off a sheet and typed on a phone. The
--    workbook that comes back carries both, beside the pupil's own.
-- 3. A parent confirms themselves in the Telegram bot with that login and
--    password, and from then on hears about every one of their children.
--    The pupil's card shows each parent — who, where they work, the phone,
--    the address, whether Telegram is confirmed — to the office, the
--    director and the pupil's teachers, and to nobody else.
-- 4. Importing a workbook again never issues anything again. A pupil is
--    recognised by their login, or by their name and date of birth wherever
--    they are in the school now (a pupil moved from 5А to 5Б is the same
--    pupil), a teacher by their number or their address, a parent by their
--    telephone. Only what the sheet says differently changes; an empty cell
--    keeps what was there; logins and passwords stay as they were.
-- 5. A class teacher imports the workbook of their own class and gets the
--    same sheet back with the logins of the pupils and their parents.
-- 6. The subjects written beside a teacher in the teachers' workbook are kept
--    as information on their account. Who teaches what is decided by the
--    timetable, not by that column.
-- 7. A teacher can write to a pupil's parents through the bot.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS subjects_note varchar(500);
COMMENT ON COLUMN public.staff.subjects_note IS
  'The subjects the teachers'' workbook lists for this person: information only; the timetable decides who teaches what.';

ALTER TABLE public.guardians ADD COLUMN IF NOT EXISTS telegram_confirmed_at timestamptz;

ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS pending_guardian uuid REFERENCES public.guardians(id) ON DELETE SET NULL;

ALTER TABLE public.telegram_outbox DROP CONSTRAINT IF EXISTS telegram_outbox_kind_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_kind_check
  CHECK (kind IN ('grade', 'absence', 'digest', 'note'));

-- ----------------------------------------------------------------------------
-- 1. A password a parent can type
-- ----------------------------------------------------------------------------

/**
 * Two letters and six digits: «kp482913». The letters leave out l and o, so
 * nothing is mistaken for 1 or 0. About 29 bits, behind GoTrue's own limits
 * on attempts — plenty for an account that only reads a child's marks.
 */
CREATE OR REPLACE FUNCTION app.random_parent_password()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letters constant text := 'abcdefghijkmnpqrstuvwxyz';  -- 24
  v_bytes bytea := extensions.gen_random_bytes(16);
  v_out text := '';
  i int;
BEGIN
  FOR i IN 0 .. 1 LOOP
    v_out := v_out || substr(v_letters, (get_byte(v_bytes, i) % 24) + 1, 1);
  END LOOP;
  FOR i IN 2 .. 7 LOOP
    v_out := v_out || ((get_byte(v_bytes, i) * 256 + get_byte(v_bytes, i + 8)) % 10)::text;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.random_parent_password() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. One parent, found or made, with an account
-- ----------------------------------------------------------------------------

/**
 * The parent written beside a pupil: found by telephone among the school's
 * parents (brothers and sisters share one), or made; given an account if
 * they have none; linked to the pupil as father, mother or guardian. What the
 * row says that is new (a workplace, an address) is written; an empty cell
 * changes nothing.
 *
 * A parent whose telephone already belongs to a member of staff is that
 * member of staff: their own account becomes a parent's too, and no second
 * login is made. A telephone that belongs to a pupil (the family phone
 * written on the child) stays on the child; the parent's account is made
 * without it.
 *
 * Returns { guardianId, login, password } — the password only when it was
 * just issued.
 */
CREATE OR REPLACE FUNCTION app.attach_parent(
  p_school uuid,
  p_student uuid,
  p_relationship text,
  p_name text,
  p_phone text,
  p_workplace text,
  p_email text
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
  WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
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
      WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
      ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
      LIMIT 1;
    END IF;
  END IF;

  v_user := v_guardian.user_id;
  IF v_user IS NULL THEN
    SELECT u.id, EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = u.id)
      INTO v_holder, v_holder_is_pupil
    FROM public.users u
    WHERE u.school_id = p_school AND app.phone_key(u.phone) = app.phone_key(v_phone)
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

  SELECT r.id INTO v_role FROM public.roles r
  WHERE r.school_id = p_school AND r.is_active AND r.slug = 'parent'
  ORDER BY r.level LIMIT 1;
  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, school_id)
    VALUES (v_user, v_role, p_school)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
  VALUES (p_student, v_guardian.id, p_school, v_rel,
          NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = p_student AND x.is_primary))
  ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship
  WHERE public.student_guardians.relationship IS DISTINCT FROM EXCLUDED.relationship;

  SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;
  RETURN jsonb_build_object('guardianId', v_guardian.id, 'login', v_login, 'password', v_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.attach_parent(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The register workbook
-- ----------------------------------------------------------------------------

/** The parents' cells of one workbook row: what is wrong with them. */
CREATE OR REPLACE FUNCTION app.parent_cell_errors(p_row jsonb, p_number int, p_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_name text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_name'), '')), '');
  v_phone text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_phone'), '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_row ->> (p_prefix || '_email'), ''))), '');
BEGIN
  IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$' OR length(regexp_replace(v_phone, '\D', '', 'g')) < 5) THEN
    v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'invalid_phone');
  END IF;
  IF v_phone IS NOT NULL AND v_name IS NULL THEN
    v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'required');
  END IF;
  IF v_name IS NOT NULL AND v_phone IS NULL THEN
    -- The telephone is how a parent is known again, and how brothers and
    -- sisters find the parent they share.
    v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'required');
  END IF;
  IF v_name IS NOT NULL AND (array_length(regexp_split_to_array(btrim(v_name), '\s+'), 1) < 2 OR length(v_name) > 200) THEN
    v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'guardian_name');
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_email', 'code', 'invalid_email');
  END IF;
  RETURN v_errors;
END;
$$;

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
    v_last := nullif(btrim(coalesce(v_row ->> 'last_name', '')), '');
    v_first := nullif(btrim(coalesce(v_row ->> 'first_name', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    v_class := app.normalize_class_name(v_row ->> 'class_name');
    v_employee := nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '');

    IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'required'); END IF;
    IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'first_name', 'code', 'required'); END IF;

    v_grade := CASE WHEN p_kind = 'students' THEN (regexp_match(coalesce(v_class, ''), '^(\d+)'))[1]::int END;
    IF v_email IS NULL AND p_kind = 'students' AND v_grade IS NOT NULL AND v_grade <= v_managed THEN
      NULL;
    ELSIF v_email IS NULL AND p_kind = 'students' AND v_login IS NOT NULL THEN
      -- A pupil the school already holds keeps the address it has.
      NULL;
    ELSIF v_email IS NULL THEN
      v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'email', 'code', 'required');
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
        v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'last_name', 'code', 'duplicate_in_file');
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
    v_last := btrim(v_row ->> 'last_name');
    v_first := btrim(v_row ->> 'first_name');
    v_middle := nullif(btrim(coalesce(v_row ->> 'middle_name', '')), '');
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
        v_email := 's' || app.random_password(12) || '@pupils.invalid';
      END IF;
      v_password := app.random_password();
      v_user_id := app.create_login(v_email, v_password);
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

      -- 4b. The parents, each found or made, with their own login.
      FOREACH v_prefix IN ARRAY ARRAY['father', 'mother'] LOOP
        CONTINUE WHEN nullif(btrim(coalesce(v_row ->> (v_prefix || '_name'), '')), '') IS NULL
                   OR app.phone_key(v_row ->> (v_prefix || '_phone')) IS NULL;
        v_parent := app.attach_parent(
          v_school, v_person_id, v_prefix,
          v_row ->> (v_prefix || '_name'), v_row ->> (v_prefix || '_phone'),
          v_row ->> (v_prefix || '_workplace'), v_row ->> (v_prefix || '_email'));
        v_parents := v_parents || jsonb_build_object(
          'row', v_number, 'relation', v_prefix, 'login', v_parent ->> 'login', 'password', v_parent ->> 'password');
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

-- The old second step is folded into import_people; a deployment that still
-- calls it gets nothing done twice.
CREATE OR REPLACE FUNCTION public.import_guardians(p_rows jsonb)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 0
$$;

-- ----------------------------------------------------------------------------
-- 4. Nobody else writes parents
-- ----------------------------------------------------------------------------

-- A pupil no longer enters their parents; the register does.
CREATE OR REPLACE FUNCTION public.save_my_guardian(
  p_relationship text,
  p_last_name text,
  p_first_name text,
  p_middle_name text DEFAULT NULL,
  p_birth_year int DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_workplace text DEFAULT NULL,
  p_guardian_id uuid DEFAULT NULL,
  p_sibling_of uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_my_guardian(p_guardian_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

-- A pupil's parents' details are for the office, the director and the
-- pupil's teachers (student_parents below), not for the pupil's own page.
REVOKE EXECUTE ON FUNCTION public.my_guardians() FROM authenticated;

-- ----------------------------------------------------------------------------
-- 5. The pupil's parents, for those who may see them
-- ----------------------------------------------------------------------------

/** May the caller see this pupil's parents: the office and the director, the class teacher, a teacher of the pupil. */
CREATE OR REPLACE FUNCTION app.may_see_parents(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student AND s.school_id = app.current_school_id()
      AND (app.can(s.school_id, 'students.view')
           OR app.can(s.school_id, 'guardians.view')
           OR app.student_current_class(s.id) = ANY (app.my_homeroom_class_ids())
           OR s.id = ANY (app.my_taught_student_ids()))
  )
$$;
GRANT EXECUTE ON FUNCTION app.may_see_parents(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_parents(p_student uuid)
RETURNS TABLE (
  guardian_id uuid, relationship text, last_name text, first_name text, middle_name text,
  workplace text, phone text, email text, login text, telegram_confirmed_at timestamptz,
  telegram_chats int, children int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.may_see_parents(p_student) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.id, sg.relationship::text, g.last_name::text, g.first_name::text, g.middle_name::text,
         g.workplace::text, g.phone::text, g.email::text, u.public_id::text, g.telegram_confirmed_at,
         (SELECT count(*)::int FROM public.telegram_children tc WHERE tc.student_id = p_student),
         (SELECT count(*)::int FROM public.student_guardians o WHERE o.guardian_id = g.id)
  FROM public.student_guardians sg
  JOIN public.guardians g ON g.id = sg.guardian_id
  LEFT JOIN public.users u ON u.id = g.user_id
  WHERE sg.student_id = p_student AND g.status = 'active'
  ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.student_parents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_parents(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. A teacher writes to the parents through the bot
-- ----------------------------------------------------------------------------

/**
 * Queues a teacher's note to every Telegram chat that follows the pupil.
 * Returns how many chats it goes to (0: no parent has confirmed yet).
 */
CREATE OR REPLACE FUNCTION public.send_parent_note(p_student uuid, p_text text)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_author text;
  v_count int;
BEGIN
  IF NOT app.may_see_parents(p_student) OR NOT app.is_staff_member() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_text) < 2 OR length(v_text) > 2000 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  SELECT s.school_id INTO v_school FROM public.students s WHERE s.id = p_student;
  SELECT btrim(u.last_name || ' ' || u.first_name || ' ' || coalesce(u.middle_name, '')) INTO v_author
  FROM public.users u WHERE u.id = (SELECT auth.uid());

  INSERT INTO public.telegram_outbox (chat_id, school_id, student_id, kind, payload, dedupe_key, send_after)
  SELECT tc.chat_id, v_school, p_student, 'note',
         jsonb_build_object('text', v_text, 'from', v_author),
         'note:' || gen_random_uuid()::text, now()
  FROM public.telegram_children tc
  WHERE tc.student_id = p_student;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM app.write_audit(v_school, 'parent_note', 'student', p_student, NULL, NULL, jsonb_build_object('chats', v_count));
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_parent_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_parent_note(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. The bot: a parent signs in with their own login
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.telegram_find_child(p_chat bigint, p_needle text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_needle text := btrim(coalesce(p_needle, ''));
  v_student uuid;
  v_school uuid;
  v_guardian uuid;
  v_matches int;
BEGIN
  IF v_needle = '' OR length(v_needle) > 64 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- A parent's own login: the password comes next, and with it every child.
  SELECT g.id, g.school_id INTO v_guardian, v_school
  FROM public.guardians g
  JOIN public.users u ON u.id = g.user_id
  WHERE upper(u.public_id) = upper(v_needle) AND g.status = 'active'
    AND u.status NOT IN ('blocked', 'rejected')
    AND EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.guardian_id = g.id)
  LIMIT 1;
  IF v_guardian IS NOT NULL THEN
    UPDATE public.telegram_chats
    SET state = 'awaiting_code', pending_guardian = v_guardian, pending_student = NULL,
        school_id = coalesce(school_id, v_school), updated_at = now()
    WHERE chat_id = p_chat;
    RETURN jsonb_build_object('found', true, 'noCode', false, 'parent', true);
  END IF;

  SELECT count(*) INTO v_matches
  FROM public.students st
  JOIN public.users u ON u.id = st.user_id
  WHERE st.status = 'active'
    AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));

  IF v_matches <> 1 THEN
    RETURN jsonb_build_object('found', false, 'ambiguous', v_matches > 1);
  END IF;

  SELECT st.id, st.school_id INTO v_student, v_school
  FROM public.students st
  JOIN public.users u ON u.id = st.user_id
  WHERE st.status = 'active'
    AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));

  IF NOT EXISTS (SELECT 1 FROM public.parent_codes pc WHERE pc.student_id = v_student) THEN
    RETURN jsonb_build_object('found', true, 'noCode', true);
  END IF;

  UPDATE public.telegram_chats
  SET state = 'awaiting_code', pending_student = v_student, pending_guardian = NULL,
      school_id = coalesce(school_id, v_school), updated_at = now()
  WHERE chat_id = p_chat;

  RETURN jsonb_build_object('found', true, 'noCode', false, 'parent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_confirm_child(p_chat bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat public.telegram_chats%ROWTYPE;
  v_hash text;
  v_student uuid;
  v_ok boolean := false;
BEGIN
  SELECT * INTO v_chat FROM public.telegram_chats WHERE chat_id = p_chat;
  IF v_chat.chat_id IS NULL OR (v_chat.pending_student IS NULL AND v_chat.pending_guardian IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending');
  END IF;
  IF v_chat.blocked_until IS NOT NULL AND v_chat.blocked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
  END IF;

  IF v_chat.pending_guardian IS NOT NULL THEN
    -- The parent's own password, checked the way GoTrue checks it.
    SELECT au.encrypted_password INTO v_hash
    FROM public.guardians g JOIN auth.users au ON au.id = g.user_id
    WHERE g.id = v_chat.pending_guardian;
    v_ok := v_hash IS NOT NULL AND v_hash <> '' AND extensions.crypt(btrim(coalesce(p_code, '')), v_hash) = v_hash;
  ELSE
    v_student := v_chat.pending_student;
    SELECT pc.code_hash INTO v_hash FROM public.parent_codes pc WHERE pc.student_id = v_student;
    v_ok := v_hash IS NOT NULL AND extensions.crypt(btrim(coalesce(p_code, '')), v_hash) = v_hash;
  END IF;

  IF NOT v_ok THEN
    UPDATE public.telegram_chats
    SET attempts = attempts + 1,
        blocked_until = CASE WHEN attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE blocked_until END,
        updated_at = now()
    WHERE chat_id = p_chat;
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong');
  END IF;

  IF v_chat.pending_guardian IS NOT NULL THEN
    INSERT INTO public.telegram_children (chat_id, student_id, school_id)
    SELECT p_chat, st.id, st.school_id
    FROM public.student_guardians sg JOIN public.students st ON st.id = sg.student_id AND st.status = 'active'
    WHERE sg.guardian_id = v_chat.pending_guardian
    ON CONFLICT DO NOTHING;
    UPDATE public.guardians SET telegram_confirmed_at = coalesce(telegram_confirmed_at, now()), updated_at = now()
    WHERE id = v_chat.pending_guardian;
  ELSE
    INSERT INTO public.telegram_children (chat_id, student_id, school_id)
    SELECT p_chat, v_student, st.school_id FROM public.students st WHERE st.id = v_student
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.telegram_chats
  SET state = 'idle', pending_student = NULL, pending_guardian = NULL, attempts = 0, blocked_until = NULL, updated_at = now()
  WHERE chat_id = p_chat;

  RETURN jsonb_build_object(
    'ok', true,
    'child', (
      SELECT jsonb_build_object('id', st.id, 'name', st.last_name || ' ' || st.first_name, 'class', c.name)
      FROM public.students st
      LEFT JOIN public.classes c ON c.id = app.student_current_class(st.id)
      WHERE st.id = coalesce(v_student, (
        SELECT sg.student_id FROM public.student_guardians sg JOIN public.students s2 ON s2.id = sg.student_id
        WHERE sg.guardian_id = v_chat.pending_guardian AND s2.status = 'active'
        ORDER BY s2.last_name, s2.first_name LIMIT 1))
    ),
    'children', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.last_name || ' ' || st.first_name, 'class', c.name)
                                ORDER BY st.last_name, st.first_name), '[]'::jsonb)
      FROM public.students st
      LEFT JOIN public.classes c ON c.id = app.student_current_class(st.id)
      WHERE st.status = 'active'
        AND (st.id = v_student
             OR st.id IN (SELECT sg.student_id FROM public.student_guardians sg WHERE sg.guardian_id = v_chat.pending_guardian))
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_find_child(bigint, text), public.telegram_confirm_child(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_find_child(bigint, text), public.telegram_confirm_child(bigint, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 8. Removing a pupil from the school
-- ----------------------------------------------------------------------------

/**
 * A pupil who leaves: their place in the class ends today, their record and
 * marks stay, and their account (and nobody else's) stops opening the portal.
 * Importing them again brings them back.
 */
CREATE OR REPLACE FUNCTION public.remove_student(p_student uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_today date;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE id = p_student;
  IF NOT FOUND OR v_student.school_id IS DISTINCT FROM app.current_school_id()
     OR NOT (app.can(v_student.school_id, 'students.archive') OR app.can(v_student.school_id, 'students.update')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_today := app.school_today(v_student.school_id);
  UPDATE public.enrollments
  SET status = 'withdrawn', left_on = greatest(v_today, enrolled_on), reason = coalesce(left(p_reason, 500), reason), updated_at = now()
  WHERE student_id = p_student AND status = 'active';
  UPDATE public.students SET status = 'transferred', status_changed_at = now(), updated_at = now() WHERE id = p_student;
  DELETE FROM public.class_positions WHERE student_id = p_student;
  IF v_student.user_id IS NOT NULL THEN
    UPDATE public.users SET status = 'inactive', updated_at = now() WHERE id = v_student.user_id AND status = 'active';
  END IF;
  PERFORM app.write_audit(v_student.school_id, 'remove_student', 'student', p_student, NULL, NULL,
    jsonb_build_object('reason', left(p_reason, 500)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_student(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_student(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. The account form: parents are not written here; a teacher's subjects
--    are information
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_year uuid;
  v_user public.users%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_staff public.staff%ROWTYPE;
  v_guardian public.guardians%ROWTYPE;
  v_class public.classes%ROWTYPE;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM public.users u WHERE u.id = p_user_id AND u.school_id = v_school;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT (app.can(v_school, 'users.view') OR app.may_manage_account(p_user_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_year := app.current_year_id(v_school);

  SELECT * INTO v_student FROM public.students s WHERE s.user_id = p_user_id;
  IF v_student.id IS NOT NULL THEN
    SELECT * INTO v_class FROM public.classes c WHERE c.id = app.student_current_class(v_student.id);
  END IF;
  SELECT * INTO v_staff FROM public.staff s WHERE s.user_id = p_user_id;
  SELECT * INTO v_guardian FROM public.guardians g WHERE g.user_id = p_user_id;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'public_id', v_user.public_id,
    'first_name', v_user.first_name,
    'last_name', v_user.last_name,
    'middle_name', v_user.middle_name,
    'nickname', v_user.nickname,
    'avatar_url', v_user.avatar_url,
    'email', CASE WHEN v_user.email LIKE '%.invalid' THEN NULL ELSE v_user.email END,
    'phone', v_user.phone,
    'date_of_birth', v_user.date_of_birth,
    'gender', v_user.gender,
    'status', v_user.status,
    'is_active', v_user.is_active,
    'created_at', v_user.created_at,
    'last_login_at', v_user.last_login_at,
    'credentials_issued_at', v_user.credentials_issued_at,
    'category', app.account_category(v_user.id),
    'is_self', v_user.id = (SELECT auth.uid()),
    'can_edit', app.may_manage_account(v_user.id),
    'mfa', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_user.id AND f.status::text = 'verified'),
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru,
                                          'name_en', r.name_en, 'level', r.level) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = v_user.id
    ), '[]'::jsonb),
    'student', CASE WHEN v_student.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_student.id,
      'student_number', v_student.student_number,
      'address', v_student.address,
      'class_id', v_class.id,
      'class_name', v_class.name,
      'grade_level', v_class.grade_level,
      'parent_required', coalesce(v_class.grade_level <= app.parent_required_max_grade(v_school), false),
      'parent_managed', coalesce(v_class.grade_level <= app.parent_managed_max_grade(v_school), false),
      'positions', coalesce((
        SELECT jsonb_agg(cp.position ORDER BY cp.position) FROM public.class_positions cp
        WHERE cp.student_id = v_student.id AND cp.class_id = v_class.id
      ), '[]'::jsonb),
      'telegram', (SELECT count(*) FROM public.telegram_children tc WHERE tc.student_id = v_student.id),
      'guardians', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'middle_name', g.middle_name,
          'phone', g.phone, 'relationship', sg.relationship, 'is_primary', sg.is_primary, 'user_id', g.user_id,
          'workplace', g.workplace, 'email', g.email, 'telegram_confirmed_at', g.telegram_confirmed_at,
          'login', (SELECT u.public_id FROM public.users u WHERE u.id = g.user_id)
        ) ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name)
        FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = v_student.id
      ), '[]'::jsonb)
    ) END,
    'staff', CASE WHEN v_staff.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_staff.id,
      'employee_number', v_staff.employee_number,
      'staff_type', v_staff.staff_type,
      'position', v_staff.position,
      'qualification', v_staff.qualification,
      'subjects_note', v_staff.subjects_note,
      'hire_date', v_staff.hire_date,
      'homeroom_class_id', (SELECT c.id FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
      'homeroom_class_name', (SELECT c.name FROM public.classes c WHERE c.homeroom_staff_id = v_staff.id AND c.academic_year_id = v_year ORDER BY c.name LIMIT 1),
      'subjects', coalesce((
        SELECT jsonb_agg(DISTINCT sj.name_tg)
        FROM public.class_subjects cs
        JOIN public.classes c ON c.id = cs.class_id AND c.academic_year_id = v_year
        JOIN public.subjects sj ON sj.id = cs.subject_id
        WHERE cs.teacher_id = v_staff.id AND cs.is_active
      ), '[]'::jsonb)
    ) END,
    'guardian', CASE WHEN v_guardian.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_guardian.id,
      'workplace', v_guardian.workplace,
      'email', v_guardian.email,
      'telegram_confirmed_at', v_guardian.telegram_confirmed_at,
      'children', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
          'relationship', sg.relationship, 'class_name', (SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(s.id))
        ) ORDER BY s.last_name)
        FROM public.student_guardians sg JOIN public.students s ON s.id = sg.student_id
        WHERE sg.guardian_id = v_guardian.id
      ), '[]'::jsonb)
    ) END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.account_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_account(p_user_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_actor uuid := (SELECT auth.uid());
  v_year uuid;
  v_year_start date;
  v_kind text := coalesce(p_data ->> 'kind', '');
  v_new boolean := p_user_id IS NULL;
  v_user uuid := p_user_id;
  v_existing public.users%ROWTYPE;
  v_old_kind text;
  v_errors jsonb := '[]'::jsonb;

  v_last text := nullif(btrim(coalesce(p_data ->> 'last_name', '')), '');
  v_first text := nullif(btrim(coalesce(p_data ->> 'first_name', '')), '');
  v_middle text := nullif(btrim(coalesce(p_data ->> 'middle_name', '')), '');
  v_nick text := nullif(btrim(coalesce(p_data ->> 'nickname', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_data ->> 'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_data ->> 'phone', '')), '');
  v_dob date;
  v_gender text := nullif(app.parse_gender(p_data ->> 'gender'), 'invalid');

  v_st jsonb := coalesce(p_data -> 'student', '{}'::jsonb);
  v_sf jsonb := coalesce(p_data -> 'staff', '{}'::jsonb);
  v_pa jsonb := coalesce(p_data -> 'parent', '{}'::jsonb);

  v_full boolean;
  v_homeroom uuid[];
  v_class_id uuid;
  v_class public.classes%ROWTYPE;
  v_homeroom_class uuid;
  v_role_id uuid;
  v_role_slug text;
  v_placeholder boolean := false;
  v_password text;
  v_login text;
  v_student uuid;
  v_staff uuid;
  v_guardian uuid;
  v_moved int;
  v_employee text;
  v_guardians_count int := 0;
  v_item jsonb;
  v_gid uuid;
  v_rel text;
  v_keep uuid[] := ARRAY[]::uuid[];
  v_child uuid;
  v_position text;
  v_positions text[];
BEGIN
  IF v_school IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_kind NOT IN ('student', 'teacher', 'director', 'vice_principal', 'librarian', 'staff', 'parent', 'admin') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  v_year := app.ensure_school_basics(v_school);
  SELECT y.start_date INTO v_year_start FROM public.academic_years y WHERE y.id = v_year;
  v_full := app.can(v_school, 'users.update');
  v_homeroom := app.my_homeroom_class_ids();

  -- ------------------------------------------------------------- who may
  IF NOT v_new THEN
    SELECT * INTO v_existing FROM public.users u WHERE u.id = v_user AND u.school_id = v_school;
    IF NOT FOUND OR NOT app.may_manage_account(v_user) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_old_kind := app.account_category(v_user);
    -- A pupil stays a pupil and a parent a parent; posts among the staff and
    -- the administration may change. Somebody who holds no role yet may
    -- become anything.
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_user)
       AND (v_old_kind IN ('student', 'parent') OR v_kind IN ('student', 'parent'))
       AND v_old_kind <> v_kind THEN
      v_errors := v_errors || jsonb_build_object('field', 'kind', 'code', 'kind_locked');
    END IF;
  END IF;

  IF v_kind = 'parent' AND v_new THEN
    -- A parent is made by the pupils' workbook, beside their child (00088).
    RAISE EXCEPTION 'parents_from_register' USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'admin' OR (NOT v_new AND v_old_kind = 'admin') THEN
    IF NOT app.i_am_admin() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'student' THEN
    IF NOT (v_full OR app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
            OR cardinality(v_homeroom) > 0) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'parent' THEN
    IF NOT (v_full OR app.can(v_school, 'guardians.manage') OR cardinality(v_homeroom) > 0) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_full AND app.can(v_school, CASE WHEN v_new THEN 'staff.create' ELSE 'staff.update' END)) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The role this kind of account holds, and whether the caller may hand it out.
  v_role_slug := CASE v_kind WHEN 'staff' THEN 'staff' ELSE v_kind END;
  SELECT r.id INTO v_role_id FROM public.roles r
  WHERE r.school_id = v_school AND r.is_active
    AND r.slug = v_role_slug
  ORDER BY r.level LIMIT 1;
  IF v_role_id IS NULL AND v_kind = 'admin' THEN
    SELECT r.id INTO v_role_id FROM public.roles r WHERE r.school_id = v_school AND r.is_active AND r.level <= 1 ORDER BY r.level LIMIT 1;
  END IF;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;
  -- A homeroom teacher adds pupils and parents to their own class without
  -- holding every permission a pupil's role has; everyone else hands out only
  -- what they hold themselves.
  IF v_kind NOT IN ('student', 'parent') AND NOT app.can_grant_role(v_role_id) AND NOT app.i_am_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------- check
  IF v_last IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'required'); END IF;
  IF v_first IS NULL THEN v_errors := v_errors || jsonb_build_object('field', 'first_name', 'code', 'required'); END IF;
  IF char_length(coalesce(v_last, '')) > 100 OR char_length(coalesce(v_first, '')) > 100 OR char_length(coalesce(v_middle, '')) > 100 THEN
    v_errors := v_errors || jsonb_build_object('field', 'last_name', 'code', 'too_long');
  END IF;
  IF app.parse_gender(p_data ->> 'gender') = 'invalid' THEN
    v_errors := v_errors || jsonb_build_object('field', 'gender', 'code', 'invalid_enum');
  END IF;
  IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$') THEN
    v_errors := v_errors || jsonb_build_object('field', 'phone', 'code', 'invalid_phone');
  END IF;

  BEGIN
    v_dob := app.try_date(nullif(btrim(coalesce(p_data ->> 'date_of_birth', '')), ''));
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
    v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'invalid_date');
  END;
  IF v_dob IS NOT NULL AND (v_dob > current_date - interval '4 years' OR v_dob < current_date - interval '100 years') THEN
    v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'out_of_range');
  END IF;

  IF v_nick IS NOT NULL THEN
    IF v_nick !~ '^[A-Za-z0-9._]{3,30}$' THEN
      v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'invalid_nickname');
    ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.school_id = v_school AND lower(u.nickname) = lower(v_nick) AND u.id IS DISTINCT FROM v_user) THEN
      v_errors := v_errors || jsonb_build_object('field', 'nickname', 'code', 'duplicate_existing');
    END IF;
  END IF;

  IF v_kind = 'student' THEN
    v_class_id := app.try_uuid(v_st ->> 'class_id');
    IF v_class_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'required');
    ELSE
      SELECT * INTO v_class FROM public.classes c WHERE c.id = v_class_id AND c.school_id = v_school AND c.academic_year_id = v_year;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('field', 'class_id', 'code', 'unknown_class');
      ELSIF NOT v_full AND NOT app.can(v_school, CASE WHEN v_new THEN 'students.create' ELSE 'students.update' END)
            AND NOT (v_class_id = ANY (v_homeroom)) THEN
        -- A homeroom teacher moves nobody into, or out of, somebody else's class.
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_dob IS NULL AND v_new THEN
      v_errors := v_errors || jsonb_build_object('field', 'date_of_birth', 'code', 'required');
    END IF;
    -- The youngest are added with a parent: new ones listed here, or ones
    -- already linked and not being taken away.
    SELECT count(*) INTO v_guardians_count FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) x
    WHERE app.try_uuid(x ->> 'id') IS NOT NULL
       OR (nullif(btrim(coalesce(x ->> 'first_name', '')), '') IS NOT NULL AND app.phone_key(x ->> 'phone') IS NOT NULL);
    IF NOT (v_st ? 'guardians') AND NOT v_new THEN
      SELECT count(*) INTO v_guardians_count FROM public.student_guardians sg
      JOIN public.students s ON s.id = sg.student_id WHERE s.user_id = v_user;
    END IF;
    -- Parents come from the register workbook only (00088), so a pupil added
    -- here is added without them.
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_st -> 'guardians', '[]'::jsonb)) LOOP
      IF app.try_uuid(v_item ->> 'id') IS NULL THEN
        IF nullif(btrim(coalesce(v_item ->> 'first_name', '')), '') IS NULL OR nullif(btrim(coalesce(v_item ->> 'last_name', '')), '') IS NULL THEN
          v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_name');
        END IF;
        IF app.phone_key(v_item ->> 'phone') IS NULL OR (v_item ->> 'phone') !~ '^[+0-9 ()-]{5,30}$' THEN
          v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'guardian_phone');
        END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = app.try_uuid(v_item ->> 'id') AND g.school_id = v_school) THEN
        v_errors := v_errors || jsonb_build_object('field', 'guardians', 'code', 'unknown_guardian');
      END IF;
    END LOOP;
    SELECT array_agg(DISTINCT p) INTO v_positions
    FROM jsonb_array_elements_text(coalesce(v_st -> 'positions', '[]'::jsonb)) p;
    IF EXISTS (SELECT 1 FROM unnest(coalesce(v_positions, ARRAY[]::text[])) p
               WHERE p NOT IN ('monitor', 'assistant_monitor', 'cleanliness', 'studies', 'culture', 'sports', 'health', 'press')) THEN
      v_errors := v_errors || jsonb_build_object('field', 'positions', 'code', 'invalid_enum');
    END IF;
  ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    v_employee := nullif(btrim(coalesce(v_sf ->> 'employee_number', '')), '');
    IF v_employee IS NOT NULL THEN
      IF v_employee !~ '^[A-Za-z0-9-]{1,32}$' THEN
        v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'invalid_number');
      ELSIF EXISTS (SELECT 1 FROM public.staff s WHERE s.school_id = v_school AND s.employee_number = v_employee
                    AND s.user_id IS DISTINCT FROM v_user) THEN
        v_errors := v_errors || jsonb_build_object('field', 'employee_number', 'code', 'duplicate_existing');
      END IF;
    END IF;
    v_homeroom_class := app.try_uuid(v_sf ->> 'homeroom_class_id');
    IF v_homeroom_class IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.classes c WHERE c.id = v_homeroom_class AND c.school_id = v_school AND c.academic_year_id = v_year
    ) THEN
      v_errors := v_errors || jsonb_build_object('field', 'homeroom_class_id', 'code', 'unknown_class');
    END IF;
  ELSIF v_kind = 'parent' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
      v_child := app.try_uuid(v_item #>> '{}');
      IF v_child IS NULL OR NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_child AND s.school_id = v_school) THEN
        v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'unknown_student');
      ELSIF NOT app.may_manage_student(v_child) AND NOT app.can(v_school, 'guardians.manage') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
      END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(v_pa -> 'children', '[]'::jsonb)) = 0 THEN
      v_errors := v_errors || jsonb_build_object('field', 'children', 'code', 'required');
    END IF;
  END IF;

  -- An address of their own, except for the youngest pupils and parents,
  -- whose accounts are reached through the school and the parents' bot.
  IF v_email IS NOT NULL THEN
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' OR v_email LIKE '%.invalid' THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'invalid_email');
    ELSIF EXISTS (SELECT 1 FROM public.users u WHERE u.email = v_email AND u.id IS DISTINCT FROM v_user)
       OR EXISTS (SELECT 1 FROM auth.users au WHERE au.email = v_email AND au.id IS DISTINCT FROM v_user) THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'duplicate_existing');
    END IF;
  ELSIF v_new OR coalesce(v_existing.email, '') NOT LIKE '%.invalid' THEN
    IF v_kind = 'parent' OR (v_kind = 'student' AND v_class.id IS NOT NULL AND v_class.grade_level <= app.parent_managed_max_grade(v_school)) THEN
      v_placeholder := v_new OR v_existing.email IS NULL;
    ELSIF v_new OR v_existing.email IS NULL THEN
      v_errors := v_errors || jsonb_build_object('field', 'email', 'code', 'required');
    END IF;
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'errors', v_errors);
  END IF;

  -- --------------------------------------------------------------- write
  IF v_new THEN
    IF v_placeholder OR v_email IS NULL THEN
      -- An address that can never receive mail (RFC 2606), confirmed by the
      -- school: the account signs in with its login.
      v_email := CASE v_kind WHEN 'parent' THEN 'p' ELSE 's' END || app.random_password(12)
                 || '@' || CASE v_kind WHEN 'parent' THEN 'parents' ELSE 'pupils' END || '.invalid';
      v_placeholder := true;
    END IF;
    v_password := app.random_password();
    v_user := app.create_login(v_email, v_password);
    IF v_placeholder THEN
      UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
    END IF;
    INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, date_of_birth, gender,
                              nickname, status, is_active, credentials_issued_at)
    VALUES (v_user, v_school, v_email, v_first, v_last, v_middle, v_phone, v_dob, v_gender, v_nick, 'active', true, now());
  ELSE
    IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_existing.email THEN
      UPDATE auth.users SET email = v_email, email_confirmed_at = NULL, updated_at = now() WHERE id = v_user;
      UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
      WHERE user_id = v_user AND provider = 'email';
    ELSE
      v_email := v_existing.email;
    END IF;
    UPDATE public.users SET
      email = v_email, first_name = v_first, last_name = v_last, middle_name = v_middle, phone = v_phone,
      date_of_birth = coalesce(v_dob, date_of_birth), gender = v_gender, nickname = v_nick, updated_at = now()
    WHERE id = v_user;
  END IF;
  SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;

  -- The role. A changed kind swaps the post it came from for the new one;
  -- anything else the person holds stays.
  IF NOT v_new AND v_old_kind <> v_kind THEN
    DELETE FROM public.user_roles ur USING public.roles r
    WHERE ur.user_id = v_user AND ur.role_id = r.id AND ur.school_id = v_school
      AND (r.level <= 1 OR r.slug IN ('director', 'vice_principal', 'teacher', 'librarian', 'staff'))
      AND r.id <> v_role_id;
  END IF;
  INSERT INTO public.user_roles (user_id, role_id, school_id, assigned_by)
  VALUES (v_user, v_role_id, v_school, v_actor)
  ON CONFLICT DO NOTHING;

  -- The person behind the account.
  IF v_kind = 'student' THEN
    SELECT s.id INTO v_student FROM public.students s WHERE s.user_id = v_user;
    IF v_student IS NULL THEN
      INSERT INTO public.students (school_id, user_id, first_name, last_name, middle_name, gender, date_of_birth, phone,
                                   admission_date, student_number, address, created_by)
      VALUES (v_school, v_user, v_first, v_last, v_middle, v_gender, v_dob, v_phone, current_date,
              nullif(btrim(coalesce(v_st ->> 'student_number', '')), ''), nullif(btrim(coalesce(v_st ->> 'address', '')), ''), v_actor)
      RETURNING id INTO v_student;
    ELSE
      UPDATE public.students SET
        first_name = v_first, last_name = v_last, middle_name = v_middle, gender = v_gender,
        date_of_birth = coalesce(v_dob, date_of_birth), phone = v_phone,
        student_number = CASE WHEN v_st ? 'student_number' THEN nullif(btrim(coalesce(v_st ->> 'student_number', '')), '') ELSE student_number END,
        address = CASE WHEN v_st ? 'address' THEN nullif(btrim(coalesce(v_st ->> 'address', '')), '') ELSE address END,
        updated_at = now()
      WHERE id = v_student;
    END IF;

    -- A move is a transfer, not an overwrite: the class they left stays on record.
    UPDATE public.enrollments SET status = 'transferred', left_on = current_date, updated_at = now()
    WHERE student_id = v_student AND academic_year_id = v_year AND status = 'active' AND class_id <> v_class_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = v_student AND e.academic_year_id = v_year AND e.status = 'active') THEN
      INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on, created_by)
      VALUES (v_school, v_student, v_class_id, v_year,
              CASE WHEN v_moved > 0 OR NOT v_new THEN current_date ELSE least(current_date, coalesce(v_year_start, current_date)) END,
              v_actor);
    END IF;

    -- Posts: those of the class they are in now, as listed.
    IF v_st ? 'positions' OR v_moved > 0 THEN
      DELETE FROM public.class_positions cp
      WHERE cp.student_id = v_student
        AND (cp.class_id <> v_class_id OR NOT (cp.position = ANY (coalesce(v_positions, ARRAY[]::text[]))));
      FOREACH v_position IN ARRAY coalesce(v_positions, ARRAY[]::text[]) LOOP
        IF v_position IN ('monitor', 'assistant_monitor') THEN
          -- A new monitor replaces the old one.
          DELETE FROM public.class_positions cp WHERE cp.class_id = v_class_id AND cp.position = v_position AND cp.student_id <> v_student;
        END IF;
        INSERT INTO public.class_positions (school_id, class_id, student_id, position, created_by)
        VALUES (v_school, v_class_id, v_student, v_position, v_actor)
        ON CONFLICT (class_id, student_id, position) DO NOTHING;
      END LOOP;
    END IF;

    -- Parents are not written from this form: the register workbook writes them.

  ELSIF v_kind IN ('teacher', 'director', 'vice_principal', 'librarian', 'staff') THEN
    SELECT s.id INTO v_staff FROM public.staff s WHERE s.user_id = v_user;
    IF v_employee IS NULL THEN
      SELECT s.employee_number INTO v_employee FROM public.staff s WHERE s.id = v_staff;
    END IF;
    IF v_employee IS NULL THEN
      -- The next free number: what the timetable will call them.
      SELECT (coalesce(max(nullif(regexp_replace(s.employee_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text
      INTO v_employee FROM public.staff s WHERE s.school_id = v_school AND s.employee_number ~ '^\d{1,12}$';
    END IF;
    IF v_staff IS NULL THEN
      INSERT INTO public.staff (school_id, user_id, employee_number, first_name, last_name, middle_name, gender, date_of_birth,
                                staff_type, position, qualification, hire_date, phone, email, created_by, subjects_note)
      VALUES (v_school, v_user, v_employee, v_first, v_last, v_middle, v_gender, v_dob,
              CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
              nullif(btrim(coalesce(v_sf ->> 'position', '')), ''), nullif(btrim(coalesce(v_sf ->> 'qualification', '')), ''),
              coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), current_date),
              v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, v_actor,
              nullif(left(btrim(coalesce(v_sf ->> 'subjects_note', '')), 500), ''))
      RETURNING id INTO v_staff;
    ELSE
      UPDATE public.staff SET
        employee_number = v_employee, first_name = v_first, last_name = v_last, middle_name = v_middle,
        gender = v_gender, date_of_birth = coalesce(v_dob, date_of_birth),
        staff_type = CASE v_kind WHEN 'staff' THEN 'support' ELSE v_kind END,
        position = CASE WHEN v_sf ? 'position' THEN nullif(btrim(coalesce(v_sf ->> 'position', '')), '') ELSE position END,
        qualification = CASE WHEN v_sf ? 'qualification' THEN nullif(btrim(coalesce(v_sf ->> 'qualification', '')), '') ELSE qualification END,
        subjects_note = CASE WHEN v_sf ? 'subjects_note' THEN nullif(left(btrim(coalesce(v_sf ->> 'subjects_note', '')), 500), '') ELSE subjects_note END,
        hire_date = coalesce(app.try_date(nullif(btrim(coalesce(v_sf ->> 'hire_date', '')), '')), hire_date),
        phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END,
        status = CASE WHEN status = 'archived' THEN 'active' ELSE status END,
        updated_at = now()
      WHERE id = v_staff;
    END IF;
    IF v_sf ? 'homeroom_class_id' THEN
      UPDATE public.classes SET homeroom_staff_id = NULL, updated_at = now()
      WHERE homeroom_staff_id = v_staff AND academic_year_id = v_year AND id IS DISTINCT FROM v_homeroom_class;
      IF v_homeroom_class IS NOT NULL THEN
        UPDATE public.classes SET homeroom_staff_id = v_staff, updated_at = now() WHERE id = v_homeroom_class;
      END IF;
    END IF;

  ELSIF v_kind = 'parent' THEN
    SELECT g.id INTO v_guardian FROM public.guardians g WHERE g.user_id = v_user;
    IF v_guardian IS NULL THEN
      SELECT g.id INTO v_guardian FROM public.guardians g
      WHERE g.school_id = v_school AND g.user_id IS NULL AND app.phone_key(g.phone) = app.phone_key(v_phone)
        AND lower(g.first_name) = lower(v_first)
      LIMIT 1;
    END IF;
    IF v_guardian IS NULL THEN
      INSERT INTO public.guardians (school_id, user_id, first_name, last_name, middle_name, phone, email)
      VALUES (v_school, v_user, v_first, v_last, v_middle, v_phone, CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END)
      RETURNING id INTO v_guardian;
    ELSE
      UPDATE public.guardians SET user_id = v_user, first_name = v_first, last_name = v_last, middle_name = v_middle,
        phone = v_phone, email = CASE WHEN v_email LIKE '%.invalid' THEN NULL ELSE v_email END, updated_at = now()
      WHERE id = v_guardian;
    END IF;
    v_rel := CASE WHEN (v_pa ->> 'relationship') IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')
                  THEN v_pa ->> 'relationship' ELSE 'guardian' END;
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pa -> 'children', '[]'::jsonb)) LOOP
      v_child := app.try_uuid(v_item #>> '{}');
      v_keep := v_keep || v_child;
      INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
      VALUES (v_child, v_guardian, v_school, v_rel,
              NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = v_child AND x.is_primary))
      ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship;
    END LOOP;
    IF app.can(v_school, 'guardians.manage') OR v_full THEN
      DELETE FROM public.student_guardians sg WHERE sg.guardian_id = v_guardian AND NOT (sg.student_id = ANY (v_keep));
    END IF;
  END IF;

  PERFORM app.write_audit(v_school, CASE WHEN v_new THEN 'create_account' ELSE 'update_account' END, 'user', v_user,
    NULL, NULL, jsonb_build_object('kind', v_kind));
  IF v_password IS NOT NULL THEN
    PERFORM app.write_audit(v_school, 'issue_credentials', 'user', v_user, NULL, NULL, jsonb_build_object('count', 1));
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'errors', '[]'::jsonb,
    'userId', v_user,
    'login', v_login,
    'password', v_password,
    'created', v_new
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_account(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. A workbook imported again does not clash with itself on telephones
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_phone_conflicts(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_row jsonb;
  v_index int;
  v_key text;
  v_login text;
  v_email text;
BEGIN
  IF v_school IS NULL OR NOT app.is_staff_member() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 0 .. jsonb_array_length(p_rows) - 1 LOOP
    v_row := p_rows -> v_index;
    v_key := app.phone_key(v_row ->> 'phone');
    CONTINUE WHEN v_key IS NULL;
    IF v_key = ANY (v_seen) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index + 1, 'field', 'phone', 'code', 'duplicate_in_file');
      CONTINUE;
    END IF;
    v_seen := v_seen || v_key;
    v_login := nullif(upper(btrim(coalesce(v_row ->> 'login', ''))), '');
    v_email := nullif(lower(btrim(coalesce(v_row ->> 'email', ''))), '');
    IF EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.school_id = v_school
        AND app.phone_key(u.phone) = v_key
        AND NOT (v_login IS NOT NULL AND upper(u.public_id) = v_login)
        AND NOT (v_email IS NOT NULL AND u.email = v_email)
        -- The pupil or teacher the row is about, recognised the way the
        -- import recognises them (00088): a workbook imported again does not
        -- clash with itself.
        AND NOT EXISTS (
          SELECT 1 FROM public.students st
          WHERE st.user_id = u.id
            AND lower(st.last_name) = lower(btrim(coalesce(v_row ->> 'last_name', '')))
            AND lower(st.first_name) = lower(btrim(coalesce(v_row ->> 'first_name', '')))
            AND st.date_of_birth IS NOT DISTINCT FROM app.try_date(nullif(btrim(coalesce(v_row ->> 'date_of_birth', '')), ''))
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.staff sf
          WHERE sf.user_id = u.id AND sf.school_id = v_school
            AND sf.employee_number = nullif(btrim(coalesce(v_row ->> 'employee_number', '')), '')
        )
    ) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index + 1, 'field', 'phone', 'code', 'duplicate_existing');
    END IF;
  END LOOP;
  RETURN v_errors;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. The outbox carries a teacher's note
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.telegram_due(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT o.id FROM public.telegram_outbox o
    WHERE o.sent_at IS NULL AND o.send_after <= now() AND o.attempts < 3
    ORDER BY o.send_after
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  ) due;
  IF v_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  UPDATE public.telegram_outbox
  SET attempts = attempts + 1, send_after = now() + interval '90 seconds'
  WHERE id = ANY (v_ids);

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'chat', o.chat_id,
      'locale', ch.locale,
      'kind', o.kind,
      'date', o.payload ->> 'date',
      'school', jsonb_build_object('name', sc.short_name, 'slug', sc.slug),
      'child', jsonb_build_object(
        'name', st.last_name || ' ' || st.first_name,
        'class', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
                   WHERE e.student_id = st.id AND e.status = 'active' LIMIT 1)
      ),
      'grade', CASE WHEN o.kind <> 'grade' THEN NULL ELSE (
        SELECT jsonb_build_object(
          'score', g.score, 'max', g.max_score, 'date', g.grade_date, 'final', at.is_final,
          'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
          'work', jsonb_build_object('tg', at.name_tg, 'ru', at.name_ru, 'en', at.name_en))
        FROM public.grades g
        JOIN public.class_subjects cs ON cs.id = g.class_subject_id
        JOIN public.subjects s ON s.id = cs.subject_id
        JOIN public.assessment_types at ON at.id = g.assessment_type_id
        WHERE g.id = (o.payload ->> 'grade')::uuid) END,
      'absence', CASE WHEN o.kind <> 'absence' THEN NULL ELSE (
        SELECT jsonb_build_object(
          'status', a.status, 'date', a.attendance_date, 'period', a.period_number,
          'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en))
        FROM public.attendance_records a
        LEFT JOIN public.class_subjects cs ON cs.id = a.class_subject_id
        LEFT JOIN public.subjects s ON s.id = cs.subject_id
        WHERE a.id = (o.payload ->> 'attendance')::uuid) END,
      'digest', CASE WHEN o.kind <> 'digest' THEN NULL
        ELSE public.telegram_report(o.chat_id, o.student_id, 'day', (o.payload ->> 'date')::date) END,
      'note', CASE WHEN o.kind <> 'note' THEN NULL
        ELSE jsonb_build_object('text', o.payload ->> 'text', 'from', o.payload ->> 'from') END
    ) ORDER BY o.send_after), '[]'::jsonb)
    FROM public.telegram_outbox o
    JOIN public.telegram_chats ch ON ch.chat_id = o.chat_id
    JOIN public.students st ON st.id = o.student_id
    JOIN public.schools sc ON sc.id = o.school_id
    WHERE o.id = ANY (v_ids)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_due(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_due(int) TO service_role;
