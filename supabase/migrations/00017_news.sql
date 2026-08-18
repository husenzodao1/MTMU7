-- News categories
CREATE TABLE public.news_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name_tg VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  name_en VARCHAR(100),
  slug VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT news_categories_school_slug UNIQUE (school_id, slug)
);

CREATE INDEX idx_news_categories_school ON public.news_categories(school_id);

-- News articles
CREATE TABLE public.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  cover_image_url VARCHAR(500),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT news_articles_status_check CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'published', 'rejected'))
);

CREATE INDEX idx_news_articles_school ON public.news_articles(school_id);
CREATE INDEX idx_news_articles_status ON public.news_articles(school_id, status);
CREATE INDEX idx_news_articles_published ON public.news_articles(school_id, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_news_articles_author ON public.news_articles(author_id);

-- Article-category junction
CREATE TABLE public.news_article_categories (
  article_id UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.news_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, category_id)
);

-- Add news module
INSERT INTO public.modules (id, slug, name_tg, name_ru, icon, route, is_system, sort_order) VALUES
  ('00000000-0000-0000-0002-000000000013', 'news', 'Навидҳо', 'Новости', 'Newspaper', '/news', false, 13);

-- Enable for default school
INSERT INTO public.school_modules (school_id, module_id, is_enabled, enabled_at)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0002-000000000013', true, now());

-- Make visible to all roles
INSERT INTO public.module_role_access (school_id, module_id, role_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0002-000000000013', r.id, true
FROM public.roles r
WHERE r.school_id = '00000000-0000-0000-0000-000000000001';

-- News permissions
INSERT INTO public.permissions (slug, module, action, name_tg, name_ru) VALUES
  ('news.read', 'news', 'read', 'Хондани навидҳо', 'Просмотр новостей'),
  ('news.create', 'news', 'create', 'Эҷоди навид', 'Создание новости'),
  ('news.edit', 'news', 'update', 'Таҳрири навид', 'Редактирование новости'),
  ('news.submit', 'news', 'submit', 'Ирсоли навид', 'Отправка новости'),
  ('news.publish', 'news', 'publish', 'Нашри навид', 'Публикация новости'),
  ('news.delete', 'news', 'delete', 'Нест кардани навид', 'Удаление новости'),
  ('news.manage', 'news', 'manage', 'Идоракунии навидҳо', 'Управление новостями');

-- Assign all news permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000001', id
FROM public.permissions WHERE slug LIKE 'news.%';

-- Assign read/create/edit/submit to director
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000002', id
FROM public.permissions WHERE slug IN ('news.read', 'news.create', 'news.edit', 'news.submit', 'news.publish', 'news.manage');

-- Assign read/create/submit to teacher
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000004', id
FROM public.permissions WHERE slug IN ('news.read', 'news.create', 'news.edit', 'news.submit');

-- Assign read to student
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000005', id
FROM public.permissions WHERE slug = 'news.read';

-- Assign read/create/edit/submit/publish to vice_principal
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000003', id
FROM public.permissions WHERE slug IN ('news.read', 'news.create', 'news.edit', 'news.submit', 'news.publish');

-- Seed default categories
INSERT INTO public.news_categories (school_id, name_tg, name_ru, name_en, slug, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Навидҳои мактаб', 'Новости школы', 'School News', 'school-news', 1),
  ('00000000-0000-0000-0000-000000000001', 'Чорабиниҳои таълимӣ', 'Учебные мероприятия', 'Academic Events', 'academic-events', 2),
  ('00000000-0000-0000-0000-000000000001', 'Олимпиадаҳо', 'Олимпиады', 'Olympiads', 'olympiads', 3),
  ('00000000-0000-0000-0000-000000000001', 'Дастовардҳои хонандагон', 'Достижения учеников', 'Student Achievements', 'achievements', 4),
  ('00000000-0000-0000-0000-000000000001', 'Эълонҳо', 'Объявления', 'Announcements', 'announcements', 5),
  ('00000000-0000-0000-0000-000000000001', 'Иттилооти муҳим', 'Важная информация', 'Important Info', 'important', 6);

-- RLS
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_article_categories ENABLE ROW LEVEL SECURITY;

-- Categories: everyone in school can read
CREATE POLICY news_categories_select ON public.news_categories FOR SELECT
  USING (school_id = public.current_user_school_id());

CREATE POLICY news_categories_admin ON public.news_categories FOR ALL
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Articles: published visible to everyone in school, authors see their own drafts, admins see all
CREATE POLICY news_articles_select_published ON public.news_articles FOR SELECT
  USING (school_id = public.current_user_school_id() AND status = 'published');

CREATE POLICY news_articles_select_own ON public.news_articles FOR SELECT
  USING (school_id = public.current_user_school_id() AND author_id = auth.uid());

CREATE POLICY news_articles_select_admin ON public.news_articles FOR SELECT
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY news_articles_insert ON public.news_articles FOR INSERT
  WITH CHECK (school_id = public.current_user_school_id() AND author_id = auth.uid());

CREATE POLICY news_articles_update_own ON public.news_articles FOR UPDATE
  USING (school_id = public.current_user_school_id() AND author_id = auth.uid() AND status IN ('draft', 'rejected'))
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY news_articles_update_admin ON public.news_articles FOR UPDATE
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY news_articles_delete_admin ON public.news_articles FOR DELETE
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY news_articles_delete_own_draft ON public.news_articles FOR DELETE
  USING (school_id = public.current_user_school_id() AND author_id = auth.uid() AND status = 'draft');

-- Article categories junction: follow article's policies
CREATE POLICY news_article_categories_select ON public.news_article_categories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.news_articles a WHERE a.id = article_id AND a.school_id = public.current_user_school_id()
  ));

CREATE POLICY news_article_categories_modify ON public.news_article_categories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.news_articles a WHERE a.id = article_id AND a.school_id = public.current_user_school_id()
      AND (a.author_id = auth.uid() OR public.current_user_is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.news_articles a WHERE a.id = article_id AND a.school_id = public.current_user_school_id()
      AND (a.author_id = auth.uid() OR public.current_user_is_admin())
  ));
