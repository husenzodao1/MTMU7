-- ============================================================
-- SYSTEM TRIGGERS
-- ============================================================

-- 1. update_updated_at — auto-set updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    AND table_name != 'audit_logs'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      t
    );
  END LOOP;
END;
$$;

-- 2. Soft delete timestamp management
CREATE OR REPLACE FUNCTION public.update_soft_delete_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- is_active → deactivated_at
  IF TG_TABLE_NAME IN ('schools', 'users', 'roles', 'classes', 'subjects', 'conversations') THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      NEW.deactivated_at = now();
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      NEW.deactivated_at = NULL;
    END IF;
  END IF;

  -- is_deleted → deleted_at (messages)
  IF TG_TABLE_NAME = 'messages' THEN
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      NEW.deleted_at = now();
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
      NEW.deleted_at = NULL;
    END IF;
  END IF;

  -- is_published → unpublished_at
  IF TG_TABLE_NAME IN ('library_items', 'pages') THEN
    IF OLD.is_published = true AND NEW.is_published = false THEN
      NEW.unpublished_at = now();
    ELSIF OLD.is_published = false AND NEW.is_published = true THEN
      NEW.unpublished_at = NULL;
    END IF;
  END IF;

  -- is_visible → hidden_at
  IF TG_TABLE_NAME = 'content_blocks' THEN
    IF OLD.is_visible = true AND NEW.is_visible = false THEN
      NEW.hidden_at = now();
    ELSIF OLD.is_visible = false AND NEW.is_visible = true THEN
      NEW.hidden_at = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply soft delete triggers
CREATE TRIGGER trg_soft_delete_schools BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_roles BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_classes BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_subjects BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_conversations BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_messages BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_library_items BEFORE UPDATE ON public.library_items FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_pages BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_content_blocks BEFORE UPDATE ON public.content_blocks FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();

-- 3. Prevent audit log modification
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_modification
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- 4. Prevent system role deletion
CREATE OR REPLACE FUNCTION public.prevent_system_role_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'System roles cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_system_role_delete
  BEFORE DELETE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_role_delete();

-- 5. Prevent school deletion
CREATE OR REPLACE FUNCTION public.prevent_school_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Schools cannot be physically deleted. Use soft delete (is_active = false) instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_school_delete
  BEFORE DELETE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_school_delete();

-- ============================================================
-- CROSS-SCHOOL VALIDATION TRIGGERS
-- ============================================================

-- Helper: get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_user_id;
  RETURN v_school_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: check if user has role in school
CREATE OR REPLACE FUNCTION public.user_has_role_in_school(p_user_id UUID, p_school_id UUID, p_role_slugs TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND ur.school_id = p_school_id
    AND r.slug = ANY(p_role_slugs)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. validate_user_role_school_match
CREATE OR REPLACE FUNCTION public.validate_user_role_school_match()
RETURNS TRIGGER AS $$
DECLARE
  v_user_school UUID;
  v_role_school UUID;
BEGIN
  SELECT school_id INTO v_user_school FROM public.users WHERE id = NEW.user_id;
  SELECT school_id INTO v_role_school FROM public.roles WHERE id = NEW.role_id;

  IF v_user_school IS DISTINCT FROM NEW.school_id OR v_role_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: user, role, and user_role must belong to the same school';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_user_role_school
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_role_school_match();

-- 8. validate_class_student_school (+ student role check)
CREATE OR REPLACE FUNCTION public.validate_class_student_school()
RETURNS TRIGGER AS $$
DECLARE
  v_class_school UUID;
  v_user_school UUID;
BEGIN
  SELECT school_id INTO v_class_school FROM public.classes WHERE id = NEW.class_id;
  SELECT school_id INTO v_user_school FROM public.users WHERE id = NEW.student_id;

  IF v_class_school IS DISTINCT FROM NEW.school_id OR v_user_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in class_students';
  END IF;

  IF NOT public.user_has_role_in_school(NEW.student_id, NEW.school_id, ARRAY['student']) THEN
    RAISE EXCEPTION 'User must have student role to be enrolled in a class';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_class_student_school
  BEFORE INSERT OR UPDATE ON public.class_students
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_student_school();

-- 9. validate_teacher_subject_school (+ teacher role check)
CREATE OR REPLACE FUNCTION public.validate_teacher_subject_school()
RETURNS TRIGGER AS $$
DECLARE
  v_teacher_school UUID;
  v_subject_school UUID;
  v_class_school UUID;
  v_year_school UUID;
BEGIN
  SELECT school_id INTO v_teacher_school FROM public.users WHERE id = NEW.teacher_id;
  SELECT school_id INTO v_subject_school FROM public.subjects WHERE id = NEW.subject_id;
  SELECT school_id INTO v_class_school FROM public.classes WHERE id = NEW.class_id;
  SELECT school_id INTO v_year_school FROM public.academic_years WHERE id = NEW.academic_year_id;

  IF v_teacher_school IS DISTINCT FROM NEW.school_id
    OR v_subject_school IS DISTINCT FROM NEW.school_id
    OR v_class_school IS DISTINCT FROM NEW.school_id
    OR v_year_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in teacher_subjects';
  END IF;

  IF NOT public.user_has_role_in_school(NEW.teacher_id, NEW.school_id, ARRAY['teacher', 'vice_principal', 'director']) THEN
    RAISE EXCEPTION 'User must have a teaching role (teacher, vice_principal, or director) to be assigned to teacher_subjects';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_teacher_subject_school
  BEFORE INSERT OR UPDATE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.validate_teacher_subject_school();

-- 10. validate_class_school
CREATE OR REPLACE FUNCTION public.validate_class_school()
RETURNS TRIGGER AS $$
DECLARE
  v_year_school UUID;
  v_teacher_school UUID;
BEGIN
  SELECT school_id INTO v_year_school FROM public.academic_years WHERE id = NEW.academic_year_id;
  IF v_year_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: academic_year must belong to same school as class';
  END IF;

  IF NEW.homeroom_teacher_id IS NOT NULL THEN
    SELECT school_id INTO v_teacher_school FROM public.users WHERE id = NEW.homeroom_teacher_id;
    IF v_teacher_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: homeroom teacher must belong to same school';
    END IF;
    IF NOT public.user_has_role_in_school(NEW.homeroom_teacher_id, NEW.school_id, ARRAY['teacher', 'vice_principal', 'director']) THEN
      RAISE EXCEPTION 'Homeroom teacher must have a teaching role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_class_school
  BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_school();

-- 11-13. Conversation/member/message school validation
CREATE OR REPLACE FUNCTION public.validate_conversation_school()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.classes WHERE id = NEW.class_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: conversation class must belong to same school';
    END IF;
  END IF;
  IF NEW.created_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.created_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: conversation creator must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_conversation_school
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_school();

CREATE OR REPLACE FUNCTION public.validate_conv_member_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.conversations WHERE id = NEW.conversation_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in conversation_members';
  END IF;
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in conversation_members (user)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_conv_member_school
  BEFORE INSERT OR UPDATE ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_conv_member_school();

CREATE OR REPLACE FUNCTION public.validate_message_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.conversations WHERE id = NEW.conversation_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in messages';
  END IF;
  IF NEW.sender_id IS NOT NULL AND public.get_user_school_id(NEW.sender_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in messages (sender)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_message_school
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_school();

-- 14. validate_library_item_school
CREATE OR REPLACE FUNCTION public.validate_library_item_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.library_categories WHERE id = NEW.category_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: library category must belong to same school';
  END IF;
  IF NEW.subject_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.subjects WHERE id = NEW.subject_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: subject must belong to same school';
    END IF;
  END IF;
  IF NEW.uploaded_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.uploaded_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: uploader must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_item_school
  BEFORE INSERT OR UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_item_school();

-- 15. validate_library_access_school
CREATE OR REPLACE FUNCTION public.validate_library_access_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_item_access (item)';
  END IF;
  IF NEW.role_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.roles WHERE id = NEW.role_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in library_item_access (role)';
    END IF;
  END IF;
  IF NEW.class_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.classes WHERE id = NEW.class_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in library_item_access (class)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_access_school
  BEFORE INSERT OR UPDATE ON public.library_item_access
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_access_school();

-- 16. validate_library_favorites_school
CREATE OR REPLACE FUNCTION public.validate_library_favorites_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_favorites (user)';
  END IF;
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_favorites (item)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_favorites_school
  BEFORE INSERT OR UPDATE ON public.library_favorites
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_favorites_school();

-- 17. validate_reading_history_school
CREATE OR REPLACE FUNCTION public.validate_reading_history_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_reading_history (user)';
  END IF;
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_reading_history (item)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_reading_history_school
  BEFORE INSERT OR UPDATE ON public.library_reading_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_reading_history_school();

-- 18. validate_module_role_access_school
CREATE OR REPLACE FUNCTION public.validate_module_role_access_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.roles WHERE id = NEW.role_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in module_role_access';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_module_role_access_school
  BEFORE INSERT OR UPDATE ON public.module_role_access
  FOR EACH ROW EXECUTE FUNCTION public.validate_module_role_access_school();

-- 19. validate_notification_school
CREATE OR REPLACE FUNCTION public.validate_notification_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in notifications';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_notification_school
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_school();

-- 20. validate_school_module_school
CREATE OR REPLACE FUNCTION public.validate_school_module_school()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.updated_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in school_modules';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_school_module_school
  BEFORE INSERT OR UPDATE ON public.school_modules
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_module_school();

-- 21. validate_library_category_parent
CREATE OR REPLACE FUNCTION public.validate_library_category_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.library_categories WHERE id = NEW.parent_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: parent category must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_category_parent
  BEFORE INSERT OR UPDATE ON public.library_categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_category_parent();
