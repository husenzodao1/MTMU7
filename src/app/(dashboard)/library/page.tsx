import { getTranslations } from "next-intl/server";
import { Search, BookOpen, Heart, Clock } from "lucide-react";
import Link from "next/link";
import { getCategories, getLibraryItems } from "./actions";
import { CategoryNav } from "./category-nav";
import { BookCard } from "./book-card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("library");

  const categoryId =
    typeof params.category === "string" ? params.category : undefined;
  const search =
    typeof params.search === "string" ? params.search : undefined;

  const [categories, items] = await Promise.all([
    getCategories(),
    getLibraryItems(categoryId, search),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {t("title")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/library/favorites"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">{t("favorites")}</span>
          </Link>
          <Link
            href="/library/history"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">{t("readingHistory")}</span>
          </Link>
        </div>
      </div>

      <form className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder={t("search")}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:bg-white"
        />
        {categoryId && (
          <input type="hidden" name="category" value={categoryId} />
        )}
      </form>

      <CategoryNav categories={categories} activeCategoryId={categoryId} />

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <BookCard key={item.id} item={item} />
          ))}
        </div>
      ) : search ? (
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title={t("noResults")}
          description={t("noResultsDesc")}
        />
      ) : (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title={t("noBooks")}
          description={t("noBooksDesc")}
        />
      )}
    </div>
  );
}
