-- ============================================================================
-- 00027 · Communication: messaging under RLS, safety (reports, blocks,
--         moderation), notifications v2 (templates, preferences, broadcasts,
--         event triggers).
--
-- Findings addressed: SEC-002 (chat via service role), SEC-003, SEC-010,
-- FUN-002 (oldest-message pagination), FUN-008 (hardcoded English
-- notifications), FUN-012.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Membership helpers (no recursive policies)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    JOIN public.conversations c ON c.id = cm.conversation_id AND c.is_active
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = (SELECT auth.uid())
      AND c.school_id = app.current_school_id()
  )
$$;

CREATE OR REPLACE FUNCTION app.is_conversation_admin(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'
  ) AND app.is_conversation_member(p_conversation_id)
$$;

CREATE OR REPLACE FUNCTION app.my_conversation_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(cm.conversation_id), ARRAY[]::uuid[])
  FROM public.conversation_members cm
  JOIN public.conversations c ON c.id = cm.conversation_id AND c.is_active
  WHERE cm.user_id = (SELECT auth.uid()) AND c.school_id = app.current_school_id()
$$;

GRANT EXECUTE ON FUNCTION app.is_conversation_member(uuid), app.is_conversation_admin(uuid), app.my_conversation_ids()
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Safety tables
-- ----------------------------------------------------------------------------
CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks(blocked_id);

CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason varchar(20) NOT NULL,
  details varchar(1000),
  status varchar(20) NOT NULL DEFAULT 'open',
  resolution_note varchar(1000),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reports_reason_check CHECK (reason IN ('abuse', 'bullying', 'spam', 'inappropriate', 'privacy', 'other')),
  CONSTRAINT message_reports_status_check CHECK (status IN ('open', 'dismissed', 'action_taken')),
  CONSTRAINT message_reports_unique UNIQUE (message_id, reporter_id)
);
CREATE INDEX idx_message_reports_school_status ON public.message_reports(school_id, status, created_at DESC);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_blocks_read ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));
CREATE POLICY user_blocks_insert ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id())
              AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = blocked_id AND u.school_id = school_id));
CREATE POLICY user_blocks_delete ON public.user_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

CREATE POLICY message_reports_read ON public.message_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR app.can(school_id, 'messages.moderate'));
REVOKE INSERT, UPDATE, DELETE ON public.message_reports FROM anon, authenticated;

CREATE OR REPLACE FUNCTION app.is_blocked_between(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b) OR (b.blocker_id = p_b AND b.blocked_id = p_a)
  )
$$;
REVOKE EXECUTE ON FUNCTION app.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.is_blocked_between(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Messaging policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_length CHECK (length(content) <= 5000);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_cursor ON public.messages(conversation_id, created_at DESC, id DESC);

SELECT app.drop_policies('public', 'conversations');
CREATE POLICY conversations_read ON public.conversations FOR SELECT TO authenticated
  USING (id = ANY ((SELECT app.my_conversation_ids())::uuid[]));
REVOKE INSERT, DELETE ON public.conversations FROM anon, authenticated;
REVOKE UPDATE ON public.conversations FROM anon, authenticated;

SELECT app.drop_policies('public', 'conversation_members');
CREATE POLICY conversation_members_read ON public.conversation_members FOR SELECT TO authenticated
  USING (conversation_id = ANY ((SELECT app.my_conversation_ids())::uuid[]));
CREATE POLICY conversation_members_update_self ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE INSERT, DELETE ON public.conversation_members FROM anon, authenticated;
REVOKE UPDATE ON public.conversation_members FROM anon, authenticated;
GRANT UPDATE (last_read_at, is_muted) ON public.conversation_members TO authenticated;

SELECT app.drop_policies('public', 'messages');
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated
  USING (conversation_id = ANY ((SELECT app.my_conversation_ids())::uuid[]));
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND school_id = (SELECT app.current_school_id())
  AND conversation_id = ANY ((SELECT app.my_conversation_ids())::uuid[])
  AND (SELECT app.has_own_permission('messages.use'))
);
CREATE POLICY messages_update_own ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) AND conversation_id = ANY ((SELECT app.my_conversation_ids())::uuid[]))
  WITH CHECK (sender_id = (SELECT auth.uid()));
REVOKE DELETE ON public.messages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION app.guard_message_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_conv public.conversations%ROWTYPE;
  v_other uuid;
BEGIN
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
    NEW.type := CASE WHEN NEW.type IN ('text', 'file', 'image', 'audio') THEN NEW.type ELSE 'text' END;
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

  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
     OR NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'protected message field cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF OLD.is_deleted THEN
    RAISE EXCEPTION 'deleted messages cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_deleted AND NOT OLD.is_deleted THEN
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
DROP TRIGGER IF EXISTS trg_a_guard_message_write ON public.messages;
CREATE TRIGGER trg_a_guard_message_write BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.guard_message_write();

-- Keep conversation ordering fresh without granting UPDATE to members.
CREATE OR REPLACE FUNCTION app.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id;
  UPDATE public.conversation_members SET last_read_at = NEW.created_at
  WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_conversation ON public.messages;
CREATE TRIGGER trg_touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.touch_conversation();

SELECT app.drop_policies('public', 'message_attachments');
CREATE POLICY message_attachments_read ON public.message_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND NOT m.is_deleted));
CREATE POLICY message_attachments_insert ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = (SELECT auth.uid())));

SELECT app.drop_policies('public', 'message_favorites');
CREATE POLICY message_favorites_read ON public.message_favorites FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY message_favorites_insert ON public.message_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id())
              AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id));
CREATE POLICY message_favorites_delete ON public.message_favorites FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

SELECT app.drop_policies('public', 'message_deletions');
CREATE POLICY message_deletions_read ON public.message_deletions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY message_deletions_insert ON public.message_deletions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id));
CREATE POLICY message_deletions_delete ON public.message_deletions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. Messaging RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.school_setting_bool(p_school uuid, p_key text, p_default boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT (s.settings ->> p_key)::boolean FROM public.schools s WHERE s.id = p_school), p_default)
$$;
GRANT EXECUTE ON FUNCTION app.school_setting_bool(uuid, text, boolean) TO authenticated;

-- Child-safety rule: may the caller start a conversation with this user?
CREATE OR REPLACE FUNCTION app.can_message_user(p_target uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_me_student boolean;
  v_target_student boolean;
BEGIN
  IF v_school IS NULL OR p_target = (SELECT auth.uid()) OR NOT app.has_own_permission('messages.use') THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_target AND u.school_id = v_school AND u.is_active AND u.status = 'active') THEN
    RETURN false;
  END IF;
  IF app.is_blocked_between((SELECT auth.uid()), p_target) THEN
    RETURN false;
  END IF;
  v_me_student := EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                          WHERE ur.user_id = (SELECT auth.uid()) AND r.slug = 'student')
                  AND NOT app.is_staff_member();
  v_target_student := EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                              WHERE ur.user_id = p_target AND r.slug = 'student');
  IF v_me_student AND v_target_student
     AND NOT app.school_setting_bool(v_school, 'messaging_student_to_student', true) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION app.can_message_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_conv uuid;
BEGIN
  IF NOT app.can_message_user(p_target_user_id) THEN
    RAISE EXCEPTION 'messaging_not_allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.id INTO v_conv
  FROM public.conversations c
  JOIN public.conversation_members a ON a.conversation_id = c.id AND a.user_id = v_uid
  JOIN public.conversation_members b ON b.conversation_id = c.id AND b.user_id = p_target_user_id
  WHERE c.type = 'direct' AND c.is_active AND c.school_id = v_school
  LIMIT 1;
  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations (school_id, type, created_by) VALUES (v_school, 'direct', v_uid) RETURNING id INTO v_conv;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  VALUES (v_conv, v_uid, v_school, 'member'), (v_conv, p_target_user_id, v_school, 'member');
  RETURN v_conv;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_group_conversation(p_name text, p_member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_school uuid := app.current_school_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_conv uuid;
  v_member uuid;
BEGIN
  IF v_school IS NULL OR NOT app.has_own_permission('messages.use') THEN
    RAISE EXCEPTION 'messaging_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT app.is_staff_member() AND NOT app.school_setting_bool(v_school, 'messaging_students_create_groups', false) THEN
    RAISE EXCEPTION 'group_creation_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_group_name' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_member_ids, 1), 0) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid_group_size' USING ERRCODE = '22023';
  END IF;
  FOREACH v_member IN ARRAY p_member_ids LOOP
    IF v_member <> v_uid AND NOT app.can_message_user(v_member) THEN
      RAISE EXCEPTION 'member_not_allowed' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  INSERT INTO public.conversations (school_id, type, name, created_by) VALUES (v_school, 'group', v_name, v_uid) RETURNING id INTO v_conv;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role) VALUES (v_conv, v_uid, v_school, 'admin');
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  SELECT DISTINCT v_conv, m, v_school, 'member' FROM unnest(p_member_ids) AS m WHERE m <> v_uid;
  RETURN v_conv;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_conversation_members(p_conversation_id uuid, p_member_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv public.conversations%ROWTYPE;
  v_member uuid;
  v_count int;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR v_conv.type = 'direct' OR NOT app.is_conversation_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOREACH v_member IN ARRAY coalesce(p_member_ids, ARRAY[]::uuid[]) LOOP
    IF NOT app.can_message_user(v_member) THEN
      RAISE EXCEPTION 'member_not_allowed' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  INSERT INTO public.conversation_members (conversation_id, user_id, school_id, role)
  SELECT DISTINCT p_conversation_id, m, v_conv.school_id, 'member' FROM unnest(p_member_ids) AS m
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_conv public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT app.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id <> v_uid AND (v_conv.type = 'direct' OR NOT app.is_conversation_admin(p_conversation_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.conversation_members WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  -- A group without an administrator gets the longest-standing member as admin.
  IF v_conv.type <> 'direct' AND NOT EXISTS (
    SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id AND role = 'admin') THEN
    UPDATE public.conversation_members SET role = 'admin'
    WHERE id = (SELECT id FROM public.conversation_members WHERE conversation_id = p_conversation_id ORDER BY joined_at LIMIT 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_conversation(p_conversation_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT app.is_conversation_admin(p_conversation_id) OR length(btrim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conversations SET name = btrim(p_name) WHERE id = p_conversation_id AND type <> 'direct';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_message_pinned(p_message_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv uuid;
  v_type text;
BEGIN
  SELECT m.conversation_id, c.type INTO v_conv, v_type
  FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE m.id = p_message_id;
  IF v_conv IS NULL OR NOT app.is_conversation_member(v_conv)
     OR (v_type <> 'direct' AND NOT app.is_conversation_admin(v_conv)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.messages SET is_pinned = p_pinned WHERE id = p_message_id AND NOT is_deleted;
END;
$$;

-- Latest-first cursor pagination (FUN-002). Runs under the caller's RLS.
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid, conversation_id uuid, sender_id uuid, sender_first_name varchar, sender_last_name varchar,
  sender_avatar_url varchar, content text, type varchar, reply_to_id uuid, is_pinned boolean,
  is_edited boolean, is_deleted boolean, is_favorite boolean, created_at timestamptz, edited_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.id, m.conversation_id, m.sender_id, u.first_name, u.last_name, u.avatar_url,
         CASE WHEN m.is_deleted THEN '' ELSE m.content END, m.type, m.reply_to_id, m.is_pinned,
         m.is_edited, m.is_deleted,
         EXISTS (SELECT 1 FROM public.message_favorites f WHERE f.message_id = m.id AND f.user_id = (SELECT auth.uid())),
         m.created_at, m.edited_at
  FROM public.messages m
  LEFT JOIN public.users u ON u.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (p_before_created_at IS NULL OR (m.created_at, m.id) < (p_before_created_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    AND NOT EXISTS (SELECT 1 FROM public.message_deletions d WHERE d.message_id = m.id AND d.user_id = (SELECT auth.uid()))
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- Conversation list with last message and unread count in one query.
CREATE OR REPLACE FUNCTION public.list_my_conversations(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, type varchar, name varchar, avatar_url varchar, updated_at timestamptz, is_muted boolean,
  last_message_content text, last_message_sender_id uuid, last_message_at timestamptz, last_message_deleted boolean,
  unread_count bigint, members jsonb
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
          LEFT JOIN public.users u ON u.id = cm.user_id)
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.content, m.sender_id, m.created_at, m.is_deleted FROM public.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true
  WHERE c.is_active
  ORDER BY coalesce(lm.created_at, c.updated_at) DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT count(*) FROM public.messages x
  JOIN public.conversation_members me ON me.conversation_id = x.conversation_id AND me.user_id = (SELECT auth.uid())
  WHERE x.sender_id IS DISTINCT FROM (SELECT auth.uid()) AND NOT x.is_deleted AND NOT me.is_muted
    AND x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.conversation_members SET last_read_at = now()
  WHERE conversation_id = p_conversation_id AND user_id = (SELECT auth.uid())
$$;

-- Messaging contact search under the child-safety rules.
CREATE OR REPLACE FUNCTION public.search_message_contacts(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, first_name varchar, last_name varchar, avatar_url varchar, roles jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
BEGIN
  IF v_query IS NULL OR length(v_query) < 2 OR app.current_school_id() IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT u.id, u.first_name, u.last_name, u.avatar_url,
         coalesce((SELECT jsonb_agg(jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en))
                   FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::jsonb)
  FROM public.users u
  WHERE u.school_id = app.current_school_id() AND u.is_active AND u.status = 'active' AND u.id <> (SELECT auth.uid())
    AND (u.first_name ILIKE '%' || v_query || '%' OR u.last_name ILIKE '%' || v_query || '%')
    AND app.can_message_user(u.id)
  ORDER BY u.last_name, u.first_name
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
END;
$$;

-- Safety: report a message (reporter must be a member).
CREATE OR REPLACE FUNCTION public.report_message(p_message_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg public.messages%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF NOT FOUND OR NOT app.is_conversation_member(v_msg.conversation_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_msg.sender_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'cannot_report_own_message' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.message_reports (school_id, message_id, conversation_id, reporter_id, reason, details)
  VALUES (v_msg.school_id, v_msg.id, v_msg.conversation_id, (SELECT auth.uid()), p_reason, left(p_details, 1000))
  ON CONFLICT (message_id, reporter_id) DO UPDATE SET details = EXCLUDED.details
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Moderators read reported messages only, with context, and every access is audited.
CREATE OR REPLACE FUNCTION public.moderation_get_report(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.message_reports%ROWTYPE;
  v_msg public.messages%ROWTYPE;
BEGIN
  SELECT * INTO v_report FROM public.message_reports WHERE id = p_report_id;
  IF NOT FOUND OR NOT app.can(v_report.school_id, 'messages.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = v_report.message_id;
  PERFORM app.write_audit(v_report.school_id, 'view', 'message_report', v_report.id, NULL, NULL,
    jsonb_build_object('message_id', v_report.message_id));
  RETURN jsonb_build_object(
    'report', to_jsonb(v_report),
    'message', jsonb_build_object('id', v_msg.id, 'content', v_msg.content, 'is_deleted', v_msg.is_deleted,
       'created_at', v_msg.created_at, 'sender', (SELECT jsonb_build_object('id', u.id, 'first_name', u.first_name,
         'last_name', u.last_name, 'public_id', u.public_id) FROM public.users u WHERE u.id = v_msg.sender_id)),
    'reporter', (SELECT jsonb_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'public_id', u.public_id)
                 FROM public.users u WHERE u.id = v_report.reporter_id),
    'context', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'content', CASE WHEN x.is_deleted THEN '' ELSE x.content END,
               'created_at', x.created_at) ORDER BY x.created_at)
      FROM (SELECT * FROM public.messages m WHERE m.conversation_id = v_msg.conversation_id
              AND m.created_at BETWEEN v_msg.created_at - interval '1 hour' AND v_msg.created_at + interval '1 hour'
            ORDER BY m.created_at LIMIT 20) x
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.moderation_resolve_report(p_report_id uuid, p_action text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.message_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_report FROM public.message_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR NOT app.can(v_report.school_id, 'messages.moderate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('dismiss', 'delete_message') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'delete_message' THEN
    UPDATE public.messages SET is_deleted = true, deleted_at = now(), deleted_by = (SELECT auth.uid()), content = ''
    WHERE id = v_report.message_id;
  END IF;
  UPDATE public.message_reports
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'action_taken' END,
      resolution_note = left(p_note, 1000), reviewed_by = (SELECT auth.uid()), reviewed_at = now()
  WHERE message_id = v_report.message_id AND status = 'open';
  PERFORM app.write_audit(v_report.school_id, p_action, 'message_report', v_report.id, NULL,
    jsonb_build_object('note', left(p_note, 1000)), jsonb_build_object('message_id', v_report.message_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.create_direct_conversation(uuid), public.create_group_conversation(text, uuid[]),
  public.add_conversation_members(uuid, uuid[]), public.remove_conversation_member(uuid, uuid),
  public.update_conversation(uuid, text), public.set_message_pinned(uuid, boolean),
  public.get_conversation_messages(uuid, timestamptz, uuid, int), public.list_my_conversations(int),
  public.get_unread_message_count(), public.mark_conversation_read(uuid), public.search_message_contacts(text, int),
  public.report_message(uuid, text, text), public.moderation_get_report(uuid), public.moderation_resolve_report(uuid, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.create_direct_conversation(uuid), public.create_group_conversation(text, uuid[]),
  public.add_conversation_members(uuid, uuid[]), public.remove_conversation_member(uuid, uuid),
  public.update_conversation(uuid, text), public.set_message_pinned(uuid, boolean),
  public.get_conversation_messages(uuid, timestamptz, uuid, int), public.list_my_conversations(int),
  public.get_unread_message_count(), public.mark_conversation_read(uuid), public.search_message_contacts(text, int),
  public.report_message(uuid, text, text), public.moderation_get_report(uuid), public.moderation_resolve_report(uuid, text, text)
TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Notifications v2
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS template_key varchar(60),
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS link_url varchar(500),
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_key varchar(120);
ALTER TABLE public.notifications ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'message', 'grade', 'homework', 'schedule', 'attendance', 'announcement', 'document', 'library',
  'system', 'friend', 'event', 'news', 'registration', 'moderation', 'broadcast'));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_link_check CHECK (link_url IS NULL OR link_url ~ '^/[^/]');
ALTER TABLE public.notifications ADD CONSTRAINT notifications_has_text CHECK (title IS NOT NULL OR template_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON public.notifications(user_id, group_key) WHERE NOT is_read AND group_key IS NOT NULL;

ALTER TABLE public.notification_settings DROP CONSTRAINT IF EXISTS notification_settings_type_check;
ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_type_check CHECK (type IN (
  'message', 'grade', 'homework', 'schedule', 'attendance', 'announcement', 'document', 'library',
  'system', 'friend', 'event', 'news', 'registration', 'moderation', 'broadcast'));
INSERT INTO public.notification_settings (school_id, type, is_enabled)
SELECT s.id, t, true FROM public.schools s,
  unnest(ARRAY['event', 'news', 'registration', 'moderation', 'broadcast']) AS t
ON CONFLICT (school_id, type) DO NOTHING;

SELECT app.drop_policies('public', 'notifications');
CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete_own_read ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_read);
REVOKE INSERT ON public.notifications FROM anon, authenticated;
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;

-- Central fan-out respecting school and personal preferences.
CREATE OR REPLACE FUNCTION app.notify(
  p_user_ids uuid[],
  p_school_id uuid,
  p_type text,
  p_module text,
  p_template_key text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_link_url text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_group_key text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_count int := 0;
  v_grouped int := 0;
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF NOT coalesce((SELECT ns.is_enabled FROM public.notification_settings ns WHERE ns.school_id = p_school_id AND ns.type = p_type), true) THEN
    RETURN 0;
  END IF;

  -- Collapse repeated unread notifications of the same group (e.g. chat bursts).
  IF p_group_key IS NOT NULL THEN
    UPDATE public.notifications n
    SET params = n.params || jsonb_build_object('count', coalesce((n.params ->> 'count')::int, 1) + 1) || p_params,
        body = coalesce(p_body, n.body), created_at = now(), actor_id = v_actor
    WHERE n.user_id = ANY (p_user_ids) AND n.group_key = p_group_key AND NOT n.is_read;
    GET DIAGNOSTICS v_grouped = ROW_COUNT;
  END IF;

  INSERT INTO public.notifications (user_id, school_id, type, module, template_key, params, link_url, title, body, actor_id, group_key)
  SELECT u.id, p_school_id, p_type, p_module, p_template_key, coalesce(p_params, '{}'::jsonb), p_link_url,
         left(p_title, 300), left(p_body, 1000), v_actor, p_group_key
  FROM public.users u
  LEFT JOIN public.user_settings us ON us.user_id = u.id
  WHERE u.id = ANY (p_user_ids)
    AND u.school_id = p_school_id AND u.is_active AND u.status IN ('active', 'graduated')
    AND u.id IS DISTINCT FROM v_actor
    AND coalesce(us.notifications_enabled, true)
    AND coalesce((us.notification_types ->> p_type)::boolean, true)
    AND NOT (p_group_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.user_id = u.id AND n.group_key = p_group_key AND NOT n.is_read));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count + v_grouped;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.notify(uuid[], uuid, text, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- Audience resolution shared by announcements and broadcasts.
CREATE OR REPLACE FUNCTION app.resolve_audience(
  p_school uuid, p_audience text, p_roles text[], p_class_ids uuid[], p_user_ids uuid[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(DISTINCT uid), ARRAY[]::uuid[]) FROM (
    SELECT u.id AS uid FROM public.users u
    WHERE u.school_id = p_school AND u.is_active AND u.status = 'active' AND p_audience IN ('school', 'public')
    UNION
    SELECT ur.user_id FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.school_id = p_school AND (
      (p_audience = 'staff' AND r.slug NOT IN ('student', 'parent'))
      OR (p_audience = 'students' AND r.slug = 'student')
      OR (p_audience = 'parents' AND r.slug = 'parent')
      OR (p_audience = 'roles' AND r.slug = ANY (p_roles))
    )
    UNION
    SELECT s.user_id FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
    WHERE p_audience = 'classes' AND e.class_id = ANY (p_class_ids) AND e.status = 'active' AND s.user_id IS NOT NULL
    UNION
    SELECT g.user_id FROM public.enrollments e
    JOIN public.student_guardians sg ON sg.student_id = e.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE p_audience = 'classes' AND e.class_id = ANY (p_class_ids) AND e.status = 'active' AND g.user_id IS NOT NULL
    UNION
    SELECT st.user_id FROM public.class_subjects cs JOIN public.staff st ON st.id = cs.teacher_id
    WHERE p_audience = 'classes' AND cs.class_id = ANY (p_class_ids) AND st.user_id IS NOT NULL
    UNION
    SELECT st.user_id FROM public.classes c JOIN public.staff st ON st.id = c.homeroom_staff_id
    WHERE p_audience = 'classes' AND c.id = ANY (p_class_ids) AND st.user_id IS NOT NULL
    UNION
    SELECT unnest(p_user_ids) WHERE p_audience = 'users'
  ) x
  WHERE uid IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION app.resolve_audience(uuid, text, text[], uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.student_family_user_ids(p_student_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT uid), ARRAY[]::uuid[]) FROM (
    SELECT s.user_id AS uid FROM public.students s WHERE s.id = p_student_id
    UNION
    SELECT g.user_id FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = p_student_id AND g.status = 'active'
  ) x WHERE uid IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION app.student_family_user_ids(uuid) FROM PUBLIC, anon, authenticated;

-- Broadcast notifications authored by administrators.
CREATE TABLE public.notification_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL,
  body varchar(1000),
  link_url varchar(500),
  audience_type varchar(10) NOT NULL DEFAULT 'school',
  audience_roles text[] NOT NULL DEFAULT '{}',
  audience_class_ids uuid[] NOT NULL DEFAULT '{}',
  audience_user_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  status varchar(10) NOT NULL DEFAULT 'draft',
  sent_count int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcasts_audience_check CHECK (audience_type IN ('school', 'staff', 'students', 'parents', 'roles', 'classes', 'users')),
  CONSTRAINT broadcasts_status_check CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  CONSTRAINT broadcasts_link_check CHECK (link_url IS NULL OR link_url ~ '^/[^/]'),
  CONSTRAINT broadcasts_targets_check CHECK (
    (audience_type <> 'roles' OR cardinality(audience_roles) > 0)
    AND (audience_type <> 'classes' OR cardinality(audience_class_ids) > 0)
    AND (audience_type <> 'users' OR cardinality(audience_user_ids) BETWEEN 1 AND 500)
  ),
  CONSTRAINT broadcasts_schedule_check CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL)
);
CREATE INDEX idx_broadcasts_due ON public.notification_broadcasts(scheduled_at) WHERE status = 'scheduled';
CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.notification_broadcasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION app.guard_broadcast_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY NEW.audience_class_ids LOOP
    PERFORM app.assert_same_school(NEW.school_id, 'classes', v_id);
  END LOOP;
  FOREACH v_id IN ARRAY NEW.audience_user_ids LOOP
    PERFORM app.assert_same_school(NEW.school_id, 'users', v_id);
  END LOOP;
  IF app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
      NEW.sent_count := 0;
      NEW.sent_at := NULL;
      IF NEW.status = 'sent' THEN
        RAISE EXCEPTION 'use send_notification_broadcast()' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF OLD.status = 'sent' OR NEW.status = 'sent' OR NEW.sent_count IS DISTINCT FROM OLD.sent_count THEN
        RAISE EXCEPTION 'sent broadcasts are immutable' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_broadcast_write BEFORE INSERT OR UPDATE ON public.notification_broadcasts
  FOR EACH ROW EXECUTE FUNCTION app.guard_broadcast_write();

ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY broadcasts_manage ON public.notification_broadcasts FOR ALL TO authenticated
  USING (app.can(school_id, 'notifications.send')) WITH CHECK (app.can(school_id, 'notifications.send'));

CREATE OR REPLACE FUNCTION app.dispatch_broadcast(p_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_b public.notification_broadcasts%ROWTYPE;
  v_count int;
BEGIN
  SELECT * INTO v_b FROM public.notification_broadcasts WHERE id = p_id FOR UPDATE;
  IF v_b.status IN ('sent', 'cancelled') THEN
    RETURN 0;
  END IF;
  v_count := app.notify(
    app.resolve_audience(v_b.school_id, v_b.audience_type, v_b.audience_roles, v_b.audience_class_ids, v_b.audience_user_ids),
    v_b.school_id, 'broadcast', 'notifications', NULL, '{}'::jsonb, v_b.link_url, v_b.title, v_b.body);
  UPDATE public.notification_broadcasts SET status = 'sent', sent_count = v_count, sent_at = now() WHERE id = p_id;
  PERFORM app.write_audit(v_b.school_id, 'send', 'notification_broadcast', p_id, NULL, jsonb_build_object('recipients', v_count), NULL);
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.dispatch_broadcast(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_notification_broadcast(p_broadcast_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.notification_broadcasts WHERE id = p_broadcast_id;
  IF v_school IS NULL OR NOT app.can(v_school, 'notifications.send') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN app.dispatch_broadcast(p_broadcast_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_notification_broadcast(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification_broadcast(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Event-driven notifications
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.dispatch_announcement(p_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a public.announcements%ROWTYPE;
  v_count int;
BEGIN
  SELECT * INTO v_a FROM public.announcements WHERE id = p_id FOR UPDATE;
  IF v_a.status <> 'published' OR v_a.notified_at IS NOT NULL OR v_a.publish_at > now() THEN
    RETURN 0;
  END IF;
  v_count := app.notify(
    app.resolve_audience(v_a.school_id, v_a.audience_type, v_a.audience_roles, v_a.audience_class_ids, v_a.audience_user_ids),
    v_a.school_id, 'announcement', 'announcements', 'announcement.published',
    jsonb_build_object('title', v_a.title, 'priority', v_a.priority), '/announcements?focus=' || v_a.id::text);
  UPDATE public.announcements SET notified_at = now() WHERE id = p_id;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.dispatch_announcement(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.on_announcement_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.notified_at IS NULL AND NEW.publish_at <= now() THEN
    PERFORM app.dispatch_announcement(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_announcement_published AFTER INSERT OR UPDATE OF status ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION app.on_announcement_published();

-- Scheduler entry point (service role / pg_cron): due broadcasts and announcements.
CREATE OR REPLACE FUNCTION public.dispatch_due_notifications()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  v_broadcasts int := 0;
  v_announcements int := 0;
BEGIN
  FOR r IN SELECT id FROM public.notification_broadcasts WHERE status = 'scheduled' AND scheduled_at <= now() LIMIT 200 LOOP
    PERFORM app.dispatch_broadcast(r.id);
    v_broadcasts := v_broadcasts + 1;
  END LOOP;
  FOR r IN SELECT id FROM public.announcements WHERE status = 'published' AND notified_at IS NULL AND publish_at <= now() LIMIT 200 LOOP
    PERFORM app.dispatch_announcement(r.id);
    v_announcements := v_announcements + 1;
  END LOOP;
  RETURN jsonb_build_object('broadcasts', v_broadcasts, 'announcements', v_announcements);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.dispatch_due_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_notifications() TO service_role;

CREATE OR REPLACE FUNCTION app.on_message_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sender public.users%ROWTYPE;
  v_recipients uuid[];
BEGIN
  SELECT * INTO v_sender FROM public.users WHERE id = NEW.sender_id;
  SELECT coalesce(array_agg(cm.user_id), ARRAY[]::uuid[]) INTO v_recipients
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id IS DISTINCT FROM NEW.sender_id AND NOT cm.is_muted;
  PERFORM app.notify(v_recipients, NEW.school_id, 'message', 'messages', 'message.new',
    jsonb_build_object('sender', btrim(coalesce(v_sender.first_name, '') || ' ' || coalesce(v_sender.last_name, '')),
                       'conversation_id', NEW.conversation_id),
    '/messages/' || NEW.conversation_id::text, NULL, left(NEW.content, 200), 'conversation:' || NEW.conversation_id::text);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_on_message_created ON public.messages;
CREATE TRIGGER trg_on_message_created AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION app.on_message_created();

CREATE OR REPLACE FUNCTION app.on_grade_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subject jsonb;
BEGIN
  SELECT jsonb_build_object('subject_tg', s.name_tg, 'subject_ru', s.name_ru, 'subject_en', s.name_en) INTO v_subject
  FROM public.class_subjects cs JOIN public.subjects s ON s.id = cs.subject_id WHERE cs.id = NEW.class_subject_id;
  PERFORM app.notify(app.student_family_user_ids(NEW.student_id), NEW.school_id, 'grade', 'grades', 'grade.new',
    coalesce(v_subject, '{}'::jsonb) || jsonb_build_object('score', NEW.score, 'max_score', NEW.max_score, 'student_id', NEW.student_id),
    '/grades');
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_grade_created AFTER INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION app.on_grade_created();

CREATE OR REPLACE FUNCTION app.on_attendance_marked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('absent', 'late') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('absent', 'late')) THEN
    PERFORM app.notify(
      ARRAY(SELECT g.user_id FROM public.student_guardians sg JOIN public.guardians g ON g.id = sg.guardian_id
            WHERE sg.student_id = NEW.student_id AND g.user_id IS NOT NULL),
      NEW.school_id, 'attendance', 'attendance', 'attendance.' || NEW.status,
      jsonb_build_object('date', NEW.attendance_date, 'student_id', NEW.student_id,
        'student', (SELECT btrim(s.first_name || ' ' || s.last_name) FROM public.students s WHERE s.id = NEW.student_id)),
      '/attendance', NULL, NULL, 'attendance:' || NEW.student_id::text || ':' || NEW.attendance_date::text);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_attendance_marked AFTER INSERT OR UPDATE OF status ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION app.on_attendance_marked();

CREATE OR REPLACE FUNCTION app.on_homework_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_class uuid;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    SELECT class_id INTO v_class FROM public.class_subjects WHERE id = NEW.class_subject_id;
    PERFORM app.notify(
      ARRAY(SELECT uid FROM unnest(app.resolve_audience(NEW.school_id, 'classes', '{}', ARRAY[v_class], '{}')) uid
            WHERE uid IS DISTINCT FROM NEW.created_by),
      NEW.school_id, 'homework', 'homework', 'homework.published',
      jsonb_build_object('title', NEW.title, 'due_at', NEW.due_at), '/homework');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_homework_published AFTER INSERT OR UPDATE OF status ON public.homework_assignments
  FOR EACH ROW EXECUTE FUNCTION app.on_homework_published();

CREATE OR REPLACE FUNCTION app.on_registration_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM app.notify(
      ARRAY(SELECT DISTINCT ur.user_id FROM public.user_roles ur
            JOIN public.role_permissions rp ON rp.role_id = ur.role_id
            JOIN public.permissions p ON p.id = rp.permission_id AND p.slug = 'users.approve'
            WHERE ur.school_id = NEW.school_id),
      NEW.school_id, 'registration', 'users', 'registration.pending',
      jsonb_build_object('name', btrim(NEW.first_name || ' ' || NEW.last_name)), '/admin/approvals',
      NULL, NULL, 'registrations:' || NEW.school_id::text);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_registration_created AFTER INSERT ON public.registration_requests
  FOR EACH ROW EXECUTE FUNCTION app.on_registration_created();

CREATE OR REPLACE FUNCTION app.on_message_reported()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.notify(
    ARRAY(SELECT DISTINCT ur.user_id FROM public.user_roles ur
          JOIN public.role_permissions rp ON rp.role_id = ur.role_id
          JOIN public.permissions p ON p.id = rp.permission_id AND p.slug = 'messages.moderate'
          WHERE ur.school_id = NEW.school_id),
    NEW.school_id, 'moderation', 'messages', 'moderation.report', jsonb_build_object('reason', NEW.reason),
    '/admin/moderation', NULL, NULL, 'moderation:' || NEW.school_id::text);
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_message_reported AFTER INSERT ON public.message_reports
  FOR EACH ROW EXECUTE FUNCTION app.on_message_reported();

CREATE OR REPLACE FUNCTION app.on_friend_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor public.users%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT * INTO v_actor FROM public.users WHERE id = NEW.sender_id;
    PERFORM app.notify(ARRAY[NEW.receiver_id], NEW.school_id, 'friend', 'friends', 'friend.request',
      jsonb_build_object('name', btrim(v_actor.first_name || ' ' || v_actor.last_name), 'user_id', NEW.sender_id),
      '/profile/' || NEW.sender_id::text);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT * INTO v_actor FROM public.users WHERE id = NEW.receiver_id;
    PERFORM app.notify(ARRAY[NEW.sender_id], NEW.school_id, 'friend', 'friends', 'friend.accepted',
      jsonb_build_object('name', btrim(v_actor.first_name || ' ' || v_actor.last_name), 'user_id', NEW.receiver_id),
      '/profile/' || NEW.receiver_id::text);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_on_friend_request_change AFTER INSERT OR UPDATE OF status ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION app.on_friend_request_change();

-- Friend requests: same-school active users only.
CREATE OR REPLACE FUNCTION app.guard_friend_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND app.is_api_caller() THEN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.receiver_id AND u.school_id = NEW.school_id AND u.is_active) THEN
      RAISE EXCEPTION 'user_not_available' USING ERRCODE = '42501';
    END IF;
    IF app.is_blocked_between(NEW.sender_id, NEW.receiver_id) THEN
      RAISE EXCEPTION 'user_not_available' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_friend_request BEFORE INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION app.guard_friend_request();

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'app' AND p.prorettype = 'trigger'::regtype LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- Realtime for new tables users subscribe to.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements';
  END IF;
END $$;
