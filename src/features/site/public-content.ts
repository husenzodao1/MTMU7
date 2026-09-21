import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  coverImageUrl: string | null;
  publishAt: string | null;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
}

/**
 * Published, publicly visible news of one school. The filters are repeated
 * here rather than trusted from the caller; RLS enforces them again.
 */
export async function getPublicNews(schoolId: string, limit: number): Promise<PublicArticle[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("news_articles")
    .select("id, slug, title, summary, content, cover_image_url, publish_at")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("publish_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: row.content,
    coverImageUrl: row.cover_image_url,
    publishAt: row.publish_at,
  }));
}

/** Upcoming published events of one school. */
export async function getPublicEvents(schoolId: string, limit: number): Promise<PublicEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, description, starts_at, ends_at, location")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
  }));
}
