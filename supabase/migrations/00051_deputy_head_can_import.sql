-- What the deputy head is actually asked to do.
--
-- The deputy head owns the timetable, moves pupils between classes and, since
-- the school began loading its register from a workbook, is the person who
-- loads it. The seeded role covered the first two and not the third: they could
-- edit a pupil one at a time but not import the class, and could not add a
-- teacher at all — while being the one who needs the teacher numbers the
-- timetable is written against.
--
-- 00022's default_role_permissions is left alone: it has run everywhere, and a
-- migration that has run is not rewritten. Additions live beside it instead, and
-- reset_role_permissions now reads both, so a school provisioned tomorrow gets
-- the same set as the one provisioned last year.

CREATE OR REPLACE FUNCTION app.added_role_permissions(p_slug text)
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT unnest(CASE p_slug
    WHEN 'vice_principal' THEN ARRAY['students.import', 'staff.create', 'staff.update']
    ELSE ARRAY[]::text[]
  END)
$$;
REVOKE EXECUTE ON FUNCTION app.added_role_permissions(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.reset_role_permissions(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT r.slug INTO v_slug FROM public.roles r WHERE r.id = p_role_id;
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, p.id
  FROM public.permissions p
  WHERE p.slug IN (SELECT app.default_role_permissions(v_slug))
     OR p.slug IN (SELECT app.added_role_permissions(v_slug));
END;
$$;
REVOKE EXECUTE ON FUNCTION app.reset_role_permissions(uuid) FROM PUBLIC, anon, authenticated;

-- The schools that already exist, brought up to the same set.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.slug IN (SELECT app.added_role_permissions(r.slug))
WHERE r.is_system
ON CONFLICT DO NOTHING;
