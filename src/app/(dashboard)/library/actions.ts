"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";

const LIBRARY_COVERS_BUCKET = "library-covers";
const SIGNED_URL_EXPIRY = 3600;

export interface CategoryItem {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string;
  parentId: string | null;
  sortOrder: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  categoryId: string | null;
  categoryName: string | null;
  subjectId: string | null;
  language: string;
  publicationYear: number | null;
  publisher: string | null;
  gradeLevel: number | null;
  visibility: string;
  isPublished: boolean;
  isFavorite: boolean;
  createdAt: string;
}

export async function getCategories(): Promise<CategoryItem[]> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("library_categories" as never)
    .select("id, slug, name_tg, name_ru, parent_id, sort_order" as never)
    .eq("is_active" as never, true)
    .order("sort_order" as never, { ascending: true });

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((cat) => ({
    id: cat.id as string,
    slug: cat.slug as string,
    nameTg: cat.name_tg as string,
    nameRu: cat.name_ru as string,
    parentId: cat.parent_id as string | null,
    sortOrder: cat.sort_order as number,
  }));
}

export async function getLibraryItems(
  categoryId?: string,
  search?: string
): Promise<LibraryItem[]> {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return [];

  const supabase = await createServerClient();

  let query = supabase
    .from("library_items" as never)
    .select("*, library_categories!left(name_tg)" as never)
    .eq("is_published" as never, true)
    .order("created_at" as never, { ascending: false });

  if (categoryId) {
    query = query.eq("category_id" as never, categoryId as never);
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `title.ilike.${term},author.ilike.${term},description.ilike.${term}` as never
    );
  }

  const { data } = await query.limit(50);

  if (!data) return [];

  const { data: favorites } = await supabase
    .from("library_favorites" as never)
    .select("item_id" as never)
    .eq("user_id" as never, user.id);

  const favoriteIds = new Set(
    ((favorites as Array<Record<string, unknown>>) ?? []).map(
      (f) => f.item_id as string
    )
  );

  const rows = data as Array<Record<string, unknown>>;
  const coverPaths = rows
    .map((item) => item.cover_url as string | null)
    .filter((p): p is string => !!p);

  let signedCoverMap = new Map<string, string>();
  if (coverPaths.length > 0) {
    const adminClient = createAdminClient();
    const { data: signedUrls } = await adminClient.storage
      .from(LIBRARY_COVERS_BUCKET)
      .createSignedUrls(coverPaths, SIGNED_URL_EXPIRY);

    if (signedUrls) {
      for (const entry of signedUrls) {
        if (entry.signedUrl && entry.path) {
          signedCoverMap.set(entry.path, entry.signedUrl);
        }
      }
    }
  }

  return rows.map((item) => {
    const category = item.library_categories as Record<string, unknown> | null;
    const rawCoverPath = item.cover_url as string | null;
    return {
      id: item.id as string,
      title: item.title as string,
      author: item.author as string | null,
      description: item.description as string | null,
      coverUrl: rawCoverPath ? (signedCoverMap.get(rawCoverPath) ?? null) : null,
      fileName: item.file_name as string,
      fileSize: item.file_size as number,
      fileType: item.file_type as string,
      categoryId: item.category_id as string | null,
      categoryName: category?.name_tg as string | null,
      subjectId: item.subject_id as string | null,
      language: item.language as string,
      publicationYear: item.publication_year as number | null,
      publisher: item.publisher as string | null,
      gradeLevel: item.grade_level as number | null,
      visibility: item.visibility as string,
      isPublished: item.is_published as boolean,
      isFavorite: favoriteIds.has(item.id as string),
      createdAt: item.created_at as string,
    };
  });
}

export async function toggleFavoriteAction(
  itemId: string,
  isFavorite: boolean
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) return;

  const supabase = await createServerClient();

  if (isFavorite) {
    await supabase
      .from("library_favorites" as never)
      .delete()
      .eq("user_id" as never, user.id)
      .eq("item_id" as never, itemId as never);
  } else {
    await supabase.from("library_favorites" as never).insert({
      user_id: user.id,
      item_id: itemId,
      school_id: user.schoolId,
    } as never);
  }
}
