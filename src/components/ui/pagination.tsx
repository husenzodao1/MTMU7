import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buildQueryString, type SearchParams } from "@/lib/list-params";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export async function Pagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: SearchParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = await getTranslations("common.pagination");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => `${pathname}${buildQueryString(searchParams, { page: p === 1 ? null : p })}`;

  return (
    <nav aria-label={t("label")} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted tabular">{t("range", { from, to, total })}</p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClasses("secondary", "sm")} rel="prev">
            <ChevronLeft aria-hidden />
            {t("previous")}
          </Link>
        ) : (
          <span className={cn(buttonClasses("secondary", "sm"), "pointer-events-none opacity-50")} aria-disabled>
            <ChevronLeft aria-hidden />
            {t("previous")}
          </span>
        )}
        <span className="text-sm text-ink-secondary tabular" aria-current="page">
          {t("page", { page, pages })}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClasses("secondary", "sm")} rel="next">
            {t("next")}
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={cn(buttonClasses("secondary", "sm"), "pointer-events-none opacity-50")} aria-disabled>
            {t("next")}
            <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
