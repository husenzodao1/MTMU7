-- ============================================================================
-- 00022 · Platform foundation: tenancy hierarchy, admin scopes, permission
--         catalog v2, authorization helpers, protected user fields, audit
--         writer, SECURITY DEFINER hardening.
--
-- Findings addressed: SEC-004, SEC-006, SEC-012, SEC-013, FUN-015.
-- Forward-only. Idempotent where practical. No data is deleted except legacy
-- permission slugs, which are mapped to the v2 catalog first.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Internal schema
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;

-- Drops every policy on a table. Used by later migrations that rewrite RLS.
CREATE OR REPLACE FUNCTION app.drop_policies(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_catalog.pg_policies
    WHERE schemaname = p_schema AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, p_schema, p_table);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.drop_policies(text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Administrative hierarchy (optional: National → Region → District → School)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(32) NOT NULL UNIQUE,
  name_tg varchar(200) NOT NULL,
  name_ru varchar(200),
  name_en varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE RESTRICT,
  code varchar(32) NOT NULL UNIQUE,
  name_tg varchar(200) NOT NULL,
  name_ru varchar(200),
  name_en varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_districts_region ON public.districts(region_id);

-- ----------------------------------------------------------------------------
-- 2. Schools: official identity, hierarchy, configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS official_name_tg text,
  ADD COLUMN IF NOT EXISTS official_name_ru text,
  ADD COLUMN IF NOT EXISTS official_name_en text,
  ADD COLUMN IF NOT EXISTS code varchar(32),
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS director_name varchar(200),
  ADD COLUMN IF NOT EXISTS deputy_directors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS working_hours_tg text,
  ADD COLUMN IF NOT EXISTS working_hours_ru text,
  ADD COLUMN IF NOT EXISTS working_hours_en text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_url varchar(500),
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timezone varchar(64) NOT NULL DEFAULT 'Asia/Dushanbe',
  ADD COLUMN IF NOT EXISTS default_locale varchar(5) NOT NULL DEFAULT 'tg',
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_status_check
    CHECK (status IN ('active', 'inactive', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_default_locale_check
    CHECK (default_locale IN ('tg', 'ru', 'en'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_code_unique UNIQUE (code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_json_shapes CHECK (
    jsonb_typeof(deputy_directors) = 'array'
    AND jsonb_typeof(social_links) = 'object'
    AND jsonb_typeof(settings) = 'object'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FUN-015: public IDs are globally unique, therefore prefixes must be too.
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_id_prefix_unique UNIQUE (id_prefix);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_id_prefix_format
    CHECK (id_prefix ~ '^[A-Z0-9]{1,5}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_schools_district ON public.schools(district_id) WHERE district_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schools_region ON public.schools(region_id) WHERE region_id IS NOT NULL;

-- Keep legacy is_active in sync with status.
CREATE OR REPLACE FUNCTION app.sync_school_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := NEW.status = 'active';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := NEW.status = 'active';
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;
  -- A district implies its region.
  IF NEW.district_id IS NOT NULL THEN
    SELECT d.region_id INTO NEW.region_id FROM public.districts d WHERE d.id = NEW.district_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_a_sync_school_status ON public.schools;
CREATE TRIGGER trg_a_sync_school_status
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.sync_school_status();

-- Host-name → school mapping for the public website.
CREATE TABLE IF NOT EXISTS public.school_domains (
  host varchar(255) PRIMARY KEY CHECK (host = lower(host)),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_domains_school ON public.school_domains(school_id);

-- ----------------------------------------------------------------------------
-- 3. Cross-school administrative scopes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope_type varchar(16) NOT NULL,
  scope_role varchar(32) NOT NULL,
  region_id uuid REFERENCES public.regions(id) ON DELETE CASCADE,
  district_id uuid REFERENCES public.districts(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_scopes_type_check CHECK (scope_type IN ('platform', 'region', 'district', 'school')),
  CONSTRAINT admin_scopes_role_check CHECK (scope_role IN ('super_admin', 'ministry_admin', 'regional_admin', 'district_admin', 'school_auditor')),
  CONSTRAINT admin_scopes_target_check CHECK (
    (scope_type = 'platform' AND region_id IS NULL AND district_id IS NULL AND school_id IS NULL)
    OR (scope_type = 'region' AND region_id IS NOT NULL AND district_id IS NULL AND school_id IS NULL)
    OR (scope_type = 'district' AND district_id IS NOT NULL AND region_id IS NULL AND school_id IS NULL)
    OR (scope_type = 'school' AND school_id IS NOT NULL AND region_id IS NULL AND district_id IS NULL)
  ),
  CONSTRAINT admin_scopes_super_is_platform CHECK (scope_role <> 'super_admin' OR scope_type = 'platform')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_scopes_unique
  ON public.admin_scopes (user_id, scope_type, scope_role, coalesce(region_id, district_id, school_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_admin_scopes_user ON public.admin_scopes(user_id);

-- Existing super admins become platform super admins.
INSERT INTO public.admin_scopes (user_id, scope_type, scope_role)
SELECT u.id, 'platform', 'super_admin' FROM public.users u WHERE u.is_super_admin
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Platform identity (owner-supplied official content; NULL = placeholder)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_identity (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  platform_name_tg text,
  platform_name_ru text,
  platform_name_en text,
  authority_name_tg text,
  authority_name_ru text,
  authority_name_en text,
  emblem_url varchar(500),
  footer_attribution_tg text,
  footer_attribution_ru text,
  footer_attribution_en text,
  copyright_tg text,
  copyright_ru text,
  copyright_en text,
  support_email varchar(255),
  support_phone varchar(50),
  is_approved boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Seeded only with attribution that already exists in the owner's code base
-- (public layout footer and About page). Marked unapproved until confirmed.
INSERT INTO public.platform_identity (id, footer_attribution_tg, footer_attribution_ru, footer_attribution_en)
VALUES (
  true,
  'Носирзода Меҳровар, Ҷураев Илес, Ҳусейнзода Руслан',
  NULL,
  'Mehrovar Nosirzoda, Ilyos Juraev, Ruslan Huseinzoda'
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Authorization helpers
-- ----------------------------------------------------------------------------

-- Home school of the caller, only while the account is usable.
CREATE OR REPLACE FUNCTION app.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.school_id
  FROM public.users u
  JOIN public.schools s ON s.id = u.school_id
  WHERE u.id = (SELECT auth.uid())
    AND u.is_active
    AND u.status IN ('active', 'graduated')
    AND s.status <> 'archived'
$$;

-- Permission held through the caller's roles in their own school.
CREATE OR REPLACE FUNCTION app.has_own_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.id = (SELECT auth.uid())
      AND u.is_active
      AND u.status IN ('active', 'graduated')
      AND p.slug = p_permission
  )
$$;

-- True when the caller holds any cross-school scope (cheap guard).
CREATE OR REPLACE FUNCTION app.has_admin_scope()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_scopes s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.user_id = (SELECT auth.uid()) AND u.is_active AND u.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_scopes s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.user_id = (SELECT auth.uid())
      AND s.scope_type = 'platform' AND s.scope_role = 'super_admin'
      AND u.is_active AND u.status = 'active'
  )
$$;

-- Permission granted to the caller for a school through an admin scope.
-- super_admin: every permission. Other scope roles: read-only oversight set.
CREATE OR REPLACE FUNCTION app.scope_permission(p_school uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_scopes s
    JOIN public.users u ON u.id = s.user_id AND u.is_active AND u.status = 'active'
    JOIN public.schools sc ON sc.id = p_school
    WHERE s.user_id = (SELECT auth.uid())
      AND (
        s.scope_type = 'platform'
        OR (s.scope_type = 'region' AND s.region_id = sc.region_id)
        OR (s.scope_type = 'district' AND s.district_id = sc.district_id)
        OR (s.scope_type = 'school' AND s.school_id = sc.id)
      )
      AND (
        s.scope_role = 'super_admin'
        OR p_permission LIKE '%.view'
        OR p_permission IN ('reports.export', 'analytics.view', 'audit.view')
      )
  )
$$;

-- The single authorization predicate used by RLS policies and RPCs.
-- Always returns true or false, never NULL: callers write IF NOT app.can(...)
-- and a NULL (e.g. an account without an active school) must mean "denied".
CREATE OR REPLACE FUNCTION app.can(p_school uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (p_school IS NOT NULL AND p_school IS NOT DISTINCT FROM app.current_school_id() AND app.has_own_permission(p_permission))
    OR (app.has_admin_scope() AND app.scope_permission(p_school, p_permission)),
    false)
$$;

-- Read access to a school's non-public data at all (member or scoped admin).
CREATE OR REPLACE FUNCTION app.can_read_school(p_school uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (p_school IS NOT NULL AND p_school IS NOT DISTINCT FROM app.current_school_id())
    OR (app.has_admin_scope() AND app.scope_permission(p_school, 'schools.view')),
    false)
$$;

CREATE OR REPLACE FUNCTION app.has_role(p_role_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    WHERE u.id = (SELECT auth.uid()) AND u.is_active AND u.status IN ('active', 'graduated')
      AND r.slug = p_role_slug
  )
$$;

-- Untrusted API caller (PostgREST roles) as opposed to service_role / migrations.
CREATE OR REPLACE FUNCTION app.is_api_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT current_user IN ('authenticated', 'anon')
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION app.drop_policies(text, text) FROM anon, authenticated;

-- Legacy public helpers used by existing policies: hardened and re-pointed.
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.current_school_id()
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.has_own_permission(p_permission_slug)
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app.has_role('admin')
$$;

-- ----------------------------------------------------------------------------
-- 6. Permission catalog v2
-- ----------------------------------------------------------------------------
ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_action_check;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS name_en varchar(200);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  ALTER TABLE public.permissions ADD CONSTRAINT permissions_slug_format
    CHECK (slug ~ '^[a-z_]+\.[a-z_]+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TEMP TABLE _perm_v2 (slug text PRIMARY KEY, module text, action text, name_en text, name_ru text, name_tg text, is_platform boolean DEFAULT false);
INSERT INTO _perm_v2 (slug, module, action, name_en, name_ru, name_tg, is_platform) VALUES
  ('dashboard.view', 'dashboard', 'view', 'View dashboard', 'Просмотр панели', 'Дидани панел', false),
  ('schools.view', 'schools', 'view', 'View school profile', 'Просмотр профиля школы', 'Дидани профили мактаб', false),
  ('schools.update', 'schools', 'update', 'Update school profile', 'Изменение профиля школы', 'Таҳрири профили мактаб', false),
  ('schools.create', 'schools', 'create', 'Create schools', 'Создание школ', 'Эҷоди мактабҳо', true),
  ('schools.archive', 'schools', 'archive', 'Archive schools', 'Архивирование школ', 'Бойгонӣ кардани мактабҳо', true),
  ('users.view', 'users', 'view', 'View user accounts', 'Просмотр учётных записей', 'Дидани ҳисобҳо', false),
  ('users.create', 'users', 'create', 'Invite user accounts', 'Приглашение пользователей', 'Даъвати корбарон', false),
  ('users.update', 'users', 'update', 'Update user accounts', 'Изменение учётных записей', 'Таҳрири ҳисобҳо', false),
  ('users.approve', 'users', 'approve', 'Approve registrations', 'Одобрение регистраций', 'Тасдиқи бақайдгирӣ', false),
  ('users.deactivate', 'users', 'deactivate', 'Activate or deactivate accounts', 'Активация и блокировка', 'Фаъол/ғайрифаъол кардан', false),
  ('users.assign_roles', 'users', 'assign_roles', 'Assign roles', 'Назначение ролей', 'Таъини нақшҳо', false),
  ('roles.view', 'roles', 'view', 'View roles and permissions', 'Просмотр ролей', 'Дидани нақшҳо', false),
  ('roles.manage', 'roles', 'manage', 'Manage roles and permissions', 'Управление ролями', 'Идоракунии нақшҳо', false),
  ('invitations.manage', 'invitations', 'manage', 'Manage invitation codes', 'Управление приглашениями', 'Идоракунии даъватномаҳо', false),
  ('students.view', 'students', 'view', 'View students', 'Просмотр учеников', 'Дидани хонандагон', false),
  ('students.create', 'students', 'create', 'Create students', 'Создание учеников', 'Илова кардани хонандагон', false),
  ('students.update', 'students', 'update', 'Update students', 'Изменение учеников', 'Таҳрири хонандагон', false),
  ('students.archive', 'students', 'archive', 'Archive, transfer or graduate students', 'Архив, перевод, выпуск', 'Бойгонӣ, интиқол, хатм', false),
  ('students.import', 'students', 'import', 'Import students', 'Импорт учеников', 'Воридоти хонандагон', false),
  ('staff.view', 'staff', 'view', 'View teachers and staff', 'Просмотр сотрудников', 'Дидани кормандон', false),
  ('staff.create', 'staff', 'create', 'Create teachers and staff', 'Создание сотрудников', 'Илова кардани кормандон', false),
  ('staff.update', 'staff', 'update', 'Update teachers and staff', 'Изменение сотрудников', 'Таҳрири кормандон', false),
  ('staff.archive', 'staff', 'archive', 'Archive teachers and staff', 'Архивирование сотрудников', 'Бойгонӣ кардани кормандон', false),
  ('guardians.view', 'guardians', 'view', 'View parents and guardians', 'Просмотр родителей', 'Дидани волидон', false),
  ('guardians.manage', 'guardians', 'manage', 'Manage parents and guardians', 'Управление родителями', 'Идоракунии волидон', false),
  ('academic_years.view', 'academic_years', 'view', 'View academic calendar', 'Просмотр учебного календаря', 'Дидани тақвими таълимӣ', false),
  ('academic_years.manage', 'academic_years', 'manage', 'Manage academic years and terms', 'Управление учебными годами', 'Идоракунии солҳои таҳсил', false),
  ('classes.view', 'classes', 'view', 'View classes', 'Просмотр классов', 'Дидани синфҳо', false),
  ('classes.create', 'classes', 'create', 'Create classes', 'Создание классов', 'Эҷоди синфҳо', false),
  ('classes.update', 'classes', 'update', 'Update classes', 'Изменение классов', 'Таҳрири синфҳо', false),
  ('classes.archive', 'classes', 'archive', 'Archive classes', 'Архивирование классов', 'Бойгонӣ кардани синфҳо', false),
  ('subjects.view', 'subjects', 'view', 'View subjects', 'Просмотр предметов', 'Дидани фанҳо', false),
  ('subjects.manage', 'subjects', 'manage', 'Manage subjects and assignments', 'Управление предметами', 'Идоракунии фанҳо', false),
  ('enrollments.manage', 'enrollments', 'manage', 'Manage enrollments', 'Управление зачислением', 'Идоракунии қабул', false),
  ('grades.view', 'grades', 'view', 'View grades', 'Просмотр оценок', 'Дидани баҳоҳо', false),
  ('grades.enter', 'grades', 'enter', 'Enter grades', 'Выставление оценок', 'Гузоштани баҳо', false),
  ('grades.update', 'grades', 'update', 'Correct grades', 'Исправление оценок', 'Ислоҳи баҳо', false),
  ('grades.approve', 'grades', 'approve', 'Approve final grades', 'Утверждение итоговых оценок', 'Тасдиқи баҳои ниҳоӣ', false),
  ('assessments.manage', 'assessments', 'manage', 'Manage assessment types and exams', 'Управление видами оценивания', 'Идоракунии намудҳои арзёбӣ', false),
  ('attendance.view', 'attendance', 'view', 'View attendance', 'Просмотр посещаемости', 'Дидани ҳозирӣ', false),
  ('attendance.mark', 'attendance', 'mark', 'Mark attendance', 'Отметка посещаемости', 'Қайди ҳозирӣ', false),
  ('attendance.update', 'attendance', 'update', 'Correct attendance', 'Исправление посещаемости', 'Ислоҳи ҳозирӣ', false),
  ('homework.view', 'homework', 'view', 'View homework', 'Просмотр домашних заданий', 'Дидани вазифаи хонагӣ', false),
  ('homework.create', 'homework', 'create', 'Create homework', 'Создание домашних заданий', 'Эҷоди вазифаи хонагӣ', false),
  ('homework.review', 'homework', 'review', 'Review submissions', 'Проверка работ', 'Санҷиши корҳо', false),
  ('timetable.view', 'timetable', 'view', 'View timetable', 'Просмотр расписания', 'Дидани ҷадвал', false),
  ('timetable.manage', 'timetable', 'manage', 'Manage timetable and substitutions', 'Управление расписанием', 'Идоракунии ҷадвал', false),
  ('news.view', 'news', 'view', 'View news', 'Просмотр новостей', 'Дидани навидҳо', false),
  ('news.create', 'news', 'create', 'Create news drafts', 'Создание новостей', 'Эҷоди навид', false),
  ('news.update', 'news', 'update', 'Edit any news', 'Редактирование новостей', 'Таҳрири навидҳо', false),
  ('news.publish', 'news', 'publish', 'Approve and publish news', 'Публикация новостей', 'Нашри навидҳо', false),
  ('news.archive', 'news', 'archive', 'Archive news', 'Архивирование новостей', 'Бойгонӣ кардани навидҳо', false),
  ('announcements.view', 'announcements', 'view', 'View announcements', 'Просмотр объявлений', 'Дидани эълонҳо', false),
  ('announcements.create', 'announcements', 'create', 'Create announcements', 'Создание объявлений', 'Эҷоди эълон', false),
  ('announcements.publish', 'announcements', 'publish', 'Publish announcements', 'Публикация объявлений', 'Нашри эълонҳо', false),
  ('events.view', 'events', 'view', 'View events', 'Просмотр мероприятий', 'Дидани чорабиниҳо', false),
  ('events.manage', 'events', 'manage', 'Manage events', 'Управление мероприятиями', 'Идоракунии чорабиниҳо', false),
  ('library.view', 'library', 'view', 'Use the library', 'Пользование библиотекой', 'Истифодаи китобхона', false),
  ('library.create', 'library', 'create', 'Add books', 'Добавление книг', 'Илова кардани китоб', false),
  ('library.update', 'library', 'update', 'Edit books', 'Редактирование книг', 'Таҳрири китобҳо', false),
  ('library.publish', 'library', 'publish', 'Publish books', 'Публикация книг', 'Нашри китобҳо', false),
  ('library.archive', 'library', 'archive', 'Archive books', 'Архивирование книг', 'Бойгонӣ кардани китобҳо', false),
  ('documents.view', 'documents', 'view', 'View documents', 'Просмотр документов', 'Дидани ҳуҷҷатҳо', false),
  ('documents.create', 'documents', 'create', 'Upload documents', 'Загрузка документов', 'Боргузории ҳуҷҷатҳо', false),
  ('documents.publish', 'documents', 'publish', 'Publish documents', 'Публикация документов', 'Нашри ҳуҷҷатҳо', false),
  ('documents.archive', 'documents', 'archive', 'Archive documents', 'Архивирование документов', 'Бойгонӣ кардани ҳуҷҷатҳо', false),
  ('media.upload', 'media', 'upload', 'Upload media', 'Загрузка медиа', 'Боргузории медиа', false),
  ('media.manage', 'media', 'manage', 'Manage media library', 'Управление медиатекой', 'Идоракунии медиа', false),
  ('cms.manage', 'cms', 'manage', 'Manage website content', 'Управление сайтом', 'Идоракунии сомона', false),
  ('messages.use', 'messages', 'use', 'Use messaging', 'Использование сообщений', 'Истифодаи паёмҳо', false),
  ('messages.moderate', 'messages', 'moderate', 'Moderate reported messages', 'Модерация сообщений', 'Назорати паёмҳо', false),
  ('notifications.send', 'notifications', 'send', 'Send notifications', 'Отправка уведомлений', 'Фиристодани огоҳиномаҳо', false),
  ('reports.view', 'reports', 'view', 'View reports', 'Просмотр отчётов', 'Дидани ҳисоботҳо', false),
  ('reports.export', 'reports', 'export', 'Export reports', 'Экспорт отчётов', 'Содироти ҳисоботҳо', false),
  ('analytics.view', 'analytics', 'view', 'View analytics', 'Просмотр аналитики', 'Дидани таҳлил', false),
  ('audit.view', 'audit', 'view', 'View audit log', 'Просмотр журнала аудита', 'Дидани журнали аудит', false),
  ('settings.view', 'settings', 'view', 'View school settings', 'Просмотр настроек', 'Дидани танзимот', false),
  ('settings.update', 'settings', 'update', 'Update school settings', 'Изменение настроек', 'Таҳрири танзимот', false),
  ('modules.manage', 'modules', 'manage', 'Enable and disable modules', 'Управление модулями', 'Идоракунии бахшҳо', false);

INSERT INTO public.permissions (slug, module, action, name_tg, name_ru, name_en, is_platform)
SELECT slug, module, action, name_tg, name_ru, name_en, is_platform FROM _perm_v2
ON CONFLICT (slug) DO UPDATE
  SET module = EXCLUDED.module, action = EXCLUDED.action, name_tg = EXCLUDED.name_tg,
      name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en, is_platform = EXCLUDED.is_platform;

-- Map legacy grants on custom (non-system) roles before removing legacy slugs.
CREATE TEMP TABLE _perm_map (legacy text, v2 text);
INSERT INTO _perm_map VALUES
  ('users.read', 'users.view'), ('users.create', 'users.create'), ('users.update', 'users.update'),
  ('users.delete', 'users.deactivate'), ('users.manage', 'users.update'), ('users.manage', 'users.approve'),
  ('users.manage', 'users.deactivate'), ('users.manage', 'users.assign_roles'),
  ('roles.read', 'roles.view'), ('roles.manage', 'roles.manage'),
  ('classes.read', 'classes.view'), ('classes.manage', 'classes.create'), ('classes.manage', 'classes.update'),
  ('classes.manage', 'classes.archive'), ('classes.manage', 'enrollments.manage'),
  ('subjects.read', 'subjects.view'), ('subjects.manage', 'subjects.manage'),
  ('library.read', 'library.view'), ('library.create', 'library.create'), ('library.update', 'library.update'),
  ('library.delete', 'library.archive'), ('library.manage', 'library.create'), ('library.manage', 'library.update'),
  ('library.manage', 'library.publish'), ('library.manage', 'library.archive'),
  ('messages.read', 'messages.use'), ('messages.create', 'messages.use'), ('messages.manage', 'messages.moderate'),
  ('grades.read', 'grades.view'), ('grades.create', 'grades.enter'), ('grades.manage', 'grades.update'),
  ('attendance.read', 'attendance.view'), ('attendance.create', 'attendance.mark'), ('attendance.manage', 'attendance.update'),
  ('homework.read', 'homework.view'), ('homework.create', 'homework.create'), ('homework.manage', 'homework.review'),
  ('schedule.read', 'timetable.view'), ('schedule.manage', 'timetable.manage'),
  ('documents.read', 'documents.view'), ('documents.manage', 'documents.create'), ('documents.manage', 'documents.publish'),
  ('notifications.manage', 'notifications.send'),
  ('content.read', 'news.view'), ('content.manage', 'cms.manage'),
  ('audit_logs.read', 'audit.view'), ('audit_logs.export', 'reports.export'),
  ('school.manage', 'schools.update'), ('school.manage', 'settings.update'), ('modules.manage', 'modules.manage'),
  ('news.read', 'news.view'), ('news.create', 'news.create'), ('news.edit', 'news.update'),
  ('news.submit', 'news.create'), ('news.publish', 'news.publish'), ('news.delete', 'news.archive'), ('news.manage', 'news.update');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, pv.id
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id AND NOT r.is_system
JOIN public.permissions pl ON pl.id = rp.permission_id
JOIN _perm_map m ON m.legacy = pl.slug
JOIN public.permissions pv ON pv.slug = m.v2
ON CONFLICT DO NOTHING;

DELETE FROM public.permissions p
WHERE NOT EXISTS (SELECT 1 FROM _perm_v2 v WHERE v.slug = p.slug);

DROP TABLE _perm_map;
DROP TABLE _perm_v2;

-- Default permission sets for system roles.
CREATE OR REPLACE FUNCTION app.default_role_permissions(p_role_slug text)
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT slug FROM (VALUES
    -- school administrator: everything except platform-level permissions
    ('admin', ARRAY[
      'dashboard.view','schools.view','schools.update','users.view','users.create','users.update','users.approve',
      'users.deactivate','users.assign_roles','roles.view','roles.manage','invitations.manage','students.view',
      'students.create','students.update','students.archive','students.import','staff.view','staff.create',
      'staff.update','staff.archive','guardians.view','guardians.manage','academic_years.view','academic_years.manage',
      'classes.view','classes.create','classes.update','classes.archive','subjects.view','subjects.manage',
      'enrollments.manage','grades.view','grades.enter','grades.update','grades.approve','assessments.manage',
      'attendance.view','attendance.mark','attendance.update','homework.view','homework.create','homework.review',
      'timetable.view','timetable.manage','news.view','news.create','news.update','news.publish','news.archive',
      'announcements.view','announcements.create','announcements.publish','events.view','events.manage',
      'library.view','library.create','library.update','library.publish','library.archive','documents.view',
      'documents.create','documents.publish','documents.archive','media.upload','media.manage','cms.manage',
      'messages.use','messages.moderate','notifications.send','reports.view','reports.export','analytics.view',
      'audit.view','settings.view','settings.update','modules.manage']),
    ('director', ARRAY[
      'dashboard.view','schools.view','schools.update','users.view','users.create','users.update','users.approve',
      'users.deactivate','users.assign_roles','roles.view','invitations.manage','students.view','students.create',
      'students.update','students.archive','students.import','staff.view','staff.create','staff.update',
      'staff.archive','guardians.view','guardians.manage','academic_years.view','academic_years.manage',
      'classes.view','classes.create','classes.update','classes.archive','subjects.view','subjects.manage',
      'enrollments.manage','grades.view','grades.enter','grades.update','grades.approve','assessments.manage',
      'attendance.view','attendance.mark','attendance.update','homework.view','homework.create','homework.review',
      'timetable.view','timetable.manage','news.view','news.create',
      'news.update','news.publish','news.archive','announcements.view','announcements.create',
      'announcements.publish','events.view','events.manage','library.view','documents.view','documents.create',
      'documents.publish','documents.archive','media.upload','cms.manage','messages.use','messages.moderate',
      'notifications.send','reports.view','reports.export','analytics.view','audit.view','settings.view',
      'settings.update']),
    ('vice_principal', ARRAY[
      'dashboard.view','schools.view','users.view','users.approve','students.view','students.create',
      'students.update','staff.view','guardians.view','guardians.manage','academic_years.view','classes.view',
      'classes.create','classes.update','subjects.view','subjects.manage','enrollments.manage','grades.view',
      'grades.enter','grades.update','grades.approve','assessments.manage','attendance.view','attendance.mark',
      'attendance.update','homework.view','homework.create','homework.review','timetable.view','timetable.manage',
      'news.view','news.create','announcements.view','announcements.create',
      'announcements.publish','events.view','events.manage','library.view','documents.view','documents.create',
      'media.upload','messages.use','notifications.send','reports.view','reports.export','analytics.view']),
    -- Teachers get no school-wide grades/attendance/homework view: RLS scopes
    -- them to the class subjects they teach and the classes they lead.
    ('teacher', ARRAY[
      'dashboard.view','schools.view','students.view','staff.view','academic_years.view','classes.view',
      'subjects.view','grades.enter','attendance.mark','homework.create','homework.review','timetable.view',
      'news.view','news.create','announcements.view','announcements.create','events.view','library.view',
      'documents.view','media.upload','messages.use']),
    ('librarian', ARRAY[
      'dashboard.view','schools.view','academic_years.view','subjects.view','news.view','announcements.view',
      'events.view','library.view','library.create','library.update','library.publish','library.archive',
      'documents.view','media.upload','messages.use']),
    ('staff', ARRAY[
      'dashboard.view','schools.view','news.view','announcements.view','events.view','library.view',
      'documents.view','messages.use']),
    ('student', ARRAY[
      'dashboard.view','schools.view','academic_years.view','news.view','announcements.view','events.view',
      'library.view','documents.view','messages.use','timetable.view']),
    ('parent', ARRAY[
      'dashboard.view','schools.view','academic_years.view','news.view','announcements.view','events.view',
      'documents.view','messages.use','timetable.view'])
  ) AS d(role_slug, perms), unnest(d.perms) AS slug
  WHERE d.role_slug = p_role_slug
$$;

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
  WHERE p.slug IN (SELECT app.default_role_permissions(v_slug));
END;
$$;
REVOKE EXECUTE ON FUNCTION app.reset_role_permissions(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. School provisioning (roles, modules, notification settings)
-- ----------------------------------------------------------------------------
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS name_en varchar(100);
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS name_en varchar(100),
  ADD COLUMN IF NOT EXISTS category varchar(32) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS required_permission varchar(100),
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT false;

CREATE TEMP TABLE _modules_v2 (id uuid, slug text, name_tg text, name_ru text, name_en text, icon text, route text, category text, required_permission text, is_core boolean, sort_order int);
INSERT INTO _modules_v2 VALUES
  ('00000000-0000-0000-0002-000000000001', 'dashboard', 'Панели асосӣ', 'Главная', 'Dashboard', 'LayoutDashboard', '/dashboard', 'core', 'dashboard.view', true, 1),
  ('00000000-0000-0000-0002-000000000007', 'schedule', 'Ҷадвал', 'Расписание', 'Timetable', 'CalendarDays', '/schedule', 'academic', 'timetable.view', false, 10),
  ('00000000-0000-0000-0002-000000000004', 'grades', 'Баҳоҳо', 'Оценки', 'Grades', 'GraduationCap', '/grades', 'academic', NULL, false, 11),
  ('00000000-0000-0000-0002-000000000005', 'attendance', 'Ҳозирӣ', 'Посещаемость', 'Attendance', 'ClipboardCheck', '/attendance', 'academic', NULL, false, 12),
  ('00000000-0000-0000-0002-000000000006', 'homework', 'Вазифаи хонагӣ', 'Домашние задания', 'Homework', 'NotebookPen', '/homework', 'academic', NULL, false, 13),
  ('00000000-0000-0000-0002-000000000003', 'library', 'Китобхона', 'Библиотека', 'Library', 'BookOpen', '/library', 'content', 'library.view', false, 20),
  ('00000000-0000-0000-0002-000000000013', 'news', 'Навидҳо', 'Новости', 'News', 'Newspaper', '/news', 'content', 'news.view', false, 21),
  ('00000000-0000-0000-0002-000000000010', 'announcements', 'Эълонҳо', 'Объявления', 'Announcements', 'Megaphone', '/announcements', 'content', 'announcements.view', false, 22),
  ('00000000-0000-0000-0002-000000000009', 'events', 'Чорабиниҳо', 'Мероприятия', 'Events', 'CalendarRange', '/events', 'content', 'events.view', false, 23),
  ('00000000-0000-0000-0002-000000000008', 'documents', 'Ҳуҷҷатҳо', 'Документы', 'Documents', 'FolderOpen', '/documents', 'content', 'documents.view', false, 24),
  ('00000000-0000-0000-0002-000000000002', 'messages', 'Паёмҳо', 'Сообщения', 'Messages', 'MessageSquare', '/messages', 'communication', 'messages.use', false, 30),
  ('00000000-0000-0000-0002-000000000014', 'friends', 'Дӯстон', 'Друзья', 'Contacts', 'Users', '/friends', 'communication', NULL, false, 31),
  ('00000000-0000-0000-0002-000000000011', 'reports', 'Ҳисоботҳо', 'Отчёты', 'Reports', 'FileBarChart', '/admin/reports', 'reporting', 'reports.view', false, 40),
  ('00000000-0000-0000-0002-000000000012', 'analytics', 'Таҳлил', 'Аналитика', 'Analytics', 'LineChart', '/admin/analytics', 'reporting', 'analytics.view', false, 41);

INSERT INTO public.modules (id, slug, name_tg, name_ru, name_en, icon, route, category, required_permission, is_core, is_system, sort_order)
SELECT id, slug, name_tg, name_ru, name_en, icon, route, category, required_permission, is_core, is_core, sort_order FROM _modules_v2
ON CONFLICT (slug) DO UPDATE
  SET name_tg = EXCLUDED.name_tg, name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en,
      icon = EXCLUDED.icon, route = EXCLUDED.route, category = EXCLUDED.category,
      required_permission = EXCLUDED.required_permission, is_core = EXCLUDED.is_core,
      is_system = EXCLUDED.is_system, sort_order = EXCLUDED.sort_order;

DROP TABLE _modules_v2;

CREATE OR REPLACE FUNCTION app.provision_school(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  INSERT INTO public.roles (school_id, slug, name_tg, name_ru, name_en, level, is_system)
  VALUES
    (p_school_id, 'admin', 'Маъмури мактаб', 'Администратор школы', 'School administrator', 1, true),
    (p_school_id, 'director', 'Директор', 'Директор', 'Director', 2, true),
    (p_school_id, 'vice_principal', 'Муовини директор', 'Заместитель директора', 'Deputy director', 3, true),
    (p_school_id, 'teacher', 'Муаллим', 'Учитель', 'Teacher', 4, true),
    (p_school_id, 'librarian', 'Китобдор', 'Библиотекарь', 'Librarian', 4, true),
    (p_school_id, 'staff', 'Корманд', 'Сотрудник', 'Staff', 4, true),
    (p_school_id, 'student', 'Хонанда', 'Ученик', 'Student', 5, true),
    (p_school_id, 'parent', 'Волидайн', 'Родитель', 'Parent or guardian', 6, true)
  ON CONFLICT (school_id, slug) DO UPDATE SET is_system = true, name_en = EXCLUDED.name_en;

  FOR r IN SELECT id FROM public.roles WHERE school_id = p_school_id AND is_system LOOP
    PERFORM app.reset_role_permissions(r.id);
  END LOOP;

  INSERT INTO public.school_modules (school_id, module_id, is_enabled, enabled_at)
  SELECT p_school_id, m.id, true, now() FROM public.modules m
  ON CONFLICT (school_id, module_id) DO NOTHING;

  INSERT INTO public.module_role_access (school_id, module_id, role_id, is_visible)
  SELECT p_school_id, m.id, ro.id, true
  FROM public.modules m CROSS JOIN public.roles ro
  WHERE ro.school_id = p_school_id
  ON CONFLICT (school_id, module_id, role_id) DO NOTHING;

  INSERT INTO public.notification_settings (school_id, type, is_enabled)
  SELECT p_school_id, t, true
  FROM unnest(ARRAY['message','grade','homework','schedule','attendance','announcement','document','library','system','friend']) AS t
  ON CONFLICT (school_id, type) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.provision_school(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.after_school_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app.provision_school(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_provision_school ON public.schools;
CREATE TRIGGER trg_provision_school
  AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.after_school_insert();

-- Provision every existing school (adds librarian/staff/parent, v2 permissions).
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    PERFORM app.provision_school(s.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Protected user fields (SEC-004)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_users_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'users rows are created by the platform, not by API clients'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.public_id IS DISTINCT FROM OLD.public_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'protected field cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at THEN
    IF OLD.id = v_actor
       OR NOT (app.can(OLD.school_id, 'users.deactivate') OR app.can(OLD.school_id, 'users.approve')) THEN
      RAISE EXCEPTION 'account status can only be changed by an authorized administrator'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name IS DISTINCT FROM OLD.last_name
     OR NEW.middle_name IS DISTINCT FROM OLD.middle_name
     OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
     OR NEW.gender IS DISTINCT FROM OLD.gender
     OR NEW.graduation_year IS DISTINCT FROM OLD.graduation_year
     OR NEW.graduation_date IS DISTINCT FROM OLD.graduation_date
     OR NEW.years_in_school IS DISTINCT FROM OLD.years_in_school THEN
    IF NOT app.can(OLD.school_id, 'users.update') THEN
      RAISE EXCEPTION 'official profile fields can only be changed by an authorized administrator'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.phone IS DISTINCT FROM OLD.phone OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     AND OLD.id <> v_actor
     AND NOT app.can(OLD.school_id, 'users.update') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_users_write ON public.users;
CREATE TRIGGER trg_guard_users_write
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.guard_users_write();

-- The legacy flag trigger compared current_setting('role'); the guard above
-- covers it. Keep the trigger for defence in depth but harden it.
CREATE OR REPLACE FUNCTION public.protect_super_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_super_admin AND (TG_OP = 'INSERT' OR NOT OLD.is_super_admin) AND app.is_api_caller() THEN
    NEW.is_super_admin := false;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Audit log writer (SEC-012)
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ALTER COLUMN action TYPE varchar(40);
DO $$ BEGIN
  ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_format CHECK (action ~ '^[a-z_]+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.audit_logs ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role varchar(40);
CREATE INDEX IF NOT EXISTS idx_audit_school_action ON public.audit_logs(school_id, action, created_at DESC);

CREATE OR REPLACE FUNCTION app.write_audit(
  p_school_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old jsonb DEFAULT NULL,
  p_new jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_public_id varchar(32);
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT u.public_id INTO v_public_id FROM public.users u WHERE u.id = v_actor;
  END IF;
  INSERT INTO public.audit_logs (school_id, user_id, user_public_id, actor_role, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (p_school_id, v_actor, v_public_id, current_user, p_action, p_entity_type, p_entity_id, p_old, p_new, p_metadata);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.write_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- API entry point: actor and school come from the session, never from input.
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_old jsonb DEFAULT NULL,
  p_new jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_action !~ '^[a-z_]+$' OR length(p_entity_type) > 50 THEN
    RAISE EXCEPTION 'invalid audit payload' USING ERRCODE = '22023';
  END IF;
  PERFORM app.write_audit(v_school, p_action, p_entity_type, p_entity_id, p_old, p_new, p_metadata);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) TO authenticated;

-- Generic row-change audit trigger for sensitive tables.
-- TG_ARGV[0] = entity type label; TG_ARGV[1..] = columns to capture (all if none).
CREATE OR REPLACE FUNCTION app.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
  v_entity uuid;
  v_action text := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END;
  v_keys text[];
BEGIN
  IF TG_NARGS > 1 THEN
    v_keys := TG_ARGV[1:];
    SELECT jsonb_object_agg(k, v_old -> k) INTO v_old FROM unnest(v_keys) k WHERE v_old IS NOT NULL;
    SELECT jsonb_object_agg(k, v_new -> k) INTO v_new FROM unnest(v_keys) k WHERE v_new IS NOT NULL;
    IF TG_OP = 'UPDATE' AND v_old IS NOT DISTINCT FROM v_new THEN
      RETURN NULL;
    END IF;
  END IF;

  v_school := CASE
    WHEN TG_TABLE_NAME = 'schools' THEN (v_row ->> 'id')::uuid
    WHEN v_row ? 'school_id' THEN (v_row ->> 'school_id')::uuid
  END;
  v_entity := CASE WHEN (v_row ->> 'id') ~ '^[0-9a-f-]{36}$' THEN (v_row ->> 'id')::uuid END;

  PERFORM app.write_audit(v_school, v_action, coalesce(TG_ARGV[0], TG_TABLE_NAME), v_entity, v_old, v_new,
    jsonb_build_object('table', TG_TABLE_NAME));
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.audit_row_change() FROM PUBLIC, anon, authenticated;

-- Role/permission changes are always audited.
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('user_role');

DROP TRIGGER IF EXISTS trg_audit_admin_scopes ON public.admin_scopes;
CREATE TRIGGER trg_audit_admin_scopes
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_scopes
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('admin_scope');

DROP TRIGGER IF EXISTS trg_audit_users_status ON public.users;
CREATE TRIGGER trg_audit_users_status
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('user_account', 'status', 'is_active', 'first_name', 'last_name', 'middle_name', 'date_of_birth', 'gender');

DROP TRIGGER IF EXISTS trg_audit_schools ON public.schools;
CREATE TRIGGER trg_audit_schools
  AFTER INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('school');

DROP TRIGGER IF EXISTS trg_audit_school_modules ON public.school_modules;
CREATE TRIGGER trg_audit_school_modules
  AFTER INSERT OR UPDATE ON public.school_modules
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('school_module', 'module_id', 'is_enabled');

-- role_permissions has no school_id/id: dedicated trigger.
CREATE OR REPLACE FUNCTION app.audit_role_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role uuid := coalesce(NEW.role_id, OLD.role_id);
  v_perm uuid := coalesce(NEW.permission_id, OLD.permission_id);
  v_school uuid;
  v_slug text;
BEGIN
  SELECT r.school_id INTO v_school FROM public.roles r WHERE r.id = v_role;
  SELECT p.slug INTO v_slug FROM public.permissions p WHERE p.id = v_perm;
  PERFORM app.write_audit(v_school, CASE WHEN TG_OP = 'INSERT' THEN 'grant' ELSE 'revoke' END,
    'role_permission', v_role, NULL, jsonb_build_object('permission', v_slug), NULL);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.audit_role_permission_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_audit_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_audit_role_permissions
  AFTER INSERT OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.audit_role_permission_change();

-- ----------------------------------------------------------------------------
-- 10. SECURITY DEFINER / trigger hardening (SEC-006)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix varchar(5);
  v_sequence bigint;
BEGIN
  UPDATE public.schools
  SET id_sequence = id_sequence + 1
  WHERE id = NEW.school_id
  RETURNING id_prefix, id_sequence INTO v_prefix, v_sequence;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'School not found: %', NEW.school_id;
  END IF;

  NEW.public_id := v_prefix || v_sequence::text;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_public_id() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.check_bidirectional_friend_request() SET search_path = '';

-- Pin search_path on every remaining function in public that lacks it.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.sig);
  END LOOP;
END $$;

-- Trigger functions are not API endpoints.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app')
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. Session access snapshot for the application shell (one round trip)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_user public.users%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user', NULL);
  END IF;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id, 'school_id', v_user.school_id, 'public_id', v_user.public_id,
      'email', v_user.email, 'first_name', v_user.first_name, 'last_name', v_user.last_name,
      'middle_name', v_user.middle_name, 'avatar_url', v_user.avatar_url, 'phone', v_user.phone,
      'status', v_user.status, 'is_active', v_user.is_active
    ),
    'school', (
      SELECT jsonb_build_object('id', s.id, 'slug', s.slug, 'short_name', s.short_name, 'full_name', s.full_name,
        'official_name_tg', s.official_name_tg, 'official_name_ru', s.official_name_ru,
        'official_name_en', s.official_name_en, 'logo_url', s.logo_url, 'status', s.status,
        'timezone', s.timezone, 'default_locale', s.default_locale)
      FROM public.schools s WHERE s.id = v_user.school_id
    ),
    'roles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru,
        'name_en', r.name_en, 'level', r.level, 'is_system', r.is_system) ORDER BY r.level)
      FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      WHERE ur.user_id = v_uid AND ur.school_id = v_user.school_id
    ), '[]'::jsonb),
    'permissions', CASE WHEN app.current_school_id() IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(DISTINCT p.slug)
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id AND r.is_active
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = v_uid AND ur.school_id = v_user.school_id
    ), '[]'::jsonb) END,
    'modules', CASE WHEN app.current_school_id() IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(DISTINCT m.slug)
      FROM public.school_modules sm
      JOIN public.modules m ON m.id = sm.module_id
      WHERE sm.school_id = v_user.school_id AND sm.is_enabled
        AND (m.is_core OR EXISTS (
          SELECT 1 FROM public.module_role_access mra
          JOIN public.user_roles ur ON ur.role_id = mra.role_id AND ur.user_id = v_uid
          WHERE mra.school_id = sm.school_id AND mra.module_id = m.id AND mra.is_visible
        ))
    ), '[]'::jsonb) END,
    'scopes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('scope_type', s.scope_type, 'scope_role', s.scope_role,
        'region_id', s.region_id, 'district_id', s.district_id, 'school_id', s.school_id))
      FROM public.admin_scopes s WHERE s.user_id = v_uid
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
