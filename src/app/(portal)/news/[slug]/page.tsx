import type { Metadata } from "next";
import { NewsComments } from "@/features/news/comments";
import { Byline, ReactionBar } from "@/features/news/reactions-ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { MarkdownBlocks, splitLeadImage } from "@/components/ui/misc";
import { parseMarkdown } from "@/lib/content/markdown";
import { Alert, Breadcrumb, Card, CardBody } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

async function load(slug: string, schoolId: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_articles")
    .select("id, slug, title, summary, content, cover_image_url, publish_at, status, tags, author_id, seo_title, seo_description, language")
    .eq("school_id", schoolId)
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const access = await requireModule("news");
  const article = await load((await params).slug, access.school!.id);
  return article ? { title: article.seo_title || article.title, description: article.seo_description || article.summary || undefined } : {};
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const access = await requireModule("news");
  const { slug } = await params;
  const article = await load(slug, access.school!.id);
  if (!article) notFound();

  const t = await getTranslations("portal.news");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  if (article.status === "published") await supabase.rpc("record_news_view", { p_article_id: article.id });
  const { data: engagementRows } = await supabase.rpc("news_engagement", { p_ids: [article.id] });
  const engagement = (engagementRows ?? [])[0] ?? null;

  const canEdit = canAny(access, ["news.update", "news.publish"]) || (article.author_id === access.userId && can(access, "news.create"));

  // A cover picture if the article has one; otherwise the first picture in the
  // body, which is where people put it when there is no cover field to hand.
  const inBody = splitLeadImage(article.content);
  const lead = article.cover_image_url ? { src: article.cover_image_url, alt: "" } : inBody.lead;
  const body = article.cover_image_url ? parseMarkdown(article.content) : inBody.rest;

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/news" }, { label: article.title }]} />
      {article.status !== "published" ? (
        <Alert tone="warning" className="mb-4" title={t("notPublished")}>
          <StatusBadge status={article.status} label={ts(article.status)} />
        </Alert>
      ) : null}
      {lead ? (
        // eslint-disable-next-line @next/next/no-img-element -- editorial image from public storage
        <img
          src={lead.src}
          alt={lead.alt}
          className="mb-5 max-h-[30rem] w-full rounded-xl border border-line object-cover"
        />
      ) : null}
      <header className="mb-5">
        <h1 className="text-3xl font-semibold leading-tight">{article.title}</h1>
        {article.summary ? <p className="mt-2 text-lg text-ink-secondary">{article.summary}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          {article.publish_at ? <time dateTime={article.publish_at} className="tabular">{formatDate(article.publish_at, locale)}</time> : null}
          {article.tags?.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
          {engagement?.author_name ? (
            <span className="ms-auto">
              <Byline name={engagement.author_name} role={engagement.author_role as never} />
            </span>
          ) : null}
          {canEdit ? (
            <Link href={canAny(access, ["news.update", "news.publish"]) ? `/admin/news/${article.id}` : `/news/edit/${article.id}`} className={buttonClasses("secondary", "sm", engagement?.author_name ? "" : "ms-auto")}>
              {t("edit")}
            </Link>
          ) : null}
        </div>
      </header>
      <Card as="div">
        <CardBody className="p-5 sm:p-7">
          <MarkdownBlocks blocks={body} lang={article.language} />
          {engagement ? (
            <ReactionBar
              className="mt-6 border-t border-line pt-4"
              articleId={article.id}
              engagement={{
                views: engagement.views ?? 0,
                likes: engagement.likes ?? 0,
                comments: engagement.comments ?? 0,
                liked: engagement.liked ?? false,
              }}
            />
          ) : null}
        </CardBody>
      </Card>
      <NewsComments articleId={article.id} />
    </article>
  );
}
