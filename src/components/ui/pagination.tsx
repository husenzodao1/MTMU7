import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LoadMore } from "@/components/ui/load-more";
import { buildQueryString, MAX_PAGES, type SearchParams } from "@/lib/list-params";

/**
 * Where a list ends. There are no "previous" and "next" pages any more: a
 * list shows its first rows, and scrolling to the end of it brings the next
 * ones in (LoadMore) — page n of the URL now means "the first n pages".
 * `pageSize` is one page's worth.
 */
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
  if (total === 0) return null;
  const shown = Math.min(total, page * pageSize);
  const more = shown < total && page < MAX_PAGES;
  return (
    <nav aria-label={t("label")} className="list-end">
      {more ? (
        <LoadMore href={`${pathname}${buildQueryString(searchParams, { page: page + 1 })}`} label={t("more")} />
      ) : null}
      <p className="pb-1 text-center text-[0.6875rem] text-ink-muted tabular">{t("shown", { shown, total })}</p>
    </nav>
  );
}

/**
 * A list's own box: on a computer it scrolls inside itself, so loading more
 * rows never pushes the footer away or shifts the rest of the page, and at its
 * ends the scroll carries on with the page; on a phone the list is simply part
 * of the page (globals.css, .list-box). The list and its Pagination go inside.
 */
export function ListBox({ children }: { children: ReactNode }) {
  return <div className="list-box">{children}</div>;
}
