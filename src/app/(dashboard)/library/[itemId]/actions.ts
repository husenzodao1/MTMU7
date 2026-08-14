"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { getSignedFileUrl, getSignedCoverUrl } from "@/lib/storage/library";
import { redirect } from "next/navigation";

export interface BookDetail {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  signedCoverUrl: string | null;
  signedFileUrl: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  categoryId: string | null;
  categoryName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  language: string;
  publicationYear: number | null;
  publisher: string | null;
  gradeLevel: number | null;
  visibility: string;
  isPublished: boolean;
  isFavorite: boolean;
  readingProgress: {
    lastPage: number;
    updatedAt: string;
  } | null;
  createdAt: string;
}

export async function getBookDetail(
  itemId: string
): Promise<BookDetail | null> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return null;

  const supabase = await createServerClient();

  const { data: item } = await supabase
    .from("library_items" as never)
    .select(
      "*, library_categories!left(name_tg), subjects!left(name_tg)" as never
    )
    .eq("id" as never, itemId as never)
    .single();

  if (!item) return null;

  const row = item as Record<string, unknown>;

  const { data: fav } = await supabase
    .from("library_favorites" as never)
    .select("item_id" as never)
    .eq("user_id" as never, user.id)
    .eq("item_id" as never, itemId as never)
    .maybeSingle();

  const { data: history } = await supabase
    .from("library_reading_history" as never)
    .select("last_page, updated_at" as never)
    .eq("user_id" as never, user.id)
    .eq("item_id" as never, itemId as never)
    .maybeSingle();

  const historyRow = history as Record<string, unknown> | null;
  const category = row.library_categories as Record<string, unknown> | null;
  const subject = row.subjects as Record<string, unknown> | null;

  const [signedFileUrl, signedCoverUrl] = await Promise.all([
    getSignedFileUrl(itemId),
    getSignedCoverUrl(itemId),
  ]);

  return {
    id: row.id as string,
    title: row.title as string,
    author: row.author as string | null,
    description: row.description as string | null,
    signedCoverUrl,
    signedFileUrl,
    fileName: row.file_name as string,
    fileSize: row.file_size as number,
    fileType: row.file_type as string,
    categoryId: row.category_id as string | null,
    categoryName: category?.name_tg as string | null,
    subjectId: row.subject_id as string | null,
    subjectName: subject?.name_tg as string | null,
    language: row.language as string,
    publicationYear: row.publication_year as number | null,
    publisher: row.publisher as string | null,
    gradeLevel: row.grade_level as number | null,
    visibility: row.visibility as string,
    isPublished: row.is_published as boolean,
    isFavorite: !!fav,
    readingProgress: historyRow
      ? {
          lastPage: historyRow.last_page as number,
          updatedAt: historyRow.updated_at as string,
        }
      : null,
    createdAt: row.created_at as string,
  };
}

export async function updateReadingProgressAction(
  itemId: string,
  lastPage: number
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return;

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("library_reading_history" as never)
    .select("id" as never)
    .eq("user_id" as never, user.id)
    .eq("item_id" as never, itemId as never)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("library_reading_history" as never)
      .update({
        last_page: lastPage,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id" as never, user.id)
      .eq("item_id" as never, itemId as never);
  } else {
    await supabase.from("library_reading_history" as never).insert({
      user_id: user.id,
      item_id: itemId,
      school_id: user.schoolId,
      last_page: lastPage,
      opened_at: new Date().toISOString(),
    } as never);
  }
}
