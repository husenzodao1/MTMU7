-- A name people can be found by.
--
-- Two pupils in the same year are regularly called the same thing, and a
-- surname is not what anyone types when looking for a classmate. A nickname
-- gives each person one handle they choose themselves, unique inside their
-- school, and the contact search now matches on it as well as on names.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nickname varchar(30);

DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_nickname_format
    CHECK (nickname IS NULL OR nickname ~ '^[A-Za-z0-9._]{3,30}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One handle per school; two schools may each have a "dilshod".
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname
  ON public.users (school_id, lower(nickname)) WHERE nickname IS NOT NULL;

COMMENT ON COLUMN public.users.nickname IS
  'Handle the person chooses for themselves; unique within their school, used by search.';

-- ----------------------------------------------------------------------------
-- Contact search matches the nickname and hands it back for display
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_message_contacts(text, int);
CREATE FUNCTION public.search_message_contacts(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, nickname varchar, avatar_url varchar, roles jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
BEGIN
  IF v_query IS NULL OR length(v_query) < 2 OR app.current_school_id() IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_url,
         coalesce((SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en))
                   FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb)
  FROM public.users u
  WHERE u.school_id = app.current_school_id() AND u.is_active AND u.status = 'active' AND u.id <> (SELECT auth.uid())
    AND (
      u.first_name ILIKE '%' || v_query || '%'
      OR u.last_name ILIKE '%' || v_query || '%'
      -- A handle is typed with or without its leading @.
      OR u.nickname ILIKE '%' || ltrim(v_query, '@') || '%'
    )
    AND app.can_message_user(u.id)
  ORDER BY u.last_name, u.first_name
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.search_message_contacts(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_message_contacts(text, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- A nickname belongs to the person, not to anyone editing their record
-- ----------------------------------------------------------------------------
-- A browser may write only the columns it is granted on public.users, which is
-- a deliberately short list; the nickname joins it. RLS still limits the row to
-- the person themselves or an administrator, guard_users_write() still refuses
-- protected fields, and the unique index stops a handle already in use.
GRANT UPDATE (nickname) ON public.users TO authenticated;

-- ----------------------------------------------------------------------------
-- The profile page needs the handle to show and to edit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'id', u.id, 'public_id', u.public_id, 'school_id', u.school_id, 'email', u.email,
    'first_name', u.first_name, 'last_name', u.last_name, 'middle_name', u.middle_name,
    'nickname', u.nickname,
    'phone', u.phone, 'date_of_birth', u.date_of_birth, 'gender', u.gender,
    'avatar_url', u.avatar_url, 'status', u.status, 'is_active', u.is_active,
    'created_at', u.created_at,
    'school_name', s.short_name,
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id
    ), '[]'::jsonb)
  )
  FROM public.users u
  JOIN public.schools s ON s.id = u.school_id
  WHERE u.id = (SELECT auth.uid())
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
