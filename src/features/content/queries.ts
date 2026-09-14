import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "critical";
  publishAt: string;
  expiresAt: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
}

/** Announcements visible to the signed-in user (RLS applies audience targeting). */
export const getVisibleAnnouncements = cache(async (schoolId: string, limit = 20): Promise<AnnouncementItem[]> => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, priority, publish_at, expires_at, attachment_path, attachment_name")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("priority", { ascending: true })
    .order("publish_at", { ascending: false })
    .limit(limit);
  const rank = { critical: 0, important: 1, normal: 2 } as const;
  return (data ?? [])
    .map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      priority: (["normal", "important", "critical"].includes(a.priority) ? a.priority : "normal") as AnnouncementItem["priority"],
      publishAt: a.publish_at,
      expiresAt: a.expires_at,
      attachmentPath: a.attachment_path,
      attachmentName: a.attachment_name,
    }))
    .sort((x, y) => rank[x.priority] - rank[y.priority] || y.publishAt.localeCompare(x.publishAt));
});

export interface EventItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  audience: string;
  organizer: string | null;
  imagePath: string | null;
  status: string;
}

export const getUpcomingEvents = cache(async (schoolId: string, limit = 10): Promise<EventItem[]> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("events")
    .select("id, title, description, category, starts_at, ends_at, all_day, location, audience, organizer, image_path, status")
    .eq("school_id", schoolId)
    .in("status", ["published", "cancelled"])
    .gte("starts_at", since)
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map(mapEvent);
});

export function mapEvent(e: {
  id: string; title: string; description: string | null; category: string; starts_at: string; ends_at: string | null;
  all_day: boolean; location: string | null; audience: string; organizer: string | null; image_path: string | null; status: string;
}): EventItem {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    allDay: e.all_day,
    location: e.location,
    audience: e.audience,
    organizer: e.organizer,
    imagePath: e.image_path,
    status: e.status,
  };
}

export interface NewsListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  coverImageUrl: string | null;
  publishAt: string | null;
  isFeatured: boolean;
  language: string;
  categoryId: string | null;
}

export const getLatestNews = cache(async (schoolId: string, limit = 3): Promise<NewsListItem[]> => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("news_articles")
    .select("id, slug, title, summary, content, cover_image_url, publish_at, is_featured, language, category_id")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("is_featured", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id,
    slug: n.slug,
    title: n.title,
    summary: n.summary,
    content: n.content,
    coverImageUrl: n.cover_image_url,
    publishAt: n.publish_at,
    isFeatured: n.is_featured,
    language: n.language,
    categoryId: n.category_id,
  }));
});

/** Public URL for an object in the public-media bucket. */
export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/public-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
