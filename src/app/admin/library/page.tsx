import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveLibraryCategoryAction } from "@/features/admin/content/library-actions";
import { FormDialog } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Checkbox } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatNumber } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, ilikeAny, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("library") };
}

export default async function AdminLibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("library.create", "library.update", "library.publish", "library.archive");
  const t = await getTranslations("admin.library");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const view = firstValue(params.view) === "categories" ? "categories" : "books";
  const saved = firstValue(params.saved);
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", filters: { status: ["draft", "published", "archived"], category: "uuid" } });
  const schoolId = access.school!.id;
  const supabase = await createClient();
  const { data: categories } = await supabase.from("library_categories").select("id, name_tg, name_ru, name_en, sort_order, is_active").eq("school_id", schoolId).order("sort_order");

  const tabs = <TabNav label={t("views")} items={[{ href: "/admin/library", label: t("books"), active: view === "books" }, { href: "/admin/library?view=categories", label: t("categories"), active: view === "categories" }]} />;

  if (view === "categories") {
    const fields = (c?: NonNullable<typeof categories>[number]) => (
      <>
        {c ? <input type="hidden" name="id" value={c.id} /> : null}
        <TextField name="nameTg" label={t("nameTg")} defaultValue={c?.name_tg} required maxLength={200} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="nameRu" label={t("nameRu")} defaultValue={c?.name_ru ?? ""} maxLength={200} />
          <TextField name="nameEn" label={t("nameEn")} defaultValue={c?.name_en ?? ""} maxLength={200} />
        </div>
        <TextField name="sortOrder" type="number" min={0} label={t("order")} defaultValue={c?.sort_order ?? 0} />
        {c ? <Checkbox name="isActive" defaultChecked={c.is_active} label={t("categoryActive")} /> : null}
      </>
    );
    return (
      <>
        <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
        {tabs}
        <Card>
          <CardHeader title={t("categories")} actions={can(access, "library.update") ? <FormDialog action={saveLibraryCategoryAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newCategory")}</Button>} title={t("newCategory")} submitLabel={tc("create")}>{fields()}</FormDialog> : null} />
          <CardBody className="p-0">
            {(categories ?? []).length === 0 ? <EmptyState title={t("noCategories")} /> : (
              <ul className="divide-y divide-line">
                {(categories ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <span className="font-medium">{pickName(c, locale)}</span>
                    <span className="flex items-center gap-2">
                      {!c.is_active ? <Badge>{ts("inactive")}</Badge> : null}
                      {can(access, "library.update") ? <FormDialog action={saveLibraryCategoryAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editCategory", { name: pickName(c, locale) })}><Pencil aria-hidden /></Button>} title={t("editCategoryTitle")} submitLabel={tc("save")}>{fields(c)}</FormDialog> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </>
    );
  }

  let query = supabase
    .from("library_items")
    .select("id, title, author, status, visibility, file_type, quantity, available_quantity, view_count, category_id, is_featured", { count: "exact" })
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  const search = ilikeAny(["title", "author", "isbn"], list.query);
  if (search) query = query.or(search);
  if (list.filters.status) query = query.eq("status", list.filters.status);
  if (list.filters.category) query = query.eq("category_id", list.filters.category);
  const { data, count } = await query;
  const categoryName = new Map((categories ?? []).map((c) => [c.id, pickName(c, locale)]));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={can(access, "library.create") ? <Link href="/admin/library/new" className={buttonClasses("primary")}><Plus aria-hidden />{t("new")}</Link> : null}
      />
      {saved === "deleted" ? <Alert tone="success" className="mb-4">{tc("deleted")}</Alert> : null}
      {tabs}
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "status", label: t("status"), options: ["draft", "published", "archived"].map((s) => ({ value: s, label: ts(s as "draft") })) },
          { name: "category", label: t("category"), options: (categories ?? []).map((c) => ({ value: c.id, label: pickName(c, locale) })) },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/library/${r.id}`}
        empty={<EmptyState icon={<BookOpen />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          {
            key: "title",
            header: t("titleField"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/library/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{r.title}</Link>
                <p className="text-xs text-ink-muted">{[r.author, r.category_id ? categoryName.get(r.category_id) : null].filter(Boolean).join(" · ")}</p>
              </div>
            ),
          },
          { key: "format", header: t("format"), cell: (r) => (r.file_type ? <Badge tone="brand">{r.file_type.toUpperCase()}</Badge> : <Badge>{t("printOnly")}</Badge>) },
          { key: "copies", header: t("copies"), hideOnMobile: true, cell: (r) => <span className="tabular">{r.quantity > 0 ? `${r.available_quantity} / ${r.quantity}` : "—"}</span> },
          { key: "views", header: t("viewCount"), hideOnMobile: true, cell: (r) => <span className="tabular">{formatNumber(r.view_count, locale)}</span> },
          { key: "status", header: t("status"), cell: (r) => <span className="flex flex-wrap gap-1"><StatusBadge status={r.status} label={ts(r.status as "draft")} />{r.is_featured ? <Badge tone="brand">{t("featured")}</Badge> : null}</span> },
        ]}
        actions={(r) => (canAny(access, ["library.update", "library.publish"]) ? <Link href={`/admin/library/${r.id}`} className={buttonClasses("ghost", "sm")}>{tc("edit")}</Link> : null)}
      />
      <Pagination pathname="/admin/library" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
