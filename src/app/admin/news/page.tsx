import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Newspaper, Pencil, Plus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveNewsCategoryAction } from "@/features/news/actions";
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
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { buildQueryString, firstValue, ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("news") };
}

const VIEWS = ["all", "review", "draft", "scheduled", "published", "archived", "categories"] as const;

export default async function AdminNewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("news.publish", "news.update", "news.archive");
  const t = await getTranslations("admin.news");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const statusRaw = firstValue(params.status);
  const view = VIEWS.includes(statusRaw as (typeof VIEWS)[number]) ? (statusRaw as (typeof VIEWS)[number]) : "all";
  const saved = firstValue(params.saved);
  const list = parseListParams(params, { sorts: ["updated"], defaultSort: "updated", filters: { category: "uuid" } });
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: categories } = await supabase.from("news_categories").select("id, name_tg, name_ru, name_en, sort_order, is_active").eq("school_id", schoolId).order("sort_order");
  const categoryName = new Map((categories ?? []).map((c) => [c.id, pickName(c, locale)]));
  const tabs = <TabNav label={t("views")} items={VIEWS.map((v) => ({ href: `/admin/news${buildQueryString({}, { status: v === "all" ? null : v })}`, label: t(`view.${v}`), active: v === view }))} />;

  if (view === "categories") {
    const fields = (c?: NonNullable<typeof categories>[number]) => (
      <>
        {c ? <input type="hidden" name="id" value={c.id} /> : null}
        <TextField name="nameTg" label={t("nameTg")} defaultValue={c?.name_tg} required maxLength={100} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="nameRu" label={t("nameRu")} defaultValue={c?.name_ru ?? ""} maxLength={100} />
          <TextField name="nameEn" label={t("nameEn")} defaultValue={c?.name_en ?? ""} maxLength={100} />
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
          <CardHeader title={t("categories")} actions={<FormDialog action={saveNewsCategoryAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newCategory")}</Button>} title={t("newCategory")} submitLabel={tc("create")}>{fields()}</FormDialog>} />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <span className="font-medium">{pickName(c, locale)}</span>
                  <span className="flex items-center gap-2">
                    {!c.is_active ? <Badge>{ts("inactive")}</Badge> : null}
                    <FormDialog action={saveNewsCategoryAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editCategory", { name: pickName(c, locale) })}><Pencil aria-hidden /></Button>} title={t("editCategoryTitle")} submitLabel={tc("save")}>{fields(c)}</FormDialog>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </>
    );
  }

  const now = new Date().toISOString();
  let query = supabase
    .from("news_articles")
    .select("id, slug, title, status, publish_at, updated_at, view_count, category_id, is_featured, author:author_id(first_name, last_name)", { count: "exact" })
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (view === "scheduled") query = query.eq("status", "published").gt("publish_at", now);
  else if (view === "published") query = query.eq("status", "published").or(`publish_at.is.null,publish_at.lte.${now}`);
  else if (view !== "all") query = query.eq("status", view);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  if (list.filters.category) query = query.eq("category_id", list.filters.category);
  const { data, count } = await query;

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={<Link href="/admin/news/new" className={buttonClasses("primary")}><Plus aria-hidden />{t("new")}</Link>}
      />
      {saved ? <Alert tone="success" className="mb-4">{t.has(`saved.${saved}`) ? t(`saved.${saved}`) : tc("saved")}</Alert> : null}
      {tabs}
      <FilterBar searchLabel={t("search")} filters={[{ name: "category", label: t("category"), options: (categories ?? []).map((c) => ({ value: c.id, label: pickName(c, locale) })) }]} />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<Newspaper />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          {
            key: "title",
            header: t("articleTitle"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/news/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{r.title}</Link>
                <p className="text-xs text-ink-muted">
                  {(r.author as unknown as { first_name: string; last_name: string } | null) ? `${(r.author as unknown as { last_name: string }).last_name} ${(r.author as unknown as { first_name: string }).first_name}` : ""}
                  {r.category_id && categoryName.get(r.category_id) ? ` · ${categoryName.get(r.category_id)}` : ""}
                </p>
              </div>
            ),
          },
          {
            key: "status",
            header: t("status"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status === "published" && r.publish_at && r.publish_at > now ? "scheduled" : r.status} label={r.status === "published" && r.publish_at && r.publish_at > now ? ts("scheduled") : ts(r.status as "draft")} />
                {r.is_featured ? <Badge tone="brand">{t("featured")}</Badge> : null}
              </span>
            ),
          },
          { key: "publish", header: t("publishAt"), hideOnMobile: true, cell: (r) => <span className="text-sm tabular">{r.publish_at ? formatDateTime(r.publish_at, locale, timeZone) : "—"}</span> },
          { key: "views", header: t("viewCount"), hideOnMobile: true, cell: (r) => <span className="tabular">{formatNumber(r.view_count, locale)}</span> },
        ]}
        actions={(r) => (r.status === "published" && can(access, "news.view") ? <Link href={`/news/${r.slug}`} className={buttonClasses("ghost", "sm")}>{t("openArticle")}</Link> : null)}
      />
      <Pagination pathname="/admin/news" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
