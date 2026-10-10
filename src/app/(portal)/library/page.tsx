import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Library, Settings2 } from "lucide-react";
import { BookGrid, type BookCardItem } from "@/features/library/components";
import { buttonClasses } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filters";
import { TabNav } from "@/components/ui/misc";
import { ListBox, Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { buildQueryString, firstValue, ilikeAny, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

const BOOK_COLUMNS = "id, title, author, cover_url, file_type, publication_year, is_featured, available_quantity, quantity";
const VIEWS = ["catalog", "favorites", "history"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("library") };
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("library");
  if (!can(access, "library.view")) redirect("/access-denied");
  const t = await getTranslations("portal.library");
  const tl = await getTranslations("common.locales");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const viewRaw = firstValue(params.view);
  const view = VIEWS.includes(viewRaw as (typeof VIEWS)[number]) ? (viewRaw as (typeof VIEWS)[number]) : "catalog";
  const list = parseListParams(params, {
    sorts: ["recent", "title", "popular"],
    defaultSort: "recent",
    pageSize: 20,
    filters: { category: "uuid", language: ["tg", "ru", "en"], type: ["pdf", "epub", "audio", "image", "document"] },
  });
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: categoryRows } = await supabase
    .from("library_categories")
    .select("id, name_tg, name_ru, name_en, sort_order")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("sort_order");
  const categories = (categoryRows ?? []).map((c) => ({ value: c.id, label: pickName(c, locale) }));

  let items: BookCardItem[] = [];
  let total = 0;

  if (view === "catalog") {
    let query = supabase
      .from("library_items")
      .select(BOOK_COLUMNS, { count: "exact" })
      .eq("school_id", schoolId)
      .eq("status", "published")
      .range(list.offset, list.offset + list.pageSize - 1);
    const search = ilikeAny(["title", "author", "isbn"], list.query);
    if (search) query = query.or(search);
    if (list.filters.category) query = query.eq("category_id", list.filters.category);
    if (list.filters.language) query = query.eq("language", list.filters.language);
    if (list.filters.type) query = query.eq("file_type", list.filters.type);
    if (list.sort === "title") query = query.order("title");
    else if (list.sort === "popular") query = query.order("view_count", { ascending: false });
    else query = query.order("is_featured", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false });
    const { data, count } = await query;
    items = data ?? [];
    total = count ?? 0;
  } else {
    const table = view === "favorites" ? "library_favorites" : "library_reading_history";
    const orderColumn = view === "favorites" ? "created_at" : "opened_at";
    const { data, count } = await supabase
      .from(table)
      .select(`item_id, library_items!inner(${BOOK_COLUMNS})`, { count: "exact" })
      .eq("user_id", access.userId)
      .order(orderColumn, { ascending: false })
      .range(list.offset, list.offset + list.pageSize - 1);
    items = (data ?? []).map((row) => row.library_items as unknown as BookCardItem);
    total = count ?? 0;
  }

  const tabHref = (v: string) => `/library${buildQueryString({}, { view: v === "catalog" ? null : v })}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={canAny(access, ["library.create", "library.update"]) ? (
          <Link href="/admin/library" className={buttonClasses("secondary")}>
            <Settings2 aria-hidden />
            {t("manage")}
          </Link>
        ) : null}
      />
      <TabNav label={t("views")} items={VIEWS.map((v) => ({ href: tabHref(v), label: t(`view.${v}`), active: v === view }))} />
      {view === "catalog" ? (
        <FilterBar
          searchLabel={t("search")}
          filters={[
            { name: "category", label: t("category"), options: categories },
            { name: "language", label: t("language"), options: ["tg", "ru", "en"].map((l) => ({ value: l, label: tl(l) })) },
            { name: "type", label: t("format"), options: ["pdf", "epub", "audio", "document"].map((f) => ({ value: f, label: t(`fileTypes.${f}`) })) },
            { name: "sort", label: t("sort"), emptyLabel: t("sorts.recent"), options: ["title", "popular"].map((s) => ({ value: s, label: t(`sorts.${s}`) })) },
          ]}
        />
      ) : null}
      <ListBox>
        {items.length === 0 ? (
          <Card as="div">
            <EmptyState icon={<Library />} title={t(`empty.${view}`)} />
          </Card>
        ) : (
          <BookGrid items={items} />
        )}
        <Pagination pathname="/library" searchParams={params} page={list.page} pageSize={list.perPage} total={total} />
      </ListBox>
    </>
  );
}
