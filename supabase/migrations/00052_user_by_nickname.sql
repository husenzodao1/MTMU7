-- Naming somebody by the handle they chose.
--
-- A notice that says "@ali_k шуд ғолиби олимпиада" should take the reader to
-- Ali's profile, and the person writing it knows the handle and not the uuid.
-- So the handle is resolved when the link is followed, not when it is written:
-- a notice keeps working when a profile is rebuilt, and nothing has to be
-- rewritten when somebody changes their nickname.
--
-- Scoped to the reader's own school, and only for accounts they may already
-- see, so a handle cannot be used to find out who exists elsewhere.

CREATE OR REPLACE FUNCTION public.user_by_nickname(p_nickname text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.school_id = app.current_school_id()
    AND u.nickname IS NOT NULL
    AND lower(u.nickname) = lower(btrim(coalesce(p_nickname, '')))
    AND u.is_active
    AND u.status IN ('active', 'graduated')
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.user_by_nickname(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_by_nickname(text) TO authenticated;
