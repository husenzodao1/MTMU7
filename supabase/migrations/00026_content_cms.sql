-- ============================================================================
-- 00026 · Content management: news workflow v2, announcements, events,
--         documents, media registry, structured homepage sections, CMS pages,
--         library v2.
--
-- All publishing state uses explicit status columns. Public (anonymous)
-- visibility is decided in RLS, never in the UI. Findings addressed: FUN-011,
-- SEC-015 (library/CMS WITH CHECK), spec §27–§33, §57–§58.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
-- Staff = any account holding a non-student, non-parent role in its school.
CREATE OR REPLACE FUNCTION app.is_staff_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active
    WHERE u.id = (SELECT auth.uid()) AND u.is_active AND u.status = 'active'
      AND r.slug NOT IN ('student', 'parent')
  )
$$;

CREATE OR REPLACE FUNCTION app.my_role_slugs()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(r.slug), ARRAY[]::text[])
  FROM public.users u
  JOIN public.user_roles ur ON ur.user_id = u.id AND ur.school_id = u.school_id
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active
  WHERE u.id = (SELECT auth.uid()) AND u.is_active AND u.status IN ('active', 'graduated')
$$;

CREATE OR REPLACE FUNCTION app.is_school_public(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = p_school AND s.status = 'active')
$$;

-- Latin slug from Tajik / Russian / English text.
CREATE OR REPLACE FUNCTION app.slugify(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v text := lower(coalesce(p_text, ''));
  map text[][] := ARRAY[
    ['щ','shch'],['ш','sh'],['ч','ch'],['ҷ','j'],['ж','zh'],['ю','yu'],['я','ya'],['ё','yo'],['х','kh'],['ҳ','h'],
    ['ц','ts'],['а','a'],['б','b'],['в','v'],['г','g'],['ғ','gh'],['д','d'],['е','e'],['з','z'],['и','i'],['ӣ','i'],
    ['й','y'],['к','k'],['қ','q'],['л','l'],['м','m'],['н','n'],['о','o'],['п','p'],['р','r'],['с','s'],['т','t'],
    ['у','u'],['ӯ','u'],['ф','f'],['ы','y'],['э','e'],['ъ',''],['ь','']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(map, 1) LOOP
    v := replace(v, map[i][1], map[i][2]);
  END LOOP;
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  RETURN left(CASE WHEN v = '' THEN 'item' ELSE v END, 120);
END;
$$;

GRANT EXECUTE ON FUNCTION app.is_staff_member(), app.my_role_slugs(), app.is_school_public(uuid), app.slugify(text)
  TO anon, authenticated;

-- Shared publishing-window predicate.
CREATE OR REPLACE FUNCTION app.in_publish_window(p_publish_at timestamptz, p_expires_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (p_publish_at IS NULL OR p_publish_at <= now()) AND (p_expires_at IS NULL OR p_expires_at > now())
$$;
GRANT EXECUTE ON FUNCTION app.in_publish_window(timestamptz, timestamptz) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Media registry (safe media workflow)
-- ----------------------------------------------------------------------------
CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  bucket varchar(40) NOT NULL,
  storage_path varchar(500) NOT NULL,
  file_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  width int,
  height int,
  alt_text varchar(300),
  usage varchar(20) NOT NULL DEFAULT 'general',
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_path_unique UNIQUE (bucket, storage_path),
  CONSTRAINT media_assets_bucket_check CHECK (bucket IN ('public-media', 'library-files', 'library-covers', 'documents', 'homework')),
  CONSTRAINT media_assets_usage_check CHECK (usage IN ('general', 'news', 'events', 'cms', 'library', 'documents', 'identity', 'homework')),
  CONSTRAINT media_assets_size_check CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  CONSTRAINT media_assets_mime_check CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf', 'application/epub+zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'text/plain', 'audio/mpeg')),
  CONSTRAINT media_assets_path_scope CHECK (storage_path LIKE school_id::text || '/%' AND storage_path NOT LIKE '%..%')
);
CREATE INDEX idx_media_assets_school ON public.media_assets(school_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. News v2
-- ----------------------------------------------------------------------------
ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS slug varchar(140),
  ADD COLUMN IF NOT EXISTS summary varchar(500),
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.news_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS language varchar(5) NOT NULL DEFAULT 'tg',
  ADD COLUMN IF NOT EXISTS seo_title varchar(200),
  ADD COLUMN IF NOT EXISTS seo_description varchar(300),
  ADD COLUMN IF NOT EXISTS publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS visibility varchar(10) NOT NULL DEFAULT 'school',
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.news_articles DROP CONSTRAINT IF EXISTS news_articles_status_check;
UPDATE public.news_articles SET status = 'review' WHERE status IN ('submitted', 'in_review');
UPDATE public.news_articles SET status = 'draft' WHERE status = 'rejected';
UPDATE public.news_articles SET is_featured = is_pinned WHERE is_pinned;
UPDATE public.news_articles SET publish_at = coalesce(published_at, created_at) WHERE status = 'published' AND publish_at IS NULL;
UPDATE public.news_articles a SET category_id = (
  SELECT nac.category_id FROM public.news_article_categories nac WHERE nac.article_id = a.id LIMIT 1
) WHERE category_id IS NULL;
UPDATE public.news_articles SET slug = app.slugify(title) || '-' || left(id::text, 6) WHERE slug IS NULL;

ALTER TABLE public.news_articles ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_status_check
  CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived'));
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_language_check CHECK (language IN ('tg', 'ru', 'en'));
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_visibility_check CHECK (visibility IN ('public', 'school', 'staff'));
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_slug_unique UNIQUE (school_id, slug);
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_window_check CHECK (expires_at IS NULL OR publish_at IS NULL OR expires_at > publish_at);
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_gallery_check CHECK (jsonb_typeof(gallery) = 'array' AND jsonb_array_length(gallery) <= 30);
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_content_length CHECK (length(content) <= 100000);

ALTER TABLE public.news_articles ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.news_articles DROP CONSTRAINT IF EXISTS news_articles_author_id_fkey;
ALTER TABLE public.news_articles ADD CONSTRAINT news_articles_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_news_articles_published;
CREATE INDEX idx_news_articles_public ON public.news_articles(school_id, publish_at DESC) WHERE status = 'published';
CREATE INDEX idx_news_articles_tags ON public.news_articles USING gin (tags);

ALTER TABLE public.news_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION app.guard_news_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_can_update boolean;
  v_can_publish boolean;
  v_can_archive boolean;
BEGIN
  NEW.slug := coalesce(nullif(NEW.slug, ''), app.slugify(NEW.title) || '-' || left(NEW.id::text, 6));
  PERFORM app.assert_same_school(NEW.school_id, 'news_categories', NEW.category_id);

  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    NEW.published_at := now();
    NEW.publish_at := coalesce(NEW.publish_at, now());
  END IF;
  IF NEW.status = 'archived' AND (TG_OP = 'INSERT' OR OLD.status <> 'archived') THEN
    NEW.archived_at := now();
  END IF;

  IF NOT app.is_api_caller() THEN
    RETURN NEW;
  END IF;

  v_can_update := app.can(NEW.school_id, 'news.update');
  v_can_publish := app.can(NEW.school_id, 'news.publish');
  v_can_archive := app.can(NEW.school_id, 'news.archive');

  IF TG_OP = 'INSERT' THEN
    NEW.author_id := v_uid;
    NEW.view_count := 0;
    IF NEW.status IN ('approved', 'published') AND NOT v_can_publish THEN
      RAISE EXCEPTION 'publishing news requires news.publish' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'archived' THEN
      RAISE EXCEPTION 'new articles cannot be archived' USING ERRCODE = '22023';
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_by := v_uid;
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_by := v_uid;
  IF NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.view_count IS DISTINCT FROM OLD.view_count THEN
    RAISE EXCEPTION 'protected article field cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved', 'published') OR OLD.status IN ('approved', 'published') AND NEW.status <> 'archived' THEN
      IF NOT v_can_publish THEN
        RAISE EXCEPTION 'this status change requires news.publish' USING ERRCODE = '42501';
      END IF;
      IF NEW.status = 'published' THEN
        NEW.published_by := v_uid;
      END IF;
      NEW.reviewed_by := v_uid;
      NEW.reviewed_at := now();
    END IF;
    IF NEW.status = 'archived' OR OLD.status = 'archived' THEN
      IF NOT v_can_archive THEN
        RAISE EXCEPTION 'archiving news requires news.archive' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF OLD.status = 'review' AND NEW.status = 'draft' AND OLD.author_id IS DISTINCT FROM v_uid AND NOT v_can_publish THEN
      RAISE EXCEPTION 'returning an article requires news.publish' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Editing the body of a published article needs editorial rights.
  IF OLD.status = 'published' AND NEW.status = 'published' AND NOT (v_can_update OR v_can_publish) THEN
    RAISE EXCEPTION 'editing a published article requires news.update' USING ERRCODE = '42501';
  END IF;

  -- Authors without editorial rights may only work on their own drafts / review items.
  IF NOT v_can_update AND NOT v_can_publish AND NOT v_can_archive THEN
    IF OLD.author_id IS DISTINCT FROM v_uid OR OLD.status NOT IN ('draft', 'review') OR NEW.status NOT IN ('draft', 'review') THEN
      RAISE EXCEPTION 'you can only edit your own drafts' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_news_write ON public.news_articles;
CREATE TRIGGER trg_guard_news_write BEFORE INSERT OR UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION app.guard_news_write();

CREATE TRIGGER trg_audit_news_status AFTER UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('news_article', 'status', 'visibility', 'publish_at', 'expires_at');

SELECT app.drop_policies('public', 'news_articles');
CREATE POLICY news_public_read ON public.news_articles FOR SELECT TO anon USING (
  status = 'published' AND visibility = 'public' AND app.in_publish_window(publish_at, expires_at)
  AND app.is_school_public(school_id)
);
CREATE POLICY news_member_read ON public.news_articles FOR SELECT TO authenticated USING (
  (
    status = 'published' AND app.in_publish_window(publish_at, expires_at)
    AND (
      (visibility = 'public' AND app.is_school_public(school_id))
      OR (school_id = (SELECT app.current_school_id())
          AND (visibility = 'school' OR (visibility = 'staff' AND (SELECT app.is_staff_member()))))
    )
  )
  OR (author_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id()))
  OR app.can(school_id, 'news.update')
  OR app.can(school_id, 'news.publish')
  OR app.can(school_id, 'news.archive')
);
CREATE POLICY news_insert ON public.news_articles FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'news.create') OR app.can(school_id, 'news.publish'));
CREATE POLICY news_update ON public.news_articles FOR UPDATE TO authenticated USING (
  (author_id = (SELECT auth.uid()) AND app.can(school_id, 'news.create'))
  OR app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish') OR app.can(school_id, 'news.archive')
) WITH CHECK (
  (author_id = (SELECT auth.uid()) AND app.can(school_id, 'news.create'))
  OR app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish') OR app.can(school_id, 'news.archive')
);
CREATE POLICY news_delete_draft ON public.news_articles FOR DELETE TO authenticated USING (
  status = 'draft' AND published_at IS NULL
  AND ((author_id = (SELECT auth.uid()) AND app.can(school_id, 'news.create')) OR app.can(school_id, 'news.archive'))
);

SELECT app.drop_policies('public', 'news_categories');
CREATE POLICY news_categories_public_read ON public.news_categories FOR SELECT TO anon
  USING (is_active AND app.is_school_public(school_id));
CREATE POLICY news_categories_member_read ON public.news_categories FOR SELECT TO authenticated
  USING (app.can_read_school(school_id) OR (is_active AND app.is_school_public(school_id)));
CREATE POLICY news_categories_write ON public.news_categories FOR ALL TO authenticated
  USING (app.can(school_id, 'news.publish') OR app.can(school_id, 'cms.manage'))
  WITH CHECK (app.can(school_id, 'news.publish') OR app.can(school_id, 'cms.manage'));

SELECT app.drop_policies('public', 'news_article_categories');
CREATE POLICY news_article_categories_read ON public.news_article_categories FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.news_articles a WHERE a.id = article_id));
REVOKE INSERT, UPDATE, DELETE ON public.news_article_categories FROM anon, authenticated;
COMMENT ON TABLE public.news_article_categories IS 'DEPRECATED (00026): superseded by news_articles.category_id. Read-only.';

-- Counting views without granting UPDATE to readers: the visibility check runs
-- as the caller (RLS decides), only the increment runs as definer.
CREATE OR REPLACE FUNCTION app.increment_news_view(p_article_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.news_articles SET view_count = view_count + 1 WHERE id = p_article_id AND status = 'published'
$$;
REVOKE EXECUTE ON FUNCTION app.increment_news_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.increment_news_view(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_news_view(p_article_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.news_articles WHERE id = p_article_id) THEN
    PERFORM app.increment_news_view(p_article_id);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_news_view(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Announcements
-- ----------------------------------------------------------------------------
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title varchar(300) NOT NULL,
  body text NOT NULL,
  priority varchar(10) NOT NULL DEFAULT 'normal',
  audience_type varchar(10) NOT NULL DEFAULT 'school',
  audience_roles text[] NOT NULL DEFAULT '{}',
  audience_class_ids uuid[] NOT NULL DEFAULT '{}',
  audience_user_ids uuid[] NOT NULL DEFAULT '{}',
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status varchar(10) NOT NULL DEFAULT 'draft',
  attachment_path varchar(500),
  attachment_name varchar(255),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_priority_check CHECK (priority IN ('normal', 'important', 'critical')),
  CONSTRAINT announcements_audience_check CHECK (audience_type IN ('public', 'school', 'staff', 'students', 'parents', 'roles', 'classes', 'users')),
  CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT announcements_window_check CHECK (expires_at IS NULL OR expires_at > publish_at),
  CONSTRAINT announcements_body_length CHECK (length(body) <= 20000),
  CONSTRAINT announcements_targets_check CHECK (
    (audience_type <> 'roles' OR cardinality(audience_roles) > 0)
    AND (audience_type <> 'classes' OR cardinality(audience_class_ids) > 0)
    AND (audience_type <> 'users' OR cardinality(audience_user_ids) BETWEEN 1 AND 500)
  )
);
CREATE INDEX idx_announcements_school_publish ON public.announcements(school_id, publish_at DESC) WHERE status = 'published';
CREATE INDEX idx_announcements_classes ON public.announcements USING gin (audience_class_ids);
CREATE INDEX idx_announcements_users ON public.announcements USING gin (audience_user_ids);

CREATE OR REPLACE FUNCTION app.guard_announcement_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY NEW.audience_class_ids LOOP
    PERFORM app.assert_same_school(NEW.school_id, 'classes', v_id);
  END LOOP;
  FOREACH v_id IN ARRAY NEW.audience_user_ids LOOP
    PERFORM app.assert_same_school(NEW.school_id, 'users', v_id);
  END LOOP;
  IF NEW.attachment_path IS NOT NULL AND (NEW.attachment_path NOT LIKE NEW.school_id::text || '/%' OR NEW.attachment_path LIKE '%..%') THEN
    RAISE EXCEPTION 'attachment path must be inside the school folder' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    NEW.published_at := now();
  END IF;
  IF app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
    ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.notified_at IS DISTINCT FROM OLD.notified_at THEN
      RAISE EXCEPTION 'protected announcement field cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status <> 'draft') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status)
       OR (TG_OP = 'UPDATE' AND OLD.status = 'published') THEN
      IF NOT app.can(NEW.school_id, 'announcements.publish') THEN
        RAISE EXCEPTION 'publishing or changing published announcements requires announcements.publish' USING ERRCODE = '42501';
      END IF;
      IF NEW.status = 'published' THEN
        NEW.published_by := (SELECT auth.uid());
      END IF;
    END IF;
    IF NEW.audience_type = 'public' AND NOT app.can(NEW.school_id, 'cms.manage') AND NOT app.can(NEW.school_id, 'announcements.publish') THEN
      RAISE EXCEPTION 'public announcements require publishing rights' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_announcement_write BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION app.guard_announcement_write();
CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_audit_announcements AFTER UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('announcement', 'status', 'audience_type', 'publish_at', 'expires_at', 'priority');

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_read ON public.announcements FOR SELECT TO anon USING (
  status = 'published' AND audience_type = 'public' AND app.in_publish_window(publish_at, expires_at)
  AND app.is_school_public(school_id)
);
CREATE POLICY announcements_member_read ON public.announcements FOR SELECT TO authenticated USING (
  (
    status = 'published' AND app.in_publish_window(publish_at, expires_at)
    AND school_id = (SELECT app.current_school_id())
    AND (
      audience_type IN ('public', 'school')
      OR (audience_type = 'staff' AND (SELECT app.is_staff_member()))
      OR (audience_type = 'students' AND 'student' = ANY ((SELECT app.my_role_slugs())::text[]))
      OR (audience_type = 'parents' AND 'parent' = ANY ((SELECT app.my_role_slugs())::text[]))
      OR (audience_type = 'roles' AND audience_roles && (SELECT app.my_role_slugs())::text[])
      OR (audience_type = 'classes' AND (audience_class_ids && (SELECT app.my_family_class_ids())::uuid[]
                                         OR audience_class_ids && (SELECT app.my_class_ids())::uuid[]))
      OR (audience_type = 'users' AND (SELECT auth.uid()) = ANY (audience_user_ids))
    )
  )
  OR (created_by = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id()))
  OR app.can(school_id, 'announcements.publish')
);
CREATE POLICY announcements_insert ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'announcements.create') OR app.can(school_id, 'announcements.publish'));
CREATE POLICY announcements_update ON public.announcements FOR UPDATE TO authenticated USING (
  (created_by = (SELECT auth.uid()) AND app.can(school_id, 'announcements.create'))
  OR app.can(school_id, 'announcements.publish')
) WITH CHECK (
  (created_by = (SELECT auth.uid()) AND app.can(school_id, 'announcements.create'))
  OR app.can(school_id, 'announcements.publish')
);
CREATE POLICY announcements_delete_draft ON public.announcements FOR DELETE TO authenticated USING (
  status = 'draft' AND published_at IS NULL
  AND ((created_by = (SELECT auth.uid()) AND app.can(school_id, 'announcements.create')) OR app.can(school_id, 'announcements.publish'))
);

-- ----------------------------------------------------------------------------
-- 4. Events
-- ----------------------------------------------------------------------------
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title varchar(300) NOT NULL,
  description text,
  category varchar(20) NOT NULL DEFAULT 'school',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  location varchar(300),
  audience varchar(10) NOT NULL DEFAULT 'school',
  organizer varchar(200),
  image_path varchar(500),
  status varchar(10) NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_category_check CHECK (category IN ('academic', 'competition', 'meeting', 'parent_meeting', 'school', 'exam', 'holiday', 'other')),
  CONSTRAINT events_audience_check CHECK (audience IN ('public', 'school', 'staff', 'students', 'parents')),
  CONSTRAINT events_status_check CHECK (status IN ('draft', 'published', 'cancelled', 'archived')),
  CONSTRAINT events_time_check CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT events_image_scope CHECK (image_path IS NULL OR (image_path LIKE school_id::text || '/%' AND image_path NOT LIKE '%..%'))
);
CREATE INDEX idx_events_school_start ON public.events(school_id, starts_at);
CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION app.guard_event_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF app.is_api_caller() AND TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
  ELSIF app.is_api_caller() AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'protected event field cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_event_write BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION app.guard_event_write();
CREATE TRIGGER trg_audit_events AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('event', 'status', 'starts_at', 'audience');

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_read ON public.events FOR SELECT TO anon USING (
  status IN ('published', 'cancelled') AND audience = 'public' AND app.is_school_public(school_id)
);
CREATE POLICY events_member_read ON public.events FOR SELECT TO authenticated USING (
  (
    status IN ('published', 'cancelled')
    AND (
      (audience = 'public' AND app.is_school_public(school_id))
      OR (school_id = (SELECT app.current_school_id()) AND (
            audience = 'school'
            OR (audience = 'staff' AND (SELECT app.is_staff_member()))
            OR (audience = 'students' AND ('student' = ANY ((SELECT app.my_role_slugs())::text[]) OR (SELECT app.is_staff_member())))
            OR (audience = 'parents' AND ('parent' = ANY ((SELECT app.my_role_slugs())::text[]) OR (SELECT app.is_staff_member())))
          ))
    )
  )
  OR app.can(school_id, 'events.manage')
);
CREATE POLICY events_write ON public.events FOR ALL TO authenticated
  USING (app.can(school_id, 'events.manage')) WITH CHECK (app.can(school_id, 'events.manage'));

-- ----------------------------------------------------------------------------
-- 5. Documents
-- ----------------------------------------------------------------------------
CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES public.document_folders(id) ON DELETE RESTRICT,
  name varchar(200) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_folders_unique UNIQUE NULLS NOT DISTINCT (school_id, parent_id, name)
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL,
  title varchar(300) NOT NULL,
  description text,
  category varchar(20) NOT NULL DEFAULT 'other',
  access varchar(10) NOT NULL DEFAULT 'school',
  allowed_roles text[] NOT NULL DEFAULT '{}',
  status varchar(10) NOT NULL DEFAULT 'draft',
  current_version int NOT NULL DEFAULT 1,
  storage_path varchar(500) NOT NULL,
  file_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_category_check CHECK (category IN ('regulation', 'instruction', 'form', 'policy', 'schedule', 'notice', 'educational', 'report', 'other')),
  CONSTRAINT documents_access_check CHECK (access IN ('public', 'school', 'staff', 'roles')),
  CONSTRAINT documents_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT documents_roles_check CHECK (access <> 'roles' OR cardinality(allowed_roles) > 0),
  CONSTRAINT documents_size_check CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  CONSTRAINT documents_path_scope CHECK (storage_path LIKE school_id::text || '/%' AND storage_path NOT LIKE '%..%')
);
CREATE INDEX idx_documents_school_status ON public.documents(school_id, status, category);

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  version int NOT NULL,
  storage_path varchar(500) NOT NULL,
  file_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_unique UNIQUE (document_id, version)
);

CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.document_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION app.guard_document_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM app.assert_same_school(NEW.school_id, 'document_folders', NEW.folder_id);
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    NEW.published_at := now();
  END IF;
  -- A replaced file becomes a new version; history is kept.
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    NEW.current_version := OLD.current_version + 1;
  END IF;
  IF app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
      NEW.current_version := 1;
    ELSE
      NEW.updated_by := (SELECT auth.uid());
      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'protected document field cannot be changed' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status = 'published') OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND 'published' IN (NEW.status, OLD.status)) THEN
      IF NOT app.can(NEW.school_id, 'documents.publish') THEN
        RAISE EXCEPTION 'publishing documents requires documents.publish' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND 'archived' IN (NEW.status, OLD.status)
       AND NOT app.can(NEW.school_id, 'documents.archive') THEN
      RAISE EXCEPTION 'archiving documents requires documents.archive' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_document_write BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION app.guard_document_write();

CREATE OR REPLACE FUNCTION app.record_document_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    INSERT INTO public.document_versions (document_id, school_id, version, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (NEW.id, NEW.school_id, NEW.current_version, NEW.storage_path, NEW.file_name, NEW.mime_type, NEW.size_bytes,
            coalesce(NEW.updated_by, NEW.created_by));
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_record_document_version AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION app.record_document_version();
CREATE TRIGGER trg_audit_documents AFTER UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('document', 'status', 'access', 'allowed_roles', 'current_version');

CREATE OR REPLACE FUNCTION app.can_read_document(p_school uuid, p_status text, p_access text, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (p_status = 'published' AND (
      (p_access = 'public' AND app.is_school_public(p_school))
      OR (p_school = app.current_school_id() AND (
            p_access = 'school'
            OR (p_access = 'staff' AND app.is_staff_member())
            OR (p_access = 'roles' AND p_roles && app.my_role_slugs())
          ))
    ))
    OR app.can(p_school, 'documents.create')
    OR app.can(p_school, 'documents.publish')
    OR app.can(p_school, 'documents.archive')
$$;
GRANT EXECUTE ON FUNCTION app.can_read_document(uuid, text, text, text[]) TO anon, authenticated;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_public_read ON public.documents FOR SELECT TO anon USING (
  status = 'published' AND access = 'public' AND app.is_school_public(school_id)
);
CREATE POLICY documents_member_read ON public.documents FOR SELECT TO authenticated
  USING (app.can_read_document(school_id, status, access, allowed_roles));
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'documents.create'));
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING (
  app.can(school_id, 'documents.create') OR app.can(school_id, 'documents.publish') OR app.can(school_id, 'documents.archive')
) WITH CHECK (
  app.can(school_id, 'documents.create') OR app.can(school_id, 'documents.publish') OR app.can(school_id, 'documents.archive')
);
CREATE POLICY documents_delete_draft ON public.documents FOR DELETE TO authenticated
  USING (status = 'draft' AND published_at IS NULL AND app.can(school_id, 'documents.archive'));

CREATE POLICY document_folders_read ON public.document_folders FOR SELECT TO anon, authenticated
  USING (app.is_school_public(school_id) OR app.can_read_school(school_id));
CREATE POLICY document_folders_write ON public.document_folders FOR ALL TO authenticated
  USING (app.can(school_id, 'documents.create')) WITH CHECK (app.can(school_id, 'documents.create'));

CREATE POLICY document_versions_read ON public.document_versions FOR SELECT TO authenticated
  USING (app.can(school_id, 'documents.create') OR app.can(school_id, 'documents.publish'));
REVOKE INSERT, UPDATE, DELETE ON public.document_versions FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Media registry RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_assets_read ON public.media_assets FOR SELECT TO authenticated
  USING (app.can(school_id, 'media.upload') OR app.can(school_id, 'media.manage') OR uploaded_by = (SELECT auth.uid()));
CREATE POLICY media_assets_insert ON public.media_assets FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = (SELECT auth.uid())
  AND school_id = (SELECT app.current_school_id())
  AND (app.can(school_id, 'media.upload') OR app.can(school_id, 'library.create') OR app.can(school_id, 'documents.create')
       OR app.can(school_id, 'cms.manage') OR app.can(school_id, 'homework.create') OR app.can(school_id, 'events.manage')
       OR app.can(school_id, 'news.create') OR (usage = 'homework' AND (SELECT app.my_student_id()) IS NOT NULL))
);
CREATE POLICY media_assets_update ON public.media_assets FOR UPDATE TO authenticated
  USING (app.can(school_id, 'media.manage') OR uploaded_by = (SELECT auth.uid()))
  WITH CHECK (app.can(school_id, 'media.manage') OR uploaded_by = (SELECT auth.uid()));
CREATE POLICY media_assets_delete ON public.media_assets FOR DELETE TO authenticated
  USING (app.can(school_id, 'media.manage'));

-- ----------------------------------------------------------------------------
-- 7. Structured homepage sections
-- ----------------------------------------------------------------------------
CREATE TABLE public.site_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  section_key varchar(30) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_approved boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_sections_key_check CHECK (section_key IN (
    'identity', 'hero', 'intro', 'principal_message', 'statistics', 'news', 'announcements', 'events',
    'library', 'documents', 'links', 'contacts', 'footer')),
  CONSTRAINT site_sections_unique UNIQUE (school_id, section_key),
  CONSTRAINT site_sections_content_shape CHECK (jsonb_typeof(content) = 'object' AND length(content::text) <= 100000)
);
CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.site_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_audit_site_sections AFTER UPDATE ON public.site_sections
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('site_section', 'is_enabled', 'content', 'is_approved');

CREATE OR REPLACE FUNCTION app.stamp_site_section()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF app.is_api_caller() THEN
    NEW.updated_by := (SELECT auth.uid());
    IF TG_OP = 'UPDATE' AND (NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.section_key IS DISTINCT FROM OLD.section_key) THEN
      RAISE EXCEPTION 'section identity cannot be changed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_stamp_site_section BEFORE INSERT OR UPDATE ON public.site_sections
  FOR EACH ROW EXECUTE FUNCTION app.stamp_site_section();

ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_sections_public_read ON public.site_sections FOR SELECT TO anon, authenticated
  USING ((is_enabled AND app.is_school_public(school_id)) OR app.can(school_id, 'cms.manage'));
CREATE POLICY site_sections_write ON public.site_sections FOR UPDATE TO authenticated
  USING (app.can(school_id, 'cms.manage')) WITH CHECK (app.can(school_id, 'cms.manage'));
REVOKE INSERT, DELETE ON public.site_sections FROM anon, authenticated;

CREATE OR REPLACE FUNCTION app.provision_site_sections(p_school_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.site_sections (school_id, section_key, sort_order, is_enabled)
  SELECT p_school_id, k, o, k NOT IN ('principal_message', 'statistics', 'library', 'documents', 'links')
  FROM unnest(ARRAY['identity','hero','intro','principal_message','statistics','news','announcements','events',
                    'library','documents','links','contacts','footer']) WITH ORDINALITY AS x(k, o)
  ON CONFLICT (school_id, section_key) DO NOTHING
$$;
REVOKE EXECUTE ON FUNCTION app.provision_site_sections(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app.after_school_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.provision_school(NEW.id);
  PERFORM app.provision_assessment_types(NEW.id);
  PERFORM app.provision_site_sections(NEW.id);
  RETURN NEW;
END;
$$;
SELECT app.provision_site_sections(id) FROM public.schools;

-- Carry existing landing-page texts over unchanged (owner content, unapproved).
UPDATE public.site_sections s
SET content = jsonb_strip_nulls(jsonb_build_object(
      'tg', jsonb_strip_nulls(jsonb_build_object('title', b.title_tg, 'body', b.body_tg, 'image_url', b.image_url)),
      'ru', jsonb_strip_nulls(jsonb_build_object('title', b.title_ru, 'body', b.body_ru)),
      'en', jsonb_strip_nulls(jsonb_build_object('title', b.title_en, 'body', b.body_en))
    ))
FROM public.content_blocks b
WHERE b.school_id = s.school_id AND b.is_visible
  AND ((b.section = 'hero' AND s.section_key = 'hero')
    OR (b.section = 'about' AND s.section_key = 'intro')
    OR (b.section = 'support' AND s.section_key = 'contacts'));

-- ----------------------------------------------------------------------------
-- 8. CMS pages: no raw HTML, published pages visible on the public site
-- ----------------------------------------------------------------------------
UPDATE public.content_blocks SET type = 'text' WHERE type = 'html';
ALTER TABLE public.content_blocks DROP CONSTRAINT IF EXISTS content_blocks_type_check;
ALTER TABLE public.content_blocks ADD CONSTRAINT content_blocks_type_check CHECK (type IN ('text', 'image', 'banner', 'gallery'));

SELECT app.drop_policies('public', 'pages');
CREATE POLICY pages_public_read ON public.pages FOR SELECT TO anon, authenticated
  USING ((is_published AND app.is_school_public(school_id)) OR app.can(school_id, 'cms.manage'));
CREATE POLICY pages_write ON public.pages FOR ALL TO authenticated
  USING (app.can(school_id, 'cms.manage')) WITH CHECK (app.can(school_id, 'cms.manage'));

SELECT app.drop_policies('public', 'content_blocks');
CREATE POLICY content_blocks_public_read ON public.content_blocks FOR SELECT TO anon, authenticated USING (
  (is_visible AND app.is_school_public(school_id)
   AND (page_id IS NULL OR EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_id AND p.is_published)))
  OR app.can(school_id, 'cms.manage')
);
CREATE POLICY content_blocks_write ON public.content_blocks FOR ALL TO authenticated
  USING (app.can(school_id, 'cms.manage')) WITH CHECK (app.can(school_id, 'cms.manage'));

CREATE TRIGGER trg_audit_pages AFTER UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('page', 'is_published', 'slug');

-- ----------------------------------------------------------------------------
-- 9. Library v2
-- ----------------------------------------------------------------------------
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS subtitle varchar(500),
  ADD COLUMN IF NOT EXISTS isbn varchar(20),
  ADD COLUMN IF NOT EXISTS page_count int,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shelf_location varchar(100),
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_quantity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status varchar(10) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS view_count int NOT NULL DEFAULT 0;

UPDATE public.library_items SET status = CASE WHEN is_published THEN 'published' ELSE 'archived' END,
  published_at = CASE WHEN is_published THEN created_at END;

ALTER TABLE public.library_items ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.library_items ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.library_items ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE public.library_items ALTER COLUMN file_size DROP NOT NULL;
ALTER TABLE public.library_items ALTER COLUMN file_type DROP NOT NULL;
ALTER TABLE public.library_items ALTER COLUMN is_published SET DEFAULT false;
ALTER TABLE public.library_items DROP CONSTRAINT IF EXISTS lib_items_visibility_check;
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_visibility_check CHECK (visibility IN ('public', 'all', 'teachers', 'admin', 'specific'));
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_status_check CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_file_all_or_none CHECK (
  (file_url IS NULL AND file_name IS NULL AND file_size IS NULL AND file_type IS NULL)
  OR (file_url IS NOT NULL AND file_name IS NOT NULL AND file_size IS NOT NULL AND file_type IS NOT NULL)
);
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_quantity_check CHECK (quantity >= 0 AND available_quantity >= 0 AND available_quantity <= quantity);
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_isbn_format CHECK (isbn IS NULL OR isbn ~ '^[0-9Xx-]{10,17}$');
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_pages_check CHECK (page_count IS NULL OR page_count > 0);
ALTER TABLE public.library_items ADD CONSTRAINT lib_items_paths_scope CHECK (
  (file_url IS NULL OR (file_url LIKE school_id::text || '/%' AND file_url NOT LIKE '%..%'))
  AND (cover_url IS NULL OR (cover_url LIKE school_id::text || '/%' AND cover_url NOT LIKE '%..%'))
);
ALTER TABLE public.library_categories ADD COLUMN IF NOT EXISTS name_en varchar(200);
CREATE INDEX IF NOT EXISTS idx_lib_items_school_status ON public.library_items(school_id, status);

-- Legacy cross-school trigger (00010) treated a NULL category as a violation.
CREATE OR REPLACE FUNCTION public.validate_library_item_school()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL
     AND (SELECT school_id FROM public.library_categories WHERE id = NEW.category_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: library category must belong to same school';
  END IF;
  IF NEW.subject_id IS NOT NULL
     AND (SELECT school_id FROM public.subjects WHERE id = NEW.subject_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: subject must belong to same school';
  END IF;
  IF NEW.uploaded_by IS NOT NULL AND public.get_user_school_id(NEW.uploaded_by) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: uploader must belong to same school';
  END IF;
  RETURN NEW;
END;
$$;

-- The legacy soft-delete trigger drives unpublished_at from is_published;
-- status is now authoritative and is_published mirrors it.
CREATE OR REPLACE FUNCTION app.guard_library_item_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_published IS DISTINCT FROM OLD.is_published AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.status := CASE WHEN NEW.is_published THEN 'published' ELSE 'draft' END;
  END IF;
  NEW.is_published := NEW.status = 'published';
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    NEW.published_at := now();
  END IF;
  IF NEW.status = 'archived' AND (TG_OP = 'INSERT' OR OLD.status <> 'archived') THEN
    NEW.archived_at := now();
  END IF;

  IF app.is_api_caller() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.uploaded_by := (SELECT auth.uid());
      NEW.view_count := 0;
    ELSE
      NEW.updated_by := (SELECT auth.uid());
      IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.view_count IS DISTINCT FROM OLD.view_count THEN
        RAISE EXCEPTION 'protected library field cannot be changed' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status = 'published')
       OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND 'published' IN (NEW.status, OLD.status) AND NEW.status <> 'archived') THEN
      IF NOT app.can(NEW.school_id, 'library.publish') THEN
        RAISE EXCEPTION 'publishing books requires library.publish' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND 'archived' IN (NEW.status, OLD.status))
       OR (TG_OP = 'INSERT' AND NEW.status = 'archived') THEN
      IF NOT app.can(NEW.school_id, 'library.archive') THEN
        RAISE EXCEPTION 'archiving books requires library.archive' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_a_guard_library_item_write BEFORE INSERT OR UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION app.guard_library_item_write();
CREATE TRIGGER trg_audit_library_items AFTER UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION app.audit_row_change('library_item', 'status', 'visibility', 'file_url');

CREATE OR REPLACE FUNCTION app.can_manage_library(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.can(p_school, 'library.create') OR app.can(p_school, 'library.update')
      OR app.can(p_school, 'library.publish') OR app.can(p_school, 'library.archive')
$$;
GRANT EXECUTE ON FUNCTION app.can_manage_library(uuid) TO authenticated;

SELECT app.drop_policies('public', 'library_items');
CREATE POLICY lib_items_public_read ON public.library_items FOR SELECT TO anon
  USING (status = 'published' AND visibility = 'public' AND app.is_school_public(school_id));
CREATE POLICY lib_items_member_read ON public.library_items FOR SELECT TO authenticated USING (
  (
    status = 'published' AND school_id = (SELECT app.current_school_id()) AND (SELECT app.has_own_permission('library.view'))
    AND (
      visibility IN ('public', 'all')
      OR (visibility = 'teachers' AND (SELECT app.is_staff_member()))
      OR (visibility = 'specific' AND (
        EXISTS (SELECT 1 FROM public.library_item_access lia JOIN public.roles r ON r.id = lia.role_id
                WHERE lia.item_id = library_items.id AND r.slug = ANY ((SELECT app.my_role_slugs())::text[]))
        OR EXISTS (SELECT 1 FROM public.library_item_access lia
                   WHERE lia.item_id = library_items.id
                     AND (lia.class_id = ANY ((SELECT app.my_family_class_ids())::uuid[])
                          OR lia.class_id = ANY ((SELECT app.my_class_ids())::uuid[])))
      ))
    )
  )
  OR (status = 'published' AND visibility = 'public' AND app.is_school_public(school_id))
  OR app.can_manage_library(school_id)
);
CREATE POLICY lib_items_insert ON public.library_items FOR INSERT TO authenticated
  WITH CHECK (app.can(school_id, 'library.create'));
CREATE POLICY lib_items_update ON public.library_items FOR UPDATE TO authenticated
  USING (app.can(school_id, 'library.update') OR app.can(school_id, 'library.publish') OR app.can(school_id, 'library.archive'))
  WITH CHECK (app.can(school_id, 'library.update') OR app.can(school_id, 'library.publish') OR app.can(school_id, 'library.archive'));
CREATE POLICY lib_items_delete_safe ON public.library_items FOR DELETE TO authenticated USING (
  app.can(school_id, 'library.archive') AND status = 'draft' AND published_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.library_reading_history h WHERE h.item_id = library_items.id)
);

SELECT app.drop_policies('public', 'library_categories');
CREATE POLICY lib_categories_read ON public.library_categories FOR SELECT TO anon, authenticated
  USING ((is_active AND (app.is_school_public(school_id) OR app.can_read_school(school_id))) OR app.can_manage_library(school_id));
CREATE POLICY lib_categories_write ON public.library_categories FOR ALL TO authenticated
  USING (app.can(school_id, 'library.update')) WITH CHECK (app.can(school_id, 'library.update'));

SELECT app.drop_policies('public', 'library_item_access');
CREATE POLICY lib_item_access_read ON public.library_item_access FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY lib_item_access_write ON public.library_item_access FOR ALL TO authenticated
  USING (app.can(school_id, 'library.update')) WITH CHECK (app.can(school_id, 'library.update'));

SELECT app.drop_policies('public', 'library_favorites');
CREATE POLICY lib_favorites_read ON public.library_favorites FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY lib_favorites_insert ON public.library_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id())
              AND EXISTS (SELECT 1 FROM public.library_items i WHERE i.id = item_id));
CREATE POLICY lib_favorites_delete ON public.library_favorites FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

SELECT app.drop_policies('public', 'library_reading_history');
CREATE POLICY lib_history_read ON public.library_reading_history FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY lib_history_insert ON public.library_reading_history FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND school_id = (SELECT app.current_school_id())
              AND EXISTS (SELECT 1 FROM public.library_items i WHERE i.id = item_id));
CREATE POLICY lib_history_update ON public.library_reading_history FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION app.increment_library_view(p_item_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.library_items SET view_count = view_count + 1 WHERE id = p_item_id AND status = 'published'
$$;
GRANT EXECUTE ON FUNCTION app.increment_library_view(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_library_view(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.library_items WHERE id = p_item_id) THEN
    PERFORM app.increment_library_view(p_item_id);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_library_view(uuid) TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'app' AND p.prorettype = 'trigger'::regtype LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;
