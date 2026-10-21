-- ============================================================================
-- 00095 — Searching by name the way people type in Tajik
-- ============================================================================
-- A hurried hand, or a Russian keyboard, writes х for ҳ, к for қ, ч for ҷ,
-- и for ӣ, у for ӯ, г for ғ — and е for ё. A search for "Мехровар" found
-- nobody while Меҳровар was right there. Searches the site builds itself
-- match either letter of each pair already (src/lib/list-params.ts,
-- searchPattern); this is the same for the one search that runs in the
-- database: whom a person may write to (search_message_contacts).
-- ============================================================================

-- Text as a search compares it: lower case, each pair as one letter.
CREATE OR REPLACE FUNCTION app.fold(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT translate(lower(coalesce(p_text, '')), 'ҳқҷӣӯғё', 'хкчиуге')
$$;
REVOKE EXECUTE ON FUNCTION app.fold(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.fold(text) TO authenticated, service_role;

-- As in 00038, with names compared folded — the first name, the last name,
-- and the two together in either order ("Носирзода Меҳровар" as typed).
CREATE OR REPLACE FUNCTION public.search_message_contacts(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, nickname varchar, avatar_url varchar, roles jsonb)
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
                   FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb)
  FROM public.users u
  WHERE u.school_id = app.current_school_id() AND u.is_active AND u.status = 'active' AND u.id <> (SELECT auth.uid())
    AND (
      app.fold(u.first_name) LIKE v_needle
      OR app.fold(u.last_name) LIKE v_needle
      OR app.fold(u.first_name || ' ' || u.last_name) LIKE v_needle
      OR app.fold(u.last_name || ' ' || u.first_name) LIKE v_needle
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
