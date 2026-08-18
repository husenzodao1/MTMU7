"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { requireAdmin } from "@/lib/admin/guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  coverImageUrl: string | null;
  status: string;
  isPinned: boolean;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
  rejectionReason: string | null;
  author: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

export async function getPublishedNews(): Promise<NewsArticle[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("news_articles" as never)
    .select("id, title, content, cover_image_url, status, is_pinned, view_count, created_at, published_at, rejection_reason, author:author_id(id, first_name, last_name, avatar_url)" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("status" as never, "published")
    .order("is_pinned" as never, { ascending: false })
    .order("published_at" as never, { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapArticle);
}

export async function getMyArticles(): Promise<NewsArticle[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("news_articles" as never)
    .select("id, title, content, cover_image_url, status, is_pinned, view_count, created_at, published_at, rejection_reason, author:author_id(id, first_name, last_name, avatar_url)" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("author_id" as never, user.id)
    .order("created_at" as never, { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapArticle);
}

export async function getAllNewsForAdmin(): Promise<NewsArticle[]> {
  const admin = await requireAdmin();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("news_articles" as never)
    .select("id, title, content, cover_image_url, status, is_pinned, view_count, created_at, published_at, rejection_reason, author:author_id(id, first_name, last_name, avatar_url)" as never)
    .eq("school_id" as never, admin.schoolId)
    .order("created_at" as never, { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapArticle);
}

export async function getArticleById(id: string): Promise<NewsArticle | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("news_articles" as never)
    .select("id, title, content, cover_image_url, status, is_pinned, view_count, created_at, published_at, rejection_reason, author:author_id(id, first_name, last_name, avatar_url)" as never)
    .eq("id" as never, id)
    .single();

  if (!data) return null;

  // Increment view count for published
  const row = data as Record<string, unknown>;
  if (row.status === "published") {
    await supabase
      .from("news_articles" as never)
      .update({ view_count: ((row.view_count as number) ?? 0) + 1 } as never)
      .eq("id" as never, id);
  }

  return mapArticle(row);
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["draft", "submitted"]),
});

export async function createArticleAction(
  _prev: { error: string | null; success: boolean; id?: string },
  formData: FormData
): Promise<{ error: string | null; success: boolean; id?: string }> {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized", success: false };

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    coverImageUrl: formData.get("coverImageUrl") || "",
    status: formData.get("status") || "draft",
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("news_articles" as never)
    .insert({
      school_id: user.schoolId,
      title: parsed.data.title,
      content: parsed.data.content,
      cover_image_url: parsed.data.coverImageUrl || null,
      author_id: user.id,
      status: parsed.data.status,
    } as never)
    .select("id" as never)
    .single();

  if (error) return { error: error.message, success: false };
  const row = data as Record<string, unknown>;

  revalidatePath("/news");
  return { error: null, success: true, id: row.id as string };
}

export async function updateArticleStatusAction(
  _prev: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();
  const articleId = formData.get("articleId") as string;
  const newStatus = formData.get("status") as string;
  const rejectionReason = formData.get("rejectionReason") as string | null;

  if (!articleId || !newStatus) return { error: "invalidData", success: false };

  const supabase = await createServerClient();
  const updates: Record<string, unknown> = {
    status: newStatus,
    reviewed_by: admin.id,
    reviewed_at: new Date().toISOString(),
  };

  if (newStatus === "published") {
    updates.published_at = new Date().toISOString();
    updates.published_by = admin.id;
  }
  if (newStatus === "rejected" && rejectionReason) {
    updates.rejection_reason = rejectionReason;
  }

  const { error } = await supabase
    .from("news_articles" as never)
    .update(updates as never)
    .eq("id" as never, articleId);

  if (error) return { error: error.message, success: false };

  revalidatePath("/news");
  revalidatePath("/admin/news");
  return { error: null, success: true };
}

export async function deleteArticleAction(
  _prev: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized", success: false };

  const articleId = formData.get("articleId") as string;
  if (!articleId) return { error: "invalidData", success: false };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("news_articles" as never)
    .delete()
    .eq("id" as never, articleId);

  if (error) return { error: error.message, success: false };

  revalidatePath("/news");
  return { error: null, success: true };
}

function mapArticle(row: Record<string, unknown>): NewsArticle {
  const author = row.author as Record<string, unknown> | null;
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    coverImageUrl: row.cover_image_url as string | null,
    status: row.status as string,
    isPinned: row.is_pinned as boolean,
    viewCount: row.view_count as number,
    createdAt: row.created_at as string,
    publishedAt: row.published_at as string | null,
    rejectionReason: row.rejection_reason as string | null,
    author: {
      id: (author?.id as string) ?? "",
      firstName: (author?.first_name as string) ?? "",
      lastName: (author?.last_name as string) ?? "",
      avatarUrl: (author?.avatar_url as string | null) ?? null,
    },
  };
}
