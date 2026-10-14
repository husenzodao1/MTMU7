-- Reading, liking and discussing the news.
--
-- A notice board tells you nothing about whether anyone read it. Articles now
-- carry how many people opened them, how many said the piece was worth it, and
-- what those people wanted to add — and each article shows who published it and
-- in what capacity, because a notice from the director is not the same notice
-- from anyone else.

-- ----------------------------------------------------------------------------
-- 1. Who may see an article at all
-- ----------------------------------------------------------------------------
-- Reactions must never become a way to probe for articles a person cannot read,
-- so every function below decides through this one test.
CREATE OR REPLACE FUNCTION app.can_read_news(p_article uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.news_articles n
    WHERE n.id = p_article
      AND n.status = 'published'
      AND app.in_publish_window(n.publish_at, n.expires_at)
      AND (
        (n.visibility = 'public' AND app.is_school_public(n.school_id))
        OR (n.school_id = (SELECT app.current_school_id())
            AND (n.visibility = 'school' OR (n.visibility = 'staff' AND (SELECT app.is_staff_member()))))
      )
  )
$fn$;

-- ----------------------------------------------------------------------------
-- 2. Distinct readers, likes, comments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_views (
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.news_likes (
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  article_id uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_news_comments_article ON public.news_comments(article_id, created_at DESC);

ALTER TABLE public.news_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;

-- Rows are written through the functions below, which run as definer. Direct
-- reads are limited to a person's own marks; the totals come from the RPC, so
-- nobody can list who liked or read what.
CREATE POLICY news_views_self ON public.news_views FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY news_likes_self ON public.news_likes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- A hidden comment stays visible to whoever may moderate it, otherwise hiding
-- one would be irreversible: nobody could find it again to bring it back. The
-- listing function filters hidden rows out for ordinary readers.
CREATE POLICY news_comments_read ON public.news_comments FOR SELECT TO authenticated
  USING (
    app.can_read_news(article_id)
    AND (NOT is_hidden OR app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish'))
  );
CREATE POLICY news_comments_delete ON public.news_comments FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish'));
-- Hiding rather than deleting is the moderator's tool.
CREATE POLICY news_comments_moderate ON public.news_comments FOR UPDATE TO authenticated
  USING (app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish'))
  WITH CHECK (app.can(school_id, 'news.update') OR app.can(school_id, 'news.publish'));

GRANT SELECT ON public.news_views, public.news_likes TO authenticated;
GRANT SELECT, DELETE ON public.news_comments TO authenticated;
GRANT UPDATE (is_hidden) ON public.news_comments TO authenticated;
GRANT ALL ON public.news_views, public.news_likes, public.news_comments TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Recording a read
-- ----------------------------------------------------------------------------
-- The counter on the article stays authoritative, but it now counts people
-- rather than page loads: opening the same article twice adds nothing.
CREATE OR REPLACE FUNCTION public.record_news_view(p_article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_new boolean := false;
BEGIN
  IF NOT app.can_read_news(p_article_id) THEN
    RETURN;
  END IF;

  IF v_uid IS NULL THEN
    -- An anonymous reader on the public site cannot be counted twice, so the
    -- visit is counted once and not attributed to anyone.
    UPDATE public.news_articles SET view_count = view_count + 1 WHERE id = p_article_id;
    RETURN;
  END IF;

  INSERT INTO public.news_views (article_id, user_id)
  VALUES (p_article_id, v_uid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;
  IF v_new THEN
    UPDATE public.news_articles SET view_count = view_count + 1 WHERE id = p_article_id;
  END IF;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.record_news_view(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Liking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_news_like(p_article uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_liked boolean;
  v_total int;
BEGIN
  IF v_uid IS NULL OR NOT app.can_read_news(p_article) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.news_likes WHERE article_id = p_article AND user_id = v_uid;
  IF FOUND THEN
    v_liked := false;
  ELSE
    INSERT INTO public.news_likes (article_id, user_id) VALUES (p_article, v_uid);
    v_liked := true;
  END IF;

  SELECT count(*)::int INTO v_total FROM public.news_likes WHERE article_id = p_article;
  RETURN jsonb_build_object('liked', v_liked, 'likes', v_total);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.toggle_news_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_news_like(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Commenting
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_news_comment(p_article uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_school uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.can_read_news(p_article) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  SELECT u.school_id INTO v_school FROM public.users u WHERE u.id = v_uid;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.news_comments (school_id, article_id, author_id, body)
  VALUES (v_school, p_article, v_uid, v_body)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.add_news_comment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_news_comment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_news_comments(p_article uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, body text, created_at timestamptz, author_id uuid,
  author_name text, author_nickname varchar, author_avatar_url varchar, author_role jsonb, is_mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT c.id, c.body, c.created_at, c.author_id,
         (u.last_name || ' ' || u.first_name)::text, u.nickname, u.avatar_url,
         (SELECT jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en)
          FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id ORDER BY r.level LIMIT 1),
         c.author_id = (SELECT auth.uid())
  FROM public.news_comments c
  JOIN public.users u ON u.id = c.author_id
  WHERE c.article_id = p_article AND NOT c.is_hidden AND app.can_read_news(p_article)
  ORDER BY c.created_at
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$fn$;
GRANT EXECUTE ON FUNCTION public.list_news_comments(uuid, int) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. What a list of articles needs in one call
-- ----------------------------------------------------------------------------
-- The byline is part of this: an article carries the standing of whoever
-- published it, so the reader sees "Director" next to the notice, not a name
-- they have to look up.
CREATE OR REPLACE FUNCTION public.news_engagement(p_ids uuid[])
RETURNS TABLE (
  article_id uuid, views int, likes int, comments int, liked boolean,
  author_name text, author_role jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT n.id,
         n.view_count,
         (SELECT count(*)::int FROM public.news_likes l WHERE l.article_id = n.id),
         (SELECT count(*)::int FROM public.news_comments c WHERE c.article_id = n.id AND NOT c.is_hidden),
         EXISTS (SELECT 1 FROM public.news_likes l WHERE l.article_id = n.id AND l.user_id = (SELECT auth.uid())),
         (u.last_name || ' ' || u.first_name)::text,
         (SELECT jsonb_build_object('slug', r.slug, 'name_tg', r.name_tg, 'name_ru', r.name_ru, 'name_en', r.name_en)
          FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = n.author_id ORDER BY r.level LIMIT 1)
  FROM public.news_articles n
  JOIN public.users u ON u.id = n.author_id
  WHERE n.id = ANY (coalesce(p_ids, '{}'::uuid[]))
    AND array_length(p_ids, 1) <= 100
    AND app.can_read_news(n.id)
$fn$;
GRANT EXECUTE ON FUNCTION public.news_engagement(uuid[]) TO anon, authenticated;
