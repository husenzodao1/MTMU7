"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { CategoryItem } from "./actions";

interface CategoryNavProps {
  categories: CategoryItem[];
  activeCategoryId?: string;
}

export function CategoryNav({ categories, activeCategoryId }: CategoryNavProps) {
  const t = useTranslations("library");

  const topLevel = categories.filter((c) => !c.parentId);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      <Link
        href="/library"
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
          !activeCategoryId
            ? "bg-primary-600 text-white"
            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
        )}
      >
        {t("allCategories")}
      </Link>
      {topLevel.map((cat) => (
        <Link
          key={cat.id}
          href={`/library?category=${cat.id}`}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
            activeCategoryId === cat.id
              ? "bg-primary-600 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          )}
        >
          {cat.nameTg}
        </Link>
      ))}
    </nav>
  );
}
