import { getTranslations } from "next-intl/server";
import { Search, BookOpen, Heart, Clock } from "lucide-react";
import Link from "next/link";
import { getCategories, getLibraryItems } from "./actions";
import { CategoryNav } from "./category-nav";
import { BookCard } from "./book-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-6 animate-in pb-8">
      {/* Header with Title & Quick Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
            {t("title")}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-neutral-500 mt-0.5">
            {t("subtitle") || "Digital Knowledge Hub"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/library/favorites" className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-rose-500" />
              <span>{t("favorites")}</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link href="/library/history" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary-600" />
              <span>{t("readingHistory")}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Pill Search Input */}
      <form className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          name="search"
          defaultValue={search ?? ""}
          placeholder={t("search")}
          className="h-12 w-full rounded-full border border-neutral-200/80 bg-white/90 py-2 pl-11 pr-5 text-sm text-neutral-900 shadow-2xs outline-none transition-all duration-[var(--duration-fast)] focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 placeholder:text-neutral-400"
        />
        {categoryId && (
          <input type="hidden" name="category" value={categoryId} />
        )}
      </form>

      {/* Category Pills Navigation */}
      <CategoryNav categories={categories} activeCategoryId={categoryId} />

      {/* Books Grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <BookCard key={item.id} item={item} />
          ))}
        </div>
      ) : search ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title={t("noResults")}
          description={t("noResultsDesc")}
        />
      ) : (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title={t("noBooks")}
          description={t("noBooksDesc")}
        />
      )}
    </div>
  );
}
