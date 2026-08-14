-- Enable RLS on all tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_role_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_item_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's school_id
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS UUID AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if current user has a specific permission
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
    AND p.slug = p_permission_slug
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if current user has admin role
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
    AND r.slug = 'admin'
    AND r.school_id = public.current_user_school_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- SCHOOLS
-- ============================================================
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_user_school_id() AND is_active = true);

CREATE POLICY schools_select_admin ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY schools_update_admin ON public.schools FOR UPDATE TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY users_select_admin ON public.users FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY users_insert_admin ON public.users FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY users_update_admin ON public.users FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ROLES
-- ============================================================
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY roles_insert_admin ON public.roles FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY roles_update_admin ON public.roles FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- PERMISSIONS (global, read-only for users)
-- ============================================================
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- USER_ROLES
-- ============================================================
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_roles_select_admin ON public.user_roles FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_insert_admin ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_update_admin ON public.user_roles FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_delete_admin ON public.user_roles FOR DELETE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ROLE_PERMISSIONS
-- ============================================================
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ));

CREATE POLICY role_permissions_insert_admin ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ) AND public.current_user_is_admin());

CREATE POLICY role_permissions_delete_admin ON public.role_permissions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ) AND public.current_user_is_admin());

-- ============================================================
-- MODULES (global, read-only)
-- ============================================================
CREATE POLICY modules_select ON public.modules FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- SCHOOL_MODULES
-- ============================================================
CREATE POLICY school_modules_select ON public.school_modules FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY school_modules_update_admin ON public.school_modules FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY school_modules_insert_admin ON public.school_modules FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- MODULE_ROLE_ACCESS
-- ============================================================
CREATE POLICY module_role_access_select ON public.module_role_access FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY module_role_access_manage_admin ON public.module_role_access FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ACADEMIC_YEARS
-- ============================================================
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY academic_years_manage_admin ON public.academic_years FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- CLASSES
-- ============================================================
CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY classes_select_admin ON public.classes FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY classes_manage_admin ON public.classes FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- SUBJECTS
-- ============================================================
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY subjects_select_admin ON public.subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY subjects_manage_admin ON public.subjects FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- CLASS_STUDENTS
-- ============================================================
CREATE POLICY class_students_select ON public.class_students FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY class_students_manage ON public.class_students FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    public.current_user_is_admin() OR public.current_user_has_permission('classes.manage')
  ))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- TEACHER_SUBJECTS
-- ============================================================
CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY teacher_subjects_manage ON public.teacher_subjects FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    public.current_user_is_admin() OR public.current_user_has_permission('classes.manage')
  ))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated
  USING (
    school_id = public.current_user_school_id() AND
    (created_by = auth.uid() OR public.current_user_is_admin())
  );

-- ============================================================
-- CONVERSATION_MEMBERS
-- ============================================================
CREATE POLICY conv_members_select ON public.conversation_members FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.conversation_members cm2
      WHERE cm2.conversation_id = conversation_id AND cm2.user_id = auth.uid()
    )
  ));

CREATE POLICY conv_members_insert ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY conv_members_update_own ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    is_deleted = false AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_user_school_id() AND
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_update_own ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- MESSAGE_ATTACHMENTS
-- ============================================================
CREATE POLICY msg_attachments_select ON public.message_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_id AND cm.user_id = auth.uid() AND m.is_deleted = false
  ));

CREATE POLICY msg_attachments_insert ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  ));

-- ============================================================
-- LIBRARY_CATEGORIES
-- ============================================================
CREATE POLICY lib_categories_select ON public.library_categories FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY lib_categories_manage_admin ON public.library_categories FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_ITEMS
-- ============================================================
CREATE POLICY lib_items_select ON public.library_items FOR SELECT TO authenticated
  USING (
    school_id = public.current_user_school_id() AND
    is_published = true AND
    (
      visibility = 'all'
      OR (visibility = 'teachers' AND EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.level <= 4
      ))
      OR (visibility = 'admin' AND EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.level <= 3
      ))
      OR (visibility = 'specific' AND (
        EXISTS (
          SELECT 1 FROM public.library_item_access lia
          JOIN public.user_roles ur ON ur.role_id = lia.role_id
          WHERE lia.item_id = library_items.id AND ur.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.library_item_access lia
          JOIN public.class_students cs ON cs.class_id = lia.class_id
          WHERE lia.item_id = library_items.id AND cs.student_id = auth.uid()
        )
      ))
      OR public.current_user_is_admin()
    )
  );

CREATE POLICY lib_items_select_admin ON public.library_items FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY lib_items_manage ON public.library_items FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('library.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_ITEM_ACCESS
-- ============================================================
CREATE POLICY lib_item_access_select ON public.library_item_access FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY lib_item_access_manage ON public.library_item_access FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('library.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_FAVORITES
-- ============================================================
CREATE POLICY lib_favorites_select ON public.library_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lib_favorites_insert ON public.library_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY lib_favorites_delete ON public.library_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- LIBRARY_READING_HISTORY
-- ============================================================
CREATE POLICY lib_history_select ON public.library_reading_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lib_history_upsert ON public.library_reading_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY lib_history_update ON public.library_reading_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own_read ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_read = true);

-- ============================================================
-- NOTIFICATION_SETTINGS
-- ============================================================
CREATE POLICY notif_settings_select ON public.notification_settings FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY notif_settings_manage ON public.notification_settings FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('notifications.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('audit_logs.read'));

-- INSERT only via service_role (no RLS policy for authenticated insert)

-- ============================================================
-- PAGES
-- ============================================================
CREATE POLICY pages_select_published ON public.pages FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_published = true);

CREATE POLICY pages_select_admin ON public.pages FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY pages_manage_admin ON public.pages FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- CONTENT_BLOCKS
-- ============================================================
CREATE POLICY content_blocks_select_visible ON public.content_blocks FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_visible = true);

CREATE POLICY content_blocks_select_admin ON public.content_blocks FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY content_blocks_manage_admin ON public.content_blocks FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());
