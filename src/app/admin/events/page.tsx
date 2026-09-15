import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveEventAction, setEventStatusAction } from "@/features/admin/content/event-actions";
import { EVENT_AUDIENCES, EVENT_CATEGORIES } from "@/features/content/constants";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Checkbox } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { isoToLocalInput } from "@/lib/i18n/zoned";
import { firstValue, ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("events") };
}

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("events.manage");
  const t = await getTranslations("admin.events");
  const tpe = await getTranslations("portal.events.categories");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const view = firstValue(params.view) === "past" ? "past" : "upcoming";
  const list = parseListParams(params, { sorts: ["date"], defaultSort: "date", filters: { status: ["draft", "published", "cancelled", "archived"], category: EVENT_CATEGORIES } });
  const schoolId = access.school!.id;
  const now = new Date().toISOString();
  const supabase = await createClient();

  let query = supabase
    .from("events")
    .select("id, title, description, category, audience, starts_at, ends_at, all_day, location, organizer, status, image_path", { count: "exact" })
    .eq("school_id", schoolId)
    .range(list.offset, list.offset + list.pageSize - 1);
  query = view === "upcoming" ? query.gte("starts_at", now).order("starts_at") : query.lt("starts_at", now).order("starts_at", { ascending: false });
  if (list.filters.status) query = query.eq("status", list.filters.status);
  if (list.filters.category) query = query.eq("category", list.filters.category);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  const { data, count } = await query;

  const fields = (e?: NonNullable<typeof data>[number]) => (
    <>
      {e ? <input type="hidden" name="id" value={e.id} /> : null}
      <TextField name="title" label={t("titleField")} defaultValue={e?.title} required maxLength={300} />
      <TextAreaField name="description" label={t("descriptionField")} hint={t("descriptionHint")} defaultValue={e?.description ?? ""} rows={4} maxLength={20000} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="category" label={t("category")} defaultValue={e?.category ?? "school"} options={EVENT_CATEGORIES.map((c) => ({ value: c, label: tpe(c) }))} />
        <SelectField name="audience" label={t("audience")} defaultValue={e?.audience ?? "school"} options={EVENT_AUDIENCES.map((a) => ({ value: a, label: t(`audiences.${a}`) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="startsAt" type="datetime-local" label={t("startsAt")} defaultValue={e ? isoToLocalInput(e.starts_at, timeZone) : ""} required />
        <TextField name="endsAt" type="datetime-local" label={t("endsAt")} defaultValue={e ? isoToLocalInput(e.ends_at, timeZone) : ""} />
      </div>
      <Checkbox name="allDay" defaultChecked={e?.all_day} label={t("allDay")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="location" label={t("location")} defaultValue={e?.location ?? ""} maxLength={300} />
        <TextField name="organizer" label={t("organizer")} defaultValue={e?.organizer ?? ""} maxLength={200} />
      </div>
      {e?.image_path ? <Checkbox name="removeImage" label={t("removeImage")} /> : null}
      <DirectUpload kind="image" folder={`${schoolId}/events`} name="image" label={e?.image_path ? t("replaceImage") : t("image")} />
      <SelectField name="status" label={t("status")} defaultValue={e?.status === "published" ? "published" : "draft"} options={[{ value: "draft", label: ts("draft") }, { value: "published", label: ts("published") }]} />
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={<FormDialog action={saveEventAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} submitLabel={tc("create")} size="lg">{fields()}</FormDialog>}
      />
      <TabNav label={t("views")} items={[{ href: "/admin/events", label: t("upcoming"), active: view === "upcoming" }, { href: "/admin/events?view=past", label: t("past"), active: view === "past" }]} />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "status", label: t("status"), options: ["draft", "published", "cancelled", "archived"].map((s) => ({ value: s, label: ts(s as "draft") })) },
          { name: "category", label: t("category"), options: EVENT_CATEGORIES.map((c) => ({ value: c, label: tpe(c) })) },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<CalendarDays />} title={t("empty")} />}
        columns={[
          { key: "title", header: t("titleField"), primary: true, cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-ink-muted">{tpe(r.category as "school")} · {t(`audiences.${r.audience as "school"}`)}</p></div> },
          { key: "when", header: t("startsAt"), cell: (r) => <span className="text-sm tabular">{formatDateTime(r.starts_at, locale, timeZone)}</span> },
          { key: "location", header: t("location"), hideOnMobile: true, cell: (r) => r.location ?? "—" },
          { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status as "draft")} /> },
        ]}
        actions={(r) => (
          <span className="flex justify-end gap-1">
            <FormDialog action={saveEventAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editNamed", { name: r.title })}><Pencil aria-hidden /></Button>} title={t("edit")} submitLabel={tc("save")} size="lg">{fields(r)}</FormDialog>
            {r.status === "published" ? (
              <ConfirmAction action={setEventStatusAction} fields={{ id: r.id, status: "cancelled" }} title={t("cancelTitle")} description={t("cancelDescription")} confirmLabel={t("cancel")} trigger={<Button variant="ghost" size="sm">{t("cancel")}</Button>} />
            ) : null}
            {r.status !== "archived" ? (
              <ConfirmAction action={setEventStatusAction} fields={{ id: r.id, status: "archived" }} title={t("archiveTitle")} confirmLabel={tc("archive")} trigger={<Button variant="ghost" size="sm">{tc("archive")}</Button>} />
            ) : null}
          </span>
        )}
      />
      <Pagination pathname="/admin/events" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
