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
    <nav className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none select-none">
      <Link
        href="/library"
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-4.5 py-2 text-xs font-bold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale",
          !activeCategoryId
            ? "bg-neutral-900 text-white shadow-xs font-bold"
            : "border border-neutral-200/80 bg-white/80 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        )}
      >
        {t("allCategories")}
      </Link>
      {topLevel.map((cat) => (
        <Link
          key={cat.id}
          href={`/library?category=${cat.id}`}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-4.5 py-2 text-xs font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale",
            activeCategoryId === cat.id
              ? "bg-neutral-900 text-white shadow-xs font-bold"
              : "border border-neutral-200/80 bg-white/80 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          )}
        >
          {cat.nameTg}
        </Link>
      ))}
    </nav>
  );
}
