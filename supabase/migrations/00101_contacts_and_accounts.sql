-- ============================================================================
-- 00101: Who reaches whom on WhatsApp, and the accounts on a profile
-- ============================================================================
-- 1. Pupils reach pupils (where the school lets pupils write to pupils at
--    all, app.can_message_user): boy to boy, girl to girl, girl to boy — and
--    boy to girl only within their own class. A boy who wants to reach a girl
--    of another class asks the school; the support desk (messages.moderate)
--    says yes or no, and the yes holds for that one girl. Before this, no
--    pupil saw another pupil's number at all (00099).
-- 2. Everyone may put their accounts elsewhere on their profile — Instagram,
--    Snapchat, Telegram (a name or a number), TikTok and the like — shown
--    to whoever may reach them (the same rule as their WhatsApp).
--
-- Nothing is dropped and no row is changed: two tables and their functions
-- are added, and contact_phone and search_people answer by the new rule.

-- ---------------------------------------------------------------------------
-- 1. Asking the school
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status varchar(10) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT contact_permissions_status_check CHECK (status IN ('pending', 'approved', 'declined')),
  CONSTRAINT contact_permissions_not_self CHECK (requester_id <> target_id),
  CONSTRAINT contact_permissions_pair UNIQUE (requester_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_permissions_school_status ON public.contact_permissions (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_contact_permissions_target ON public.contact_permissions (target_id);

ALTER TABLE public.contact_permissions ENABLE ROW LEVEL SECURITY;
-- One's own requests, and the desk's whole school; written only through the functions below.
DROP POLICY IF EXISTS contact_permissions_read ON public.contact_permissions;
CREATE POLICY contact_permissions_read ON public.contact_permissions FOR SELECT TO authenticated
  USING (requester_id = (SELECT auth.uid()) OR app.can(school_id, 'messages.moderate'));
GRANT SELECT ON public.contact_permissions TO authenticated;
-- Behind the second step like every table (00070).
DROP POLICY IF EXISTS mfa_gate ON public.contact_permissions;
CREATE POLICY mfa_gate ON public.contact_permissions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));

/** The pupil's gender as the school recorded it ('male', 'female'), or null: not a pupil, or not recorded. */
CREATE OR REPLACE FUNCTION app.pupil_gender(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.gender::text FROM public.students s WHERE s.user_id = p_user ORDER BY s.created_at DESC LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION app.pupil_gender(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.is_pupil(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p_user AND r.slug = 'student')
$$;
REVOKE EXECUTE ON FUNCTION app.is_pupil(uuid) FROM PUBLIC, anon, authenticated;

/** Both pupils sit in the same class today. */
CREATE OR REPLACE FUNCTION app.classmates_now(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students sa
    JOIN public.enrollments ea ON ea.student_id = sa.id AND ea.status = 'active'
    JOIN public.enrollments eb ON eb.class_id = ea.class_id AND eb.status = 'active'
    JOIN public.students sb ON sb.id = eb.student_id
    WHERE sa.user_id = p_a AND sb.user_id = p_b
      AND ea.enrolled_on <= app.school_today(sa.school_id) AND (ea.left_on IS NULL OR ea.left_on >= app.school_today(sa.school_id))
      AND eb.enrolled_on <= app.school_today(sb.school_id) AND (eb.left_on IS NULL OR eb.left_on >= app.school_today(sb.school_id))
  )
$$;
REVOKE EXECUTE ON FUNCTION app.classmates_now(uuid, uuid) FROM PUBLIC, anon, authenticated;

/**
 * How the caller may reach a person: 'open' (their number and accounts are
 * shown), 'ask' (a boy and a girl of another class: the school decides,
 * contact_permissions) or 'none'. A pupil whose gender was not recorded is
 * not taken for a girl; one asking is taken for a boy unless recorded a girl.
 */
CREATE OR REPLACE FUNCTION app.contact_rule(p_target uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_me uuid := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL OR p_target IS NULL OR p_target = v_me OR NOT app.can_message_user(p_target) THEN
    RETURN 'none';
  END IF;
  IF app.is_pupil(v_me) AND NOT app.is_staff_member() AND app.is_pupil(p_target) THEN
    IF app.pupil_gender(p_target) = 'female'
       AND app.pupil_gender(v_me) IS DISTINCT FROM 'female'
       AND NOT app.classmates_now(v_me, p_target)
       AND NOT EXISTS (
         SELECT 1 FROM public.contact_permissions cp
         WHERE cp.requester_id = v_me AND cp.target_id = p_target AND cp.status = 'approved'
       ) THEN
      RETURN 'ask';
    END IF;
    RETURN 'open';
  END IF;
  RETURN CASE WHEN app.may_see_phone(p_target) THEN 'open' ELSE 'none' END;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.contact_rule(uuid) FROM PUBLIC, anon, authenticated;

/** One person's number for their profile, by the rule above. */
CREATE OR REPLACE FUNCTION public.contact_phone(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN app.contact_rule(p_user_id) = 'open' THEN app.phone_of(p_user_id) END
$$;
REVOKE EXECUTE ON FUNCTION public.contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_phone(uuid) TO authenticated;

/**
 * Everything a profile shows of how to reach a person: the rule, the number
 * where it is open, the caller's request where one was made, and the accounts
 * the person added (section 2).
 */
CREATE OR REPLACE FUNCTION public.contact_card(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rule text := app.contact_rule(p_user_id);
BEGIN
  IF v_rule = 'ask' AND NOT app.reachable(p_user_id) THEN
    v_rule := 'none';
  END IF;
  RETURN jsonb_build_object(
    'rule', v_rule,
    'phone', CASE WHEN v_rule = 'open' THEN app.phone_of(p_user_id) END,
    'request', (SELECT cp.status FROM public.contact_permissions cp WHERE cp.requester_id = (SELECT auth.uid()) AND cp.target_id = p_user_id),
    'accounts', CASE WHEN v_rule = 'open' THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('platform', a.platform, 'handle', a.handle) ORDER BY a.platform)
      FROM public.user_social_accounts a WHERE a.user_id = p_user_id), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

/**
 * The people of one's school by a name, a handle or their portal number
 * (00099), each with how the caller may reach them: the number where it is
 * open, and 'ask' where the school decides.
 */
CREATE OR REPLACE FUNCTION public.find_people(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, nickname varchar, avatar_url varchar, roles jsonb, phone text, contact text)
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
  SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar_url, p.roles,
         CASE WHEN p.rule = 'open' THEN app.phone_of(p.id) END,
         CASE WHEN p.rule = 'ask' AND NOT app.reachable(p.id) THEN 'none' ELSE p.rule END
  FROM (
    SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_url,
           coalesce((SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en))
                     FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb) AS roles,
           app.contact_rule(u.id) AS rule
    FROM public.users u
    WHERE u.school_id = app.current_school_id() AND u.is_active AND u.status = 'active' AND u.id <> (SELECT auth.uid())
      AND (
        app.fold(u.first_name) LIKE v_needle
        OR app.fold(u.last_name) LIKE v_needle
        OR app.fold(u.first_name || ' ' || u.last_name) LIKE v_needle
        OR app.fold(u.last_name || ' ' || u.first_name) LIKE v_needle
        OR u.nickname ILIKE '%' || ltrim(v_query, '@') || '%'
        OR lower(u.public_id) = lower(v_query)
      )
      AND app.can_message_user(u.id)
    ORDER BY u.last_name, u.first_name
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  ) p;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.find_people(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_people(text, int) TO authenticated;

/** The older search (00099), by the same rule: a number only where it is open. */
CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, nickname varchar, avatar_url varchar, roles jsonb, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.id, f.first_name, f.last_name, f.nickname, f.avatar_url, f.roles, f.phone FROM public.find_people(p_query, p_limit) f
$$;
REVOKE EXECUTE ON FUNCTION public.search_people(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_people(text, int) TO authenticated;

/**
 * A boy asks to reach a girl of another class. Asked again after a "no" only
 * a day later. The desk is told (notifications, /admin/support?view=permissions).
 * Answers the request's status: 'pending', 'approved' (already open) or 'declined'.
 */
CREATE OR REPLACE FUNCTION public.ask_contact_permission(p_target uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_me uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_rule text := app.contact_rule(p_target);
  v_status text;
  v_staff uuid[];
  v_name text;
BEGIN
  IF v_rule = 'open' THEN
    RETURN 'approved';
  END IF;
  IF v_rule <> 'ask' OR v_school IS NULL OR NOT app.reachable(p_target) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.contact_permissions AS cp (school_id, requester_id, target_id)
  VALUES (v_school, v_me, p_target)
  ON CONFLICT (requester_id, target_id) DO UPDATE
    SET status = 'pending', created_at = now(), decided_at = NULL, decided_by = NULL
    WHERE cp.status = 'declined' AND cp.decided_at < now() - interval '1 day'
  RETURNING cp.status INTO v_status;

  IF v_status IS NULL THEN
    -- Asked already: the answer stands (or is still awaited).
    SELECT cp.status INTO v_status FROM public.contact_permissions cp WHERE cp.requester_id = v_me AND cp.target_id = p_target;
    RETURN v_status;
  END IF;

  SELECT btrim(u.first_name || ' ' || u.last_name) INTO v_name FROM public.users u WHERE u.id = v_me;
  SELECT coalesce(array_agg(s.user_id), ARRAY[]::uuid[]) INTO v_staff FROM app.support_staff(v_school) s;
  PERFORM app.notify(v_staff, v_school, 'system', 'support', 'contact.request',
    jsonb_build_object('name', v_name), '/admin/support?view=permissions', NULL, NULL, 'support:contact');
  RETURN v_status;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ask_contact_permission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_contact_permission(uuid) TO authenticated;

/** The desk's answer; the pupil who asked is told. */
CREATE OR REPLACE FUNCTION public.decide_contact_permission(p_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.contact_permissions%ROWTYPE;
  v_name text;
BEGIN
  SELECT * INTO v_row FROM public.contact_permissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_row.school_id, 'messages.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contact_permissions
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, decided_at = now(), decided_by = (SELECT auth.uid())
  WHERE id = p_id;
  SELECT btrim(u.first_name || ' ' || u.last_name) INTO v_name FROM public.users u WHERE u.id = v_row.target_id;
  PERFORM app.notify(ARRAY[v_row.requester_id], v_row.school_id, 'system', 'support',
    CASE WHEN p_approve THEN 'contact.approved' ELSE 'contact.declined' END,
    jsonb_build_object('name', v_name), '/support/contact', NULL, NULL, NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decide_contact_permission(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_contact_permission(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Accounts elsewhere, on one's profile
-- ---------------------------------------------------------------------------
-- The address is never stored: it is made from the service and the name
-- (src/lib/social/accounts.ts), so a profile can only ever link to the
-- service it says.
CREATE TABLE IF NOT EXISTS public.user_social_accounts (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  platform varchar(16) NOT NULL,
  handle varchar(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform),
  CONSTRAINT user_social_accounts_platform_check
    CHECK (platform IN ('instagram', 'snapchat', 'telegram', 'tiktok', 'facebook', 'youtube', 'x', 'vk', 'ok', 'linkedin')),
  CONSTRAINT user_social_accounts_handle_check CHECK (handle ~ '^\+?[A-Za-z0-9._-]{1,64}$')
);

ALTER TABLE public.user_social_accounts ENABLE ROW LEVEL SECURITY;
-- One's own, read and written; anybody else's only through contact_card.
DROP POLICY IF EXISTS user_social_accounts_own ON public.user_social_accounts;
CREATE POLICY user_social_accounts_own ON public.user_social_accounts FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = app.current_school_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_social_accounts TO authenticated;
DROP POLICY IF EXISTS mfa_gate ON public.user_social_accounts;
CREATE POLICY mfa_gate ON public.user_social_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT app.mfa_satisfied())) WITH CHECK ((SELECT app.mfa_satisfied()));

/** The person gave a way to be reached: a number, or an account elsewhere. Nothing to ask for otherwise. */
CREATE OR REPLACE FUNCTION app.reachable(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.phone_of(p_user) IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.user_social_accounts a WHERE a.user_id = p_user)
$$;
REVOKE EXECUTE ON FUNCTION app.reachable(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.contact_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_card(uuid) TO authenticated;
