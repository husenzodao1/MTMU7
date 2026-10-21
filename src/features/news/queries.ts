import "server-only";
import { cache } from "react";
import { isoToLocalInput } from "@/lib/i18n/zoned";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import type { EditorArticle } from "@/features/news/editor";

export const getNewsCategories = cache(async (schoolId: string, locale: Locale) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_categories")
    .select("id, name_tg, name_ru, name_en, slug, is_active, sort_order")
    .eq("school_id", schoolId)
    .order("sort_order");
  return (data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: pickName(c, locale), isActive: c.is_active }));
});

export async function getArticleForEdit(id: string, timeZone: string): Promise<EditorArticle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news_articles")
    .select("id, title, slug, summary, content, language, visibility, category_id, tags, seo_title, seo_description, publish_at, expires_at, is_featured, status, cover_image_url, rejection_reason, author_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    summary: data.summary,
    content: data.content,
    language: data.language,
    visibility: data.visibility,
    categoryId: data.category_id,
    tags: data.tags ?? [],
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    publishAt: isoToLocalInput(data.publish_at, timeZone),
    expiresAt: isoToLocalInput(data.expires_at, timeZone),
    isFeatured: data.is_featured,
    status: data.status,
    coverImageUrl: data.cover_image_url,
    rejectionReason: data.rejection_reason,
  };
}

export async function getArticleAuthor(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("news_articles").select("author_id").eq("id", id).maybeSingle();
  return data?.author_id ?? null;
}
