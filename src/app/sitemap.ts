import type { MetadataRoute } from "next";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const MAX_ARTICLES = 500;

/**
 * Public URLs only: the directory, every active school's public pages and its
 * published public news. Nothing behind authentication is listed, and the
 * queries repeat the published/public filters rather than trusting the caller.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (publicEnv.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) return [];
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/schools`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
  if (!isSupabaseConfigured) return entries;

  try {
    const supabase = await createClient();
    const { data: schools } = await supabase.rpc("list_public_schools");
    for (const school of (schools ?? []) as Array<{ slug: string | null }>) {
      if (!school.slug) continue;
      entries.push(
        { url: `${base}/s/${school.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
        { url: `${base}/s/${school.slug}/news`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
        { url: `${base}/s/${school.slug}/events`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
        { url: `${base}/s/${school.slug}/documents`, lastModified: now, changeFrequency: "monthly", priority: 0.5 }
      );
    }

    const nowIso = now.toISOString();
    const { data: articles } = await supabase
      .from("news_articles")
      .select("slug, publish_at, updated_at, schools!inner(slug)")
      .eq("status", "published")
      .eq("visibility", "public")
      .lte("publish_at", nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("publish_at", { ascending: false })
      .limit(MAX_ARTICLES);
    for (const article of articles ?? []) {
      const school = article.schools as unknown as { slug: string | null } | null;
      if (!school?.slug || !article.slug) continue;
      entries.push({
        url: `${base}/s/${school.slug}/news/${article.slug}`,
        lastModified: new Date(article.updated_at ?? article.publish_at ?? now),
        changeFrequency: "yearly",
        priority: 0.4,
      });
    }
  } catch {
    // A sitemap must never break the site; the static entries above still stand.
  }
  return entries;
}
