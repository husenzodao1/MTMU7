-- ============================================================================
-- 00065 · A chat that reaches you, a desk that answers, and a place that sends.
--
-- Three things, each small, all about messages:
--
--   1. A location could not be sent. 00063 taught the table what a location
--      is, but the guard trigger from 00027 still rewrites any type it does not
--      know into 'text' for an API caller — so the row arrived as a text
--      message carrying coordinates, and the check 00063 added refused it.
--      Every tap on the pin ended in "something went wrong".
--
--   2. Web Push. A message should reach somebody who has closed the tab. The
--      browser hands the portal an endpoint and two keys; they are kept here,
--      one row per device, and read back only by the server when a message
--      needs delivering.
--
--   3. Online support. Every signed-in person gets exactly one conversation
--      with the school's desk — the people who hold messages.moderate — and it
--      is an ordinary conversation, so it inherits the ticks, realtime, the
--      location pin and push without a line of new plumbing. A visitor who
--      cannot sign in leaves a note instead; the desk sees both in one inbox.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The guard lets a location through
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_message_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_conv public.conversations%ROWTYPE;
  v_other uuid;
  v_deleting boolean := TG_OP = 'UPDATE' AND NEW.is_deleted AND NOT OLD.is_deleted;
BEGIN
  -- "This message was deleted" should not still say where somebody was. This
  -- holds for everybody, a moderator's delete included, so it comes before the
  -- early return for trusted callers.
  IF v_deleting THEN
    NEW.location_lat := NULL;
    NEW.location_lng := NULL;
  END IF;
  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF v_conv.type = 'announcement' AND NOT EXISTS (
      SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id = NEW.sender_id AND cm.role = 'admin') THEN
      RAISE EXCEPTION 'only channel administrators can post here' USING ERRCODE = '42501';
    END IF;
    IF v_conv.type = 'direct' THEN
      SELECT cm.user_id INTO v_other FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id <> NEW.sender_id LIMIT 1;
      IF v_other IS NOT NULL AND app.is_blocked_between(NEW.sender_id, v_other) THEN
        RAISE EXCEPTION 'messaging_blocked' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- 'location' joins the list. Anything else a caller invents is still a
    -- sentence, and the location check then refuses coordinates on it.
    NEW.type := CASE WHEN NEW.type IN ('text', 'file', 'image', 'audio', 'location') THEN NEW.type ELSE 'text' END;
    NEW.is_pinned := false;
    NEW.is_edited := false;
    NEW.is_deleted := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.messages m WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id) THEN
      RAISE EXCEPTION 'reply must reference a message in the same conversation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- A place that could be moved afterwards would be a place nobody sent; the
  -- only change to it is losing it along with the message.
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR (NOT v_deleting AND (NEW.location_lat IS DISTINCT FROM OLD.location_lat
                             OR NEW.location_lng IS DISTINCT FROM OLD.location_lng)) THEN
    RAISE EXCEPTION 'protected message field cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_deleted THEN
    RAISE EXCEPTION 'deleted messages cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF v_deleting THEN
    NEW.deleted_at := now();
    NEW.deleted_by := (SELECT auth.uid());
    NEW.content := '';
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    IF OLD.created_at < now() - interval '48 hours' THEN
      RAISE EXCEPTION 'messages can only be edited within 48 hours' USING ERRCODE = '42501';
    END IF;
    NEW.is_edited := true;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- A deleted location keeps its type and loses its coordinates, so the check
-- asks for coordinates only on one that is still there. Dropped before the
-- tidy-up below, which the old check would refuse.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_location_check;
UPDATE public.messages SET location_lat = NULL, location_lng = NULL
WHERE is_deleted AND (location_lat IS NOT NULL OR location_lng IS NOT NULL);
ALTER TABLE public.messages ADD CONSTRAINT messages_location_check CHECK (
  CASE
    WHEN type = 'location' AND NOT is_deleted THEN
      location_lat IS NOT NULL AND location_lng IS NOT NULL
      AND location_lat BETWEEN -90 AND 90
      AND location_lng BETWEEN -180 AND 180
    ELSE location_lat IS NULL AND location_lng IS NULL
  END
);

-- ----------------------------------------------------------------------------
-- 2. Web Push subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- The push service's URL for one browser on one device. Unguessable, and
  -- the only thing that identifies the device, so it is the natural key.
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- The language the page was in when the person said yes: a notification
  -- has no request to read a locale from.
  locale varchar(5) NOT NULL DEFAULT 'tg',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_check CHECK (endpoint ~ '^https://[^[:space:]]+$' AND length(endpoint) <= 1000),
  CONSTRAINT push_subscriptions_keys_check CHECK (
    p256dh ~ '^[A-Za-z0-9_-]{40,200}={0,2}$' AND auth ~ '^[A-Za-z0-9_-]{10,100}={0,2}$'
  ),
  CONSTRAINT push_subscriptions_locale_check CHECK (locale IN ('tg', 'ru', 'en'))
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_read_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_read_own ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
-- Written only through save_push_subscription, which decides whose it is.
REVOKE INSERT, UPDATE ON public.push_subscriptions FROM anon, authenticated;

/**
 * Remembers this device for the caller.
 *
 * An endpoint that was somebody else's moves to the caller: on a shared family
 * computer the notifications belong to whoever is signed in now, not to
 * whoever said yes first. Ten devices a person is plenty; the eleventh pushes
 * out the one not seen for longest.
 */
CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_locale text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
BEGIN
  IF v_uid IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://[^[:space:]]+$' OR length(p_endpoint) > 1000
     OR coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{40,200}={0,2}$'
     OR coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{10,100}={0,2}$' THEN
    RAISE EXCEPTION 'invalid_subscription' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, school_id, endpoint, p256dh, auth, locale)
  VALUES (v_uid, v_school, p_endpoint, p_p256dh, p_auth, CASE WHEN p_locale IN ('tg', 'ru', 'en') THEN p_locale ELSE 'tg' END)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, school_id = EXCLUDED.school_id, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, locale = EXCLUDED.locale, last_seen_at = now();

  DELETE FROM public.push_subscriptions
  WHERE id IN (
    SELECT s.id FROM public.push_subscriptions s WHERE s.user_id = v_uid ORDER BY s.last_seen_at DESC OFFSET 10
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

/** Endpoints the push service says are gone: the browser unsubscribed or was reset. */
CREATE OR REPLACE FUNCTION public.forget_push_endpoints(p_endpoints text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.push_subscriptions WHERE endpoint = ANY (coalesce(p_endpoints, ARRAY[]::text[]));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.forget_push_endpoints(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forget_push_endpoints(text[]) TO service_role;

-- Each message is pushed once, whoever asks. The sender's browser asks right
-- after the insert; a second ask — a retry, a double tap, somebody replaying
-- the request — finds the row already here and gets nothing to send.
CREATE TABLE IF NOT EXISTS public.message_push_log (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  pushed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_push_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_push_log FROM anon, authenticated;

/**
 * Who should hear about one message, and what to tell them.
 *
 * Returns NULL when the message is unknown, deleted, older than ten minutes, or
 * was already claimed — each of which means "send nothing". Everybody in the
 * conversation except the sender, except those who muted it, switched message
 * notifications off, or hid this message from themselves. The school can turn
 * message notifications off altogether, and that holds here too.
 */
CREATE OR REPLACE FUNCTION public.claim_message_push(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg record;
  v_result jsonb;
BEGIN
  SELECT m.id, m.conversation_id, m.sender_id, m.school_id, m.type, m.content, m.created_at,
         c.type AS conversation_type, c.name AS conversation_name, c.created_by AS requester_id
  INTO v_msg
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id AND c.is_active
  WHERE m.id = p_message_id AND NOT m.is_deleted AND m.created_at > now() - interval '10 minutes';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.message_push_log (message_id) VALUES (p_message_id) ON CONFLICT (message_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT coalesce((SELECT ns.is_enabled FROM public.notification_settings ns
                   WHERE ns.school_id = v_msg.school_id AND ns.type = 'message'), true) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'message_id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'conversation_type', v_msg.conversation_type,
    'conversation_name', v_msg.conversation_name,
    'requester_id', v_msg.requester_id,
    'sender_id', v_msg.sender_id,
    'type', v_msg.type,
    'preview', left(v_msg.content, 160),
    'sender', (SELECT btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
               FROM public.users u WHERE u.id = v_msg.sender_id),
    'targets', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
                                          'auth', s.auth, 'locale', s.locale))
      FROM public.conversation_members cm
      JOIN public.users u ON u.id = cm.user_id AND u.is_active AND u.status IN ('active', 'graduated')
      JOIN public.push_subscriptions s ON s.user_id = cm.user_id
      LEFT JOIN public.user_settings us ON us.user_id = cm.user_id
      WHERE cm.conversation_id = v_msg.conversation_id
        AND cm.user_id IS DISTINCT FROM v_msg.sender_id
        AND NOT cm.is_muted
        AND coalesce(us.notifications_enabled, true)
        AND coalesce((us.notification_types ->> 'message')::boolean, true)
        AND NOT EXISTS (SELECT 1 FROM public.message_deletions d WHERE d.message_id = v_msg.id AND d.user_id = cm.user_id)
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_message_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_push(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Online support
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('direct', 'group', 'class_group', 'announcement', 'support'));

-- One desk conversation per person. Asking twice — two tabs, a double tap —
-- lands in the same one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_support_per_person
  ON public.conversations (school_id, created_by) WHERE type = 'support' AND is_active;

CREATE OR REPLACE FUNCTION app.is_support_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'support' AND c.is_active)
$$;
GRANT EXECUTE ON FUNCTION app.is_support_conversation(uuid) TO authenticated;

/**
 * The desk: everybody in the school who may moderate messages. Capped, because
 * every one of them joins every support conversation, and a school that ticked
 * the permission on a role of two hundred people did not mean that.
 */
CREATE OR REPLACE FUNCTION app.support_staff(p_school uuid)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id AND p.slug = 'messages.moderate'
  WHERE u.school_id = p_school AND u.is_active AND u.status = 'active'
  LIMIT 50
$$;
REVOKE EXECUTE ON FUNCTION app.support_staff(uuid) FROM PUBLIC, anon, authenticated;

/** Brings the desk up to date: whoever holds the permission today is in. */
CREATE OR REPLACE FUNCTION app.sync_support_staff(p_conversation_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  SELECT c.id, s.user_id, c.school_id, 'member'
  FROM public.conversations c
  CROSS JOIN LATERAL app.support_staff(c.school_id) s
  WHERE c.id = p_conversation_id AND c.type = 'support' AND c.is_active
  ON CONFLICT (conversation_id, user_id) DO NOTHING
$$;
REVOKE EXECUTE ON FUNCTION app.sync_support_staff(uuid) FROM PUBLIC, anon, authenticated;

/**
 * The caller's conversation with the desk, made on first use.
 *
 * Open to every signed-in member of a school, including those whose role does
 * not include messaging: asking the school for help is not a messaging
 * privilege, and the person who cannot find their way around is exactly the
 * one who needs it.
 */
CREATE OR REPLACE FUNCTION public.open_support_conversation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_conv uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO v_conv FROM public.conversations c
  WHERE c.school_id = v_school AND c.type = 'support' AND c.created_by = v_uid AND c.is_active;

  IF v_conv IS NULL THEN
    SELECT left(btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), 200)
    INTO v_name FROM public.users u WHERE u.id = v_uid;
    INSERT INTO public.conversations (school_id, type, name, created_by)
    VALUES (v_school, 'support', nullif(v_name, ''), v_uid)
    ON CONFLICT (school_id, created_by) WHERE type = 'support' AND is_active DO NOTHING
    RETURNING id INTO v_conv;
    IF v_conv IS NULL THEN
      SELECT c.id INTO v_conv FROM public.conversations c
      WHERE c.school_id = v_school AND c.type = 'support' AND c.created_by = v_uid AND c.is_active;
    END IF;
  END IF;

  -- Always, not only on creation: a member of the desk may have removed them.
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  VALUES (v_conv, v_uid, v_school, 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  PERFORM app.sync_support_staff(v_conv);
  RETURN v_conv;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.open_support_conversation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_support_conversation() TO authenticated;

/** A member of the desk opening a conversation from the inbox. */
CREATE OR REPLACE FUNCTION public.join_support_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT c.school_id INTO v_school FROM public.conversations c
  WHERE c.id = p_conversation_id AND c.type = 'support' AND c.is_active;
  IF v_school IS NULL OR NOT app.can(v_school, 'messages.moderate') OR v_school IS DISTINCT FROM app.current_school_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  VALUES (p_conversation_id, (SELECT auth.uid()), v_school, 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_support_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_support_conversation(uuid) TO authenticated;

-- A message into a support conversation brings the desk in before anything
-- else reacts to it: named to sort ahead of trg_on_message_created, which
-- decides who is notified from the members as they stand.
CREATE OR REPLACE FUNCTION app.on_support_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = NEW.conversation_id AND c.type = 'support') THEN
    PERFORM app.sync_support_staff(NEW.conversation_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_a_support_members ON public.messages;
CREATE TRIGGER trg_a_support_members AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.on_support_message();

-- Posting into your own support conversation needs no messaging permission.
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND school_id = (SELECT app.current_school_id())
  AND conversation_id = ANY ((SELECT app.my_conversation_ids())::uuid[])
  AND ((SELECT app.has_own_permission('messages.use')) OR app.is_support_conversation(conversation_id))
);

-- The conversation list learns who opened a conversation, so a support
-- conversation can be titled "Online support" for the person who asked and by
-- that person's name for the desk. Dropped rather than replaced: the result
-- gains a column.
DROP FUNCTION IF EXISTS public.list_my_conversations(int);
CREATE FUNCTION public.list_my_conversations(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, type varchar, name varchar, avatar_url varchar, updated_at timestamptz, is_muted boolean,
  last_message_content text, last_message_sender_id uuid, last_message_at timestamptz, last_message_deleted boolean,
  unread_count bigint, members jsonb, created_by uuid, last_message_type varchar
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.id, c.type, c.name, c.avatar_url, c.updated_at, me.is_muted,
         CASE WHEN lm.is_deleted THEN '' ELSE lm.content END, lm.sender_id, lm.created_at, lm.is_deleted,
         (SELECT count(*) FROM public.messages x
          WHERE x.conversation_id = c.id AND x.sender_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT x.is_deleted
            AND x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)),
         (SELECT jsonb_agg(jsonb_build_object('user_id', u.id, 'first_name', u.first_name, 'last_name', u.last_name,
                                              'avatar_url', u.avatar_url, 'role', cm.role) ORDER BY cm.joined_at)
          FROM (SELECT * FROM public.conversation_members cm2 WHERE cm2.conversation_id = c.id ORDER BY cm2.joined_at LIMIT 6) cm
          LEFT JOIN public.users u ON u.id = cm.user_id),
         c.created_by,
         lm.type
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at, m.is_deleted, m.type FROM public.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true
  WHERE c.is_active
  ORDER BY coalesce(lm.created_at, c.updated_at) DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_conversations(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations(int) TO authenticated;

/**
 * The desk's inbox: every support conversation in the school, the ones
 * waiting for an answer first. "Unread" is counted against the desk as a
 * whole — once any of them has read it, it is being dealt with.
 */
CREATE OR REPLACE FUNCTION public.list_support_inbox(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, requester_id uuid, requester_name text, requester_avatar text, requester_public_id text,
  requester_roles jsonb, last_message_content text, last_message_type text, last_message_sender_id uuid,
  last_message_at timestamptz, awaiting_reply boolean, unread_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'messages.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id,
         c.created_by,
         btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))::text,
         u.avatar_url::text,
         u.public_id::text,
         coalesce((SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en))
                   FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb),
         (CASE WHEN lm.is_deleted THEN '' ELSE lm.content END)::text,
         lm.type::text,
         lm.sender_id,
         lm.created_at,
         (lm.sender_id IS NOT DISTINCT FROM c.created_by),
         (SELECT count(*) FROM public.messages x
          WHERE x.conversation_id = c.id AND x.sender_id = c.created_by AND NOT x.is_deleted
            AND x.created_at > coalesce((SELECT max(cm.last_read_at) FROM public.conversation_members cm
                                         WHERE cm.conversation_id = c.id AND cm.user_id IS DISTINCT FROM c.created_by),
                                        '-infinity'::timestamptz))
  FROM public.conversations c
  LEFT JOIN public.users u ON u.id = c.created_by
  JOIN LATERAL (
    SELECT m.content, m.type, m.sender_id, m.created_at, m.is_deleted FROM public.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true
  WHERE c.school_id = v_school AND c.type = 'support' AND c.is_active
  ORDER BY (lm.sender_id IS NOT DISTINCT FROM c.created_by) DESC, lm.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 300);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_support_inbox(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_support_inbox(int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. A note from somebody who cannot sign in
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  -- A phone number or an address: how the desk gets back to them.
  contact varchar(160) NOT NULL,
  message text NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'open',
  handled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_requests_status_check CHECK (status IN ('open', 'done')),
  CONSTRAINT support_requests_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT support_requests_contact_check CHECK (length(btrim(contact)) BETWEEN 3 AND 160),
  CONSTRAINT support_requests_message_check CHECK (length(btrim(message)) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS idx_support_requests_school ON public.support_requests(school_id, status, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_requests_read ON public.support_requests;
CREATE POLICY support_requests_read ON public.support_requests FOR SELECT TO authenticated
  USING (app.can(school_id, 'messages.moderate'));
REVOKE INSERT, UPDATE, DELETE ON public.support_requests FROM anon, authenticated;

/**
 * Leaves a note for the desk without an account.
 *
 * Nobody is signed in, so nothing here can be trusted but the length of what
 * was typed. The flood limits are blunt on purpose: three notes from one
 * contact in ten minutes, sixty to a school in an hour. A school that gets
 * sixty genuine notes an hour has a bigger problem than this form.
 */
CREATE OR REPLACE FUNCTION public.submit_support_request(p_school_id uuid, p_name text, p_contact text, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_contact text := left(btrim(coalesce(p_contact, '')), 160);
  v_message text := left(btrim(coalesce(p_message, '')), 2000);
  v_id uuid;
  v_staff uuid[];
BEGIN
  IF NOT app.is_school_public(p_school_id) THEN
    RAISE EXCEPTION 'unknown_school' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 1 OR length(v_contact) < 3 OR length(v_message) < 1 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.support_requests r
      WHERE r.school_id = p_school_id AND lower(r.contact) = lower(v_contact) AND r.created_at > now() - interval '10 minutes') >= 3
     OR (SELECT count(*) FROM public.support_requests r
         WHERE r.school_id = p_school_id AND r.created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.support_requests (school_id, name, contact, message)
  VALUES (p_school_id, v_name, v_contact, v_message)
  RETURNING id INTO v_id;

  SELECT coalesce(array_agg(s.user_id), ARRAY[]::uuid[]) INTO v_staff FROM app.support_staff(p_school_id) s;
  PERFORM app.notify(v_staff, p_school_id, 'system', 'support', 'support.request',
    jsonb_build_object('name', v_name), '/admin/support', NULL, left(v_message, 200), 'support:requests');
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_support_request(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_support_request(uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_support_request(p_request_id uuid, p_done boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT r.school_id INTO v_school FROM public.support_requests r WHERE r.id = p_request_id;
  IF v_school IS NULL OR NOT app.can(v_school, 'messages.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.support_requests
  SET status = CASE WHEN p_done THEN 'done' ELSE 'open' END,
      handled_by = CASE WHEN p_done THEN (SELECT auth.uid()) ELSE NULL END,
      handled_at = CASE WHEN p_done THEN now() ELSE NULL END
  WHERE id = p_request_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_support_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_support_request(uuid, boolean) TO authenticated;
