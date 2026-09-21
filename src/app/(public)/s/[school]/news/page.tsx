import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NothingPublished, PublicSection, SchoolNotFound } from "@/features/site/public-shell";
import { getPublicSchoolBySlug } from "@/lib/site/identity";
import { publicSchoolTitle } from "@/features/site/metadata";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { markdownToPlainText } from "@/lib/content/markdown";

type Props = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [t, school] = await Promise.all([getTranslations("site.public"), publicSchoolTitle((await params).school)]);
  return { title: `${t("news")} · ${school}` };
}

export default async function PublicNewsPage({ params }: Props) {
  const { school: slug } = await params;
  const [school, localeValue, t, schoolName] = await Promise.all([
    getPublicSchoolBySlug(slug),
    getLocale(),
    getTranslations("site.public"),
    publicSchoolTitle(slug),
  ]);
  if (!school) return <SchoolNotFound />;
  const locale = localeValue as Locale;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("news_articles")
    .select("id, slug, title, summary, content, cover_image_url, publish_at")
    .eq("school_id", school.id)
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("publish_at", { ascending: false })
    .limit(50);

  return (
    <PublicSection title={t("news")} schoolSlug={school.slug} schoolName={schoolName}>
      {data?.length ? <ul className="grid gap-4 md:grid-cols-2">{data.map((article) => <li key={article.id} className="border border-line bg-surface p-5">
        {article.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- editorial image URL may be stored outside the Next image loader
          <img src={article.cover_image_url} alt="" className="mb-4 aspect-video w-full object-cover" />
        ) : null}
        <h2 className="text-xl font-semibold text-ink"><Link className="hover:text-brand-text hover:underline" href={`/s/${school.slug}/news/${article.slug}`}>{article.title}</Link></h2>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">{article.summary || markdownToPlainText(article.content, 220)}</p>
        {article.publish_at ? <p className="mt-4 text-xs text-ink-muted">{formatDate(article.publish_at, locale)}</p> : null}
      </li>)}</ul> : <NothingPublished />}
    </PublicSection>
  );
}
