import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Heart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BookCard } from "../book-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { LibraryItem } from "../actions";

export default async function FavoritesPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) redirect("/library");

  const t = await getTranslations("library");
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("library_favorites" as never)
    .select("item_id, library_items!inner(*, library_categories!left(name_tg))" as never)
    .eq("user_id" as never, user.id)
    .order("created_at" as never, { ascending: false });

  const items: LibraryItem[] = ((data as Array<Record<string, unknown>>) ?? []).map((fav) => {
    const item = fav.library_items as Record<string, unknown>;
    const category = item.library_categories as Record<string, unknown> | null;
    return {
      id: item.id as string,
      title: item.title as string,
      author: item.author as string | null,
      description: item.description as string | null,
      coverUrl: item.cover_url as string | null,
      fileUrl: item.file_url as string,
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
      isFavorite: true,
      createdAt: item.created_at as string,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          {t("favorites")}
        </h1>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <BookCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart className="h-12 w-12" />}
          title={t("noFavorites")}
          description={t("noFavoritesDesc")}
        />
      )}
    </div>
  );
}
