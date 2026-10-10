-- ============================================================================
-- 00081 · A pupil names their own parents.
--
-- Each pupil enters, in their own account, their father, mother or guardian:
-- the name, the year of birth, the telephone and where they work. When the
-- parent given is already in the school's records as the parent of another
-- pupil — the same telephone number — the pupil is shown which pupil that is
-- and asked whether they are brother or sister; only on a yes are the two
-- tied to the one parent. On a no, nothing is saved: one number, one parent.
--
-- A pupil reads and writes only their own family, through these functions;
-- the tables stay closed to them as before.
-- ============================================================================

ALTER TABLE public.guardians ADD COLUMN IF NOT EXISTS birth_year smallint;
ALTER TABLE public.guardians ADD COLUMN IF NOT EXISTS workplace varchar(200);
ALTER TABLE public.guardians DROP CONSTRAINT IF EXISTS guardians_birth_year_check;
ALTER TABLE public.guardians ADD CONSTRAINT guardians_birth_year_check CHECK (birth_year IS NULL OR birth_year BETWEEN 1920 AND 2015);

CREATE INDEX IF NOT EXISTS idx_guardians_school_phone_key ON public.guardians (school_id, app.phone_key(phone)) WHERE phone IS NOT NULL;

/** The signed-in pupil's own students row, or NULL. */
CREATE OR REPLACE FUNCTION app.my_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id FROM public.students s
  WHERE s.user_id = (SELECT auth.uid()) AND s.status = 'active'
  LIMIT 1
$$;

/** The pupil's parents, as the pupil entered them (or the school did). */
CREATE OR REPLACE FUNCTION public.my_guardians()
RETURNS TABLE (
  guardian_id uuid, relationship text, last_name text, first_name text, middle_name text,
  birth_year smallint, phone text, workplace text, shared_with int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id, sg.relationship::text, g.last_name::text, g.first_name::text, g.middle_name::text,
         g.birth_year, g.phone::text, g.workplace::text,
         (SELECT count(*)::int FROM public.student_guardians o WHERE o.guardian_id = g.id AND o.student_id <> sg.student_id)
  FROM public.student_guardians sg
  JOIN public.guardians g ON g.id = sg.guardian_id
  WHERE sg.student_id = app.my_student_id() AND g.status = 'active'
  ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name
$$;
REVOKE EXECUTE ON FUNCTION public.my_guardians() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_guardians() TO authenticated;

/**
 * Adds a parent to the signed-in pupil, or changes one (p_guardian_id).
 *
 * Returns { status: 'saved', guardianId } — or, when the telephone already
 * belongs to the parent of other pupils and p_sibling_of is not that parent,
 * { status: 'match', guardianId, children: [{ name, className }] } and saves
 * nothing, so the pupil can be asked whether those are their brother or
 * sister. Called again with p_sibling_of = that guardianId, the pupil is tied
 * to the same parent.
 */
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
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_key text := app.phone_key(p_phone);
  v_match uuid;
  v_id uuid;
  v_children jsonb;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE id = app.my_student_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_relationship NOT IN ('father', 'mother', 'guardian') THEN
    RAISE EXCEPTION 'invalid_relationship' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_last_name, ''))) = 0 OR length(btrim(coalesce(p_first_name, ''))) = 0
     OR length(p_last_name) > 100 OR length(p_first_name) > 100 OR length(coalesce(p_middle_name, '')) > 100 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF p_birth_year IS NOT NULL AND (p_birth_year < 1920 OR p_birth_year > 2015) THEN
    RAISE EXCEPTION 'invalid_birth_year' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL OR length(v_key) < 9 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_workplace, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_workplace' USING ERRCODE = '22023';
  END IF;

  -- Changing one of my own parents: it must be mine.
  IF p_guardian_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_guardians WHERE student_id = v_student.id AND guardian_id = p_guardian_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- The same number on another parent of this school, who is not this one.
  SELECT g.id INTO v_match
  FROM public.guardians g
  WHERE g.school_id = v_student.school_id AND g.status = 'active'
    AND app.phone_key(g.phone) = v_key
    AND g.id IS DISTINCT FROM p_guardian_id
    AND NOT EXISTS (SELECT 1 FROM public.student_guardians sg WHERE sg.guardian_id = g.id AND sg.student_id = v_student.id)
  ORDER BY g.created_at
  LIMIT 1;

  IF v_match IS NOT NULL THEN
    IF p_sibling_of IS DISTINCT FROM v_match THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'name', s.first_name || ' ' || left(s.last_name, 1) || '.',
               'className', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
                             WHERE e.student_id = s.id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1))
             ORDER BY s.last_name, s.first_name), '[]'::jsonb)
        INTO v_children
      FROM public.student_guardians sg
      JOIN public.students s ON s.id = sg.student_id
      WHERE sg.guardian_id = v_match AND s.status = 'active';
      RETURN jsonb_build_object('status', 'match', 'guardianId', v_match, 'children', v_children);
    END IF;
    -- Brother or sister, confirmed: the same parent for both.
    INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship)
    VALUES (v_student.id, v_match, v_student.school_id, p_relationship)
    ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = excluded.relationship;
    -- The entry being changed, if any, gives way to the shared one.
    IF p_guardian_id IS NOT NULL THEN
      DELETE FROM public.student_guardians WHERE student_id = v_student.id AND guardian_id = p_guardian_id;
    END IF;
    RETURN jsonb_build_object('status', 'saved', 'guardianId', v_match);
  END IF;

  IF p_guardian_id IS NOT NULL THEN
    UPDATE public.guardians SET
      last_name = btrim(p_last_name), first_name = btrim(p_first_name), middle_name = nullif(btrim(coalesce(p_middle_name, '')), ''),
      birth_year = p_birth_year, phone = btrim(p_phone), workplace = nullif(btrim(coalesce(p_workplace, '')), ''), updated_at = now()
    WHERE id = p_guardian_id
    RETURNING id INTO v_id;
    UPDATE public.student_guardians SET relationship = p_relationship WHERE student_id = v_student.id AND guardian_id = p_guardian_id;
  ELSE
    INSERT INTO public.guardians (school_id, first_name, last_name, middle_name, phone, birth_year, workplace)
    VALUES (v_student.school_id, btrim(p_first_name), btrim(p_last_name), nullif(btrim(coalesce(p_middle_name, '')), ''),
            btrim(p_phone), p_birth_year, nullif(btrim(coalesce(p_workplace, '')), ''))
    RETURNING id INTO v_id;
    INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship)
    VALUES (v_student.id, v_id, v_student.school_id, p_relationship);
  END IF;
  RETURN jsonb_build_object('status', 'saved', 'guardianId', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_my_guardian(text, text, text, text, int, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_guardian(text, text, text, text, int, text, text, uuid, uuid) TO authenticated;

/** Takes a parent off the signed-in pupil (the record stays for the others it belongs to). */
CREATE OR REPLACE FUNCTION public.remove_my_guardian(p_guardian_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app.my_student_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.student_guardians WHERE student_id = app.my_student_id() AND guardian_id = p_guardian_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_my_guardian(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_my_guardian(uuid) TO authenticated;
