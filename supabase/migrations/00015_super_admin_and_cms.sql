-- ============================================================
-- 00015: Super Admin, Directors, Invitations, CMS English fields
-- ============================================================

-- 1. Add is_super_admin to users (NEVER settable from client)
ALTER TABLE public.users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Add English fields to CMS tables
ALTER TABLE public.schools ADD COLUMN description_en TEXT;
ALTER TABLE public.pages ADD COLUMN title_en VARCHAR(300);
ALTER TABLE public.content_blocks ADD COLUMN title_en TEXT;
ALTER TABLE public.content_blocks ADD COLUMN body_en TEXT;

-- 3. Directors table
CREATE TABLE public.directors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  full_name_tg VARCHAR(200) NOT NULL,
  full_name_ru VARCHAR(200),
  full_name_en VARCHAR(200),
  position_tg VARCHAR(200) NOT NULL,
  position_ru VARCHAR(200),
  position_en VARCHAR(200),
  photo_url VARCHAR(500),
  year_start INT NOT NULL,
  year_end INT,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT directors_year_range CHECK (year_start >= 1900 AND year_start <= 2100),
  CONSTRAINT directors_year_end_check CHECK (year_end IS NULL OR (year_end >= year_start AND year_end <= 2100))
);

CREATE INDEX idx_directors_school ON public.directors(school_id);
CREATE INDEX idx_directors_school_visible ON public.directors(school_id, is_visible, sort_order);

-- 4. Invitation codes table
CREATE TABLE public.invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  code VARCHAR(8) UNIQUE NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT invitation_codes_max_uses_positive CHECK (max_uses >= 1),
  CONSTRAINT invitation_codes_used_count_range CHECK (used_count >= 0 AND used_count <= max_uses)
);

CREATE INDEX idx_invitation_codes_code ON public.invitation_codes(code) WHERE is_active = true;
CREATE INDEX idx_invitation_codes_school ON public.invitation_codes(school_id);

-- Prevent invitation codes from granting admin-level roles (level = 1)
CREATE OR REPLACE FUNCTION public.check_invitation_role_level()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id AND level = 1) THEN
    RAISE EXCEPTION 'Invitation codes cannot grant admin-level roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_invitation_role_level
  BEFORE INSERT OR UPDATE ON public.invitation_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_invitation_role_level();

-- 5. RLS on directors
ALTER TABLE public.directors ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read visible directors
CREATE POLICY directors_public_read ON public.directors
  FOR SELECT TO anon
  USING (is_visible = true);

-- Authenticated users can read visible directors from their school
CREATE POLICY directors_auth_read ON public.directors
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_visible = true);

-- Admin can read all directors from their school
CREATE POLICY directors_admin_read ON public.directors
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can manage directors in their school
CREATE POLICY directors_admin_manage ON public.directors
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 6. RLS on invitation_codes
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Admin can read codes from their school
CREATE POLICY invitation_codes_admin_read ON public.invitation_codes
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can manage codes in their school
CREATE POLICY invitation_codes_admin_manage ON public.invitation_codes
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Service role can validate codes during registration (no RLS bypass needed — use admin client)

-- 7. Public RLS policies for CMS (anon access to published content)
CREATE POLICY pages_anon_read ON public.pages
  FOR SELECT TO anon
  USING (is_published = true);

CREATE POLICY content_blocks_anon_read ON public.content_blocks
  FOR SELECT TO anon
  USING (is_visible = true AND (
    page_id IS NULL OR page_id IN (SELECT id FROM public.pages WHERE is_published = true)
  ));

-- 8. Public RLS for schools (anon can read school info)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY schools_anon_read ON public.schools
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY schools_auth_read ON public.schools
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY schools_admin_manage ON public.schools
  FOR ALL TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (id = public.current_user_school_id() AND public.current_user_is_admin());

-- 9. Super Admin bootstrap
-- Create auth user for Super Admin (email: juraaaevilyos@gmail.com)
-- This uses raw_app_meta_data to mark as confirmed
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at,
  confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000000',
  'juraaaevilyos@gmail.com',
  crypt('SuperAdmin2026!Mtmu7', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated',
  'authenticated',
  now(),
  now(),
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create identity for auth user
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000099',
  'juraaaevilyos@gmail.com',
  'email',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000099', 'email', 'juraaaevilyos@gmail.com'),
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- Create public.users record for Super Admin
INSERT INTO public.users (
  id,
  school_id,
  email,
  first_name,
  last_name,
  is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'juraaaevilyos@gmail.com',
  'Super',
  'Admin',
  true
) ON CONFLICT (id) DO NOTHING;

-- Assign admin role to Super Admin
INSERT INTO public.user_roles (
  user_id,
  role_id,
  school_id
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (user_id, role_id, school_id) DO NOTHING;

-- 10. Seed CMS pages for public landing
INSERT INTO public.pages (id, school_id, slug, title_tg, title_ru, title_en, is_published, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'landing', 'Саҳифаи асосӣ', 'Главная страница', 'Home Page', true, 1)
ON CONFLICT (school_id, slug) DO NOTHING;

-- Seed content blocks for landing page sections
INSERT INTO public.content_blocks (id, school_id, page_id, section, type, title_tg, title_ru, title_en, body_tg, body_ru, body_en, is_visible, sort_order) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'hero', 'text',
   'МТМУ №7', 'МТМУ №7', 'School №7',
   'Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов', 'Среднеобразовательная школа №7 имени Мирзие Хабибова', 'General Secondary School №7 named after Mirzie Habibov',
   true, 1),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'about', 'text',
   'Дар бораи мактаб', 'О школе', 'About School',
   'Маълумот дар бораи таърихи мактаб', 'Информация об истории школы', 'Information about school history',
   true, 2),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'events', 'text',
   'Рӯйдодҳои муҳим', 'Важные события', 'Important Events',
   'Рӯйдодҳои муҳими мактаб', 'Важные события школы', 'Important school events',
   true, 3),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'gallery', 'gallery',
   'Сурат', 'Фотографии', 'Photos',
   NULL, NULL, NULL,
   true, 4),
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'support', 'text',
   'Тамос ва дастгирӣ', 'Контакты и поддержка', 'Contacts & Support',
   'Барои тамос ба мо нависед', 'Свяжитесь с нами', 'Contact us',
   true, 5)
ON CONFLICT (id) DO NOTHING;
