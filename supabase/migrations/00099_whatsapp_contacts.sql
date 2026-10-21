-- ============================================================================
-- 00099: People are reached on WhatsApp, not in a chat of the portal's own
-- ============================================================================
-- The portal's messenger is retired from the screens; its tables and every
-- message already written stay exactly as they are. Finding somebody now
-- offers their WhatsApp instead: the number they gave, or the school gave for
-- them in an import.
--
-- Who may see a number is who could write to that person before
-- (app.can_message_user: the same school, an active account, nobody blocked,
-- pupils to pupils only where the school allows it) — and a pupil's own number
-- only to the school's staff and to the pupil's own parents, never to other
-- pupils or other parents.
--
-- Nothing is dropped or rewritten; only functions are added.

/**
 * The number a person is known by: their account's, else the one an import
 * wrote on their parent, staff or pupil record (each holds one account at most).
 */
CREATE OR REPLACE FUNCTION app.phone_of(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT nullif(btrim(u.phone), '') FROM public.users u WHERE u.id = p_user_id),
    (SELECT nullif(btrim(g.phone), '') FROM public.guardians g
      WHERE g.user_id = p_user_id AND nullif(btrim(g.phone), '') IS NOT NULL),
    (SELECT nullif(btrim(s.phone), '') FROM public.staff s
      WHERE s.user_id = p_user_id AND nullif(btrim(s.phone), '') IS NOT NULL),
    (SELECT nullif(btrim(st.phone), '') FROM public.students st
      WHERE st.user_id = p_user_id AND nullif(btrim(st.phone), '') IS NOT NULL)
  )
$$;
REVOKE EXECUTE ON FUNCTION app.phone_of(uuid) FROM PUBLIC, anon, authenticated;

/**
 * Whether the caller may see this person's number, once app.can_message_user
 * has said they may reach them at all: a pupil's number goes only to the
 * staff and to that pupil's own parents.
 */
CREATE OR REPLACE FUNCTION app.may_see_phone(p_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (
      SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_target AND r.slug = 'student'
    )
    OR app.is_staff_member()
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.student_guardians sg ON sg.student_id = s.id
      JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE s.user_id = p_target AND g.user_id = (SELECT auth.uid())
    )
$$;
REVOKE EXECUTE ON FUNCTION app.may_see_phone(uuid) FROM PUBLIC, anon, authenticated;

/** One person's number for their profile: null where the caller may not reach them, or none was given. */
CREATE OR REPLACE FUNCTION public.contact_phone(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN app.can_message_user(p_user_id) AND app.may_see_phone(p_user_id) THEN app.phone_of(p_user_id) END
$$;
REVOKE EXECUTE ON FUNCTION public.contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_phone(uuid) TO authenticated;

/**
 * The people of one's school by a name, a handle or their portal number,
 * typed the way people type them (app.fold, 00095), each with the number to
 * reach them on where the caller may see it.
 */
CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, nickname varchar, avatar_url varchar, roles jsonb, phone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_needle text;
BEGIN
  IF v_query IS NULL OR length(v_query) < 2 OR app.current_school_id() IS NULL THEN
    RETURN;
  END IF;
  v_needle := '%' || app.fold(regexp_replace(v_query, '\s+', ' ', 'g')) || '%';
  RETURN QUERY
  SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_url,
         coalesce((SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en))
                   FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb),
         CASE WHEN app.may_see_phone(u.id) THEN app.phone_of(u.id) END
  FROM public.users u
  WHERE u.school_id = app.current_school_id() AND u.is_active AND u.status = 'active' AND u.id <> (SELECT auth.uid())
    AND (
      app.fold(u.first_name) LIKE v_needle
      OR app.fold(u.last_name) LIKE v_needle
      OR app.fold(u.first_name || ' ' || u.last_name) LIKE v_needle
      OR app.fold(u.last_name || ' ' || u.first_name) LIKE v_needle
      -- A handle is typed with or without its leading @.
      OR u.nickname ILIKE '%' || ltrim(v_query, '@') || '%'
      -- The portal number on a person's card, whole.
      OR lower(u.public_id) = lower(v_query)
    )
    AND app.can_message_user(u.id)
  ORDER BY u.last_name, u.first_name
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.search_people(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_people(text, int) TO authenticated;
