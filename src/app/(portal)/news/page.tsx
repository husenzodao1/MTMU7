import type { Metadata } from "next";
import { Byline, ReactionBar, type RoleName } from "@/features/news/reactions-ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Newspaper, PenLine } from "lucide-react";
import { getNewsCategories } from "@/features/news/queries";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { markdownToPlainText } from "@/lib/content/markdown";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("news") };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("news");
  if (!can(access, "news.view")) redirect("/access-denied");
  const t = await getTranslations("portal.news");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const schoolId = access.school!.id;
  const categories = await getNewsCategories(schoolId, locale);
  const list = parseListParams(params, {
    sorts: ["recent"],
    defaultSort: "recent",
    pageSize: 12,
    filters: { category: "uuid", language: ["tg", "ru", "en"] },
  });

  const supabase = await createClient();
  const now = new Date().toISOString();
  let query = supabase
    .from("news_articles")
    .select("id, slug, title, summary, content, cover_image_url, publish_at, is_featured, category_id, language", { count: "exact" })
    .eq("school_id", schoolId)
    .eq("status", "published")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("is_featured", { ascending: false })
    .order("publish_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  if (list.filters.category) query = query.eq("category_id", list.filters.category);
  if (list.filters.language) query = query.eq("language", list.filters.language);
  const { data, count } = await query;

  // One call for the whole page: readers, support, replies and the byline.
  const ids = (data ?? []).map((a) => a.id);
  const { data: engagementRows } = await supabase.rpc("news_engagement", { p_ids: ids });
  const engagement = new Map((engagementRows ?? []).flatMap((row) => (row.article_id ? [[row.article_id, row] as const] : [])));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const tl = await getTranslations("common.locales");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={can(access, "news.create") ? (
          <Link href="/news/mine" className={buttonClasses("secondary")}>
            <PenLine aria-hidden />
            {t("myArticles")}
          </Link>
        ) : null}
      />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "category", label: t("category"), options: categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })) },
          { name: "language", label: t("language"), options: ["tg", "ru", "en"].map((l) => ({ value: l, label: tl(l) })) },
        ]}
      />
      {!data || data.length === 0 ? (
        <Card as="div"><EmptyState icon={<Newspaper />} title={t("empty")} /></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((article) => (
            <li key={article.id}>
              <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                {article.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- editorial image from public storage
                  <img src={article.cover_image_url} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                ) : null}
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {article.is_featured ? <Badge tone="brand">{t("featured")}</Badge> : null}
                    {article.category_id && categoryName.get(article.category_id) ? <Badge>{categoryName.get(article.category_id)}</Badge> : null}
                  </div>
                  <h2 className="text-lg font-semibold leading-snug">
                    <Link href={`/news/${article.slug}`} className="hover:text-brand-text hover:underline">
                      {article.title}
                    </Link>
                  </h2>
                  <p className="mt-1 line-clamp-3 text-sm text-ink-secondary">{article.summary || markdownToPlainText(article.content, 220)}</p>
                  <div className="mt-auto flex items-start justify-between gap-3 pt-3">
                    <p className="text-xs text-ink-muted tabular">{formatDate(article.publish_at, locale)}</p>
                    {engagement.get(article.id)?.author_name ? (
                      <Byline
                        name={engagement.get(article.id)!.author_name ?? ""}
                        role={engagement.get(article.id)!.author_role as RoleName | null}
                      />
                    ) : null}
                  </div>
                  {engagement.has(article.id) ? (
                    <ReactionBar
                      className="mt-2 border-t border-line pt-2"
                      articleId={article.id}
                      engagement={{
                        views: engagement.get(article.id)!.views ?? 0,
                        likes: engagement.get(article.id)!.likes ?? 0,
                        comments: engagement.get(article.id)!.comments ?? 0,
                        liked: engagement.get(article.id)!.liked ?? false,
                      }}
                    />
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      <Pagination pathname="/news" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
