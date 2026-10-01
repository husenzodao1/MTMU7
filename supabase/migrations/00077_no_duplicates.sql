-- ============================================================================
-- 00077 · The same thing, entered twice, is refused the second time.
--
-- A class named "10А" could be added while "10A" existed: the unique rule
-- compared the names byte for byte, and one was typed with a Latin A, the
-- other with a Cyrillic А, which look the same on every screen. "10 А" and
-- "10-А" went through the same gap. A telephone number already on one account
-- could be put on another. A subject could be added to a class twice, and two
-- lessons put in one slot, whenever the group was left empty (NULL is never
-- equal to NULL, so the unique rules let both through). A room or a year could
-- be added again with different spacing or capitals.
--
-- Each is now compared the way a person would compare it. The forms already
-- turn a unique violation into "this name is already used"; the telephone
-- gets its own check, for the account form and the import, before anything is
-- written, and a trigger for everything else.
-- ============================================================================

-- ---------------------------------------------------------------- classes

/**
 * A class name as the school means it: capitals, Latin look-alikes read as
 * Cyrillic (10A is 10А), and spaces, dashes, dots and quotes dropped
 * (10 «А», 10-а and 10.А are all 10А). The imports and the new school year
 * already found classes by this; it now also writes the names they create.
 */
CREATE OR REPLACE FUNCTION app.normalize_class_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(
    translate(upper(regexp_replace(coalesce(p_name, ''), '[[:space:]_.''"«»“”-]+', '', 'g')), 'ABCEHKMOPTXY', 'АВСЕНКМОРТХУ'),
    ''
  )
$$;

/** What makes two class names the same (app.normalize_class_name). */
CREATE OR REPLACE FUNCTION app.class_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT app.normalize_class_name(p_name)
$$;
GRANT EXECUTE ON FUNCTION app.class_name_key(text) TO authenticated;

-- The pairs already there: the one with pupils (or the older) stays, an empty
-- twin is archived. Anything with its own pupils, lessons or marks is left for
-- a person to merge.
WITH ranked AS (
  SELECT c.id,
         row_number() OVER (
           PARTITION BY c.school_id, c.academic_year_id, app.class_name_key(c.name)
           ORDER BY (SELECT count(*) FROM public.enrollments e WHERE e.class_id = c.id) DESC, c.created_at, c.id
         ) AS place
  FROM public.classes c
  WHERE c.is_active
)
UPDATE public.classes c
SET is_active = false, deactivated_at = now()
FROM ranked
WHERE ranked.id = c.id
  AND ranked.place > 1
  AND NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.timetable_entries t WHERE t.class_id = c.id);

CREATE UNIQUE INDEX IF NOT EXISTS classes_school_year_name_key
  ON public.classes (school_id, academic_year_id, app.class_name_key(name))
  WHERE is_active;

-- ---------------------------------------------------------- rooms and years

CREATE UNIQUE INDEX IF NOT EXISTS rooms_school_name_key
  ON public.rooms (school_id, lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_school_name_key
  ON public.academic_years (school_id, regexp_replace(name, '[[:space:]]', '', 'g'));

-- -------------------------------------------- a subject once, a slot once

ALTER TABLE public.class_subjects DROP CONSTRAINT IF EXISTS class_subjects_unique;
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_unique UNIQUE NULLS NOT DISTINCT (class_id, subject_id, group_label);

ALTER TABLE public.timetable_entries DROP CONSTRAINT IF EXISTS timetable_class_conflict;
ALTER TABLE public.timetable_entries
  ADD CONSTRAINT timetable_class_conflict UNIQUE NULLS NOT DISTINCT (class_id, day_of_week, shift, period_number, group_label);

-- ------------------------------------------------------------- telephones

/**
 * Whether a telephone number is already on another account in this school
 * (compared by its last nine digits, as everywhere else: app.phone_key).
 * For the account form, before it saves.
 */
CREATE OR REPLACE FUNCTION public.phone_in_use(p_phone text, p_except uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
BEGIN
  IF v_school IS NULL OR NOT app.is_staff_member() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF app.phone_key(p_phone) IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.school_id = v_school
      AND app.phone_key(u.phone) = app.phone_key(p_phone)
      AND u.id IS DISTINCT FROM p_except
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.phone_in_use(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phone_in_use(text, uuid) TO authenticated;

/**
 * The import's telephone check: p_rows are the workbook's rows ({ phone,
 * login, email }), in order. A number twice in the file, or already on an
 * account that is not the one the row is about (known by its login or its
 * address), comes back as { row, field: 'phone', code }.
 */
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
    ) THEN
      v_errors := v_errors || jsonb_build_object('row', v_index + 1, 'field', 'phone', 'code', 'duplicate_existing');
    END IF;
  END LOOP;
  RETURN v_errors;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_phone_conflicts(jsonb) TO authenticated;

/**
 * The last line: a number that another account in the school already has is
 * refused on a new account, or when an account's number is changed to it.
 * Accounts that already shared a number before this are left as they are.
 */
-- A definer, because the check reads other people's numbers, which the
-- person changing their own may not.
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
    WHERE u.school_id = NEW.school_id AND u.id <> NEW.id AND app.phone_key(u.phone) = app.phone_key(NEW.phone)
  ) THEN
    RAISE EXCEPTION 'phone_taken' USING ERRCODE = '23505', CONSTRAINT = 'users_phone_taken';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_unique_phone ON public.users;
CREATE TRIGGER users_unique_phone
  BEFORE INSERT OR UPDATE OF phone ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.guard_unique_phone();

CREATE INDEX IF NOT EXISTS idx_users_school_phone_key ON public.users (school_id, app.phone_key(phone)) WHERE phone IS NOT NULL;
