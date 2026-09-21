import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Markdown } from "@/components/ui/misc";
import { getPublicSchoolBySlug } from "@/lib/site/identity";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { markdownToPlainText } from "@/lib/content/markdown";

type Props = { params: Promise<{ school: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school: schoolSlug, slug } = await params;
  const school = await getPublicSchoolBySlug(schoolSlug);
  if (!school) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_articles")
    .select("title, summary, content, cover_image_url, publish_at")
    .eq("school_id", school.id).eq("slug", slug).eq("status", "published").eq("visibility", "public")
    .maybeSingle();
  if (!data?.title) return {};
  const description = data.summary || markdownToPlainText(data.content, 200);
  return {
    title: data.title,
    description,
    openGraph: {
      type: "article",
      title: data.title,
      description,
      publishedTime: data.publish_at ?? undefined,
      images: data.cover_image_url ? [data.cover_image_url] : undefined,
    },
  };
}

export default async function PublicNewsArticle({ params }: Props) {
  const { school: schoolSlug, slug } = await params;
  const school = await getPublicSchoolBySlug(schoolSlug);
  if (!school) notFound();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase.from("news_articles").select("title, content, cover_image_url, publish_at").eq("school_id", school.id).eq("slug", slug).eq("status", "published").eq("visibility", "public").lte("publish_at", now).or(`expires_at.is.null,expires_at.gt.${now}`).maybeSingle();
  if (!data) notFound();
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("site.public");
  return <article className="mx-auto max-w-3xl px-4 py-10 sm:py-16"><a className="text-sm font-semibold text-brand-text hover:underline" href={`/s/${school.slug}/news`}>← {t("news")}</a>{data.cover_image_url ? (<>
    {/* eslint-disable-next-line @next/next/no-img-element -- editorial image URL may be stored outside the Next image loader */}
    <img src={data.cover_image_url} alt="" className="mt-6 aspect-video w-full object-cover" />
  </>) : null}<h1 className="mt-7 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{data.title}</h1>{data.publish_at ? <p className="mt-3 text-sm text-ink-muted">{formatDate(data.publish_at, locale)}</p> : null}<div className="mt-8 leading-7 text-ink-secondary"><Markdown source={data.content} /></div></article>;
}
