import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookMarked, FileSpreadsheet, Pencil, Plus } from "lucide-react";
import { saveSubjectAction, setSubjectActiveAction } from "@/features/admin/academic/structure-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, ilikeAny, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("subjects") };
}

export default async function AdminSubjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("subjects.manage");
  const t = await getTranslations("admin.subjects");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const archived = firstValue(params.archived) === "1";
  const query = (firstValue(params.q) ?? "").slice(0, 100);
  const supabase = await createClient();

  let request = supabase
    .from("subjects")
    .select("id, name_tg, name_ru, name_en, code, default_weekly_hours, is_active, class_subjects(id, is_active)")
    .eq("school_id", access.school!.id)
    .eq("is_active", !archived)
    .order("name_tg");
  const search = ilikeAny(["name_tg", "name_ru", "name_en", "code"], query);
  if (search) request = request.or(search);
  const { data } = await request;

  const fields = (subject?: { id: string; name_tg: string; name_ru: string | null; name_en: string | null; code: string | null; default_weekly_hours: number | null }) => (
    <>
      {subject ? <input type="hidden" name="id" value={subject.id} /> : null}
      <TextField name="nameTg" label={t("nameTg")} defaultValue={subject?.name_tg} required maxLength={200} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="nameRu" label={t("nameRu")} defaultValue={subject?.name_ru ?? ""} maxLength={200} />
        <TextField name="nameEn" label={t("nameEn")} defaultValue={subject?.name_en ?? ""} maxLength={200} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="code" label={t("code")} hint={t("codeHint")} defaultValue={subject?.code ?? ""} maxLength={20} />
        <TextField name="defaultWeeklyHours" inputMode="decimal" label={t("defaultHours")} defaultValue={subject?.default_weekly_hours ?? ""} />
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Link href="/admin/subjects/import" className={buttonClasses("secondary")}>
              <FileSpreadsheet aria-hidden />
              {t("import")}
            </Link>
            <FormDialog action={saveSubjectAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} submitLabel={tc("create")} size="md">
              {fields()}
            </FormDialog>
          </>
        }
      />
      <FilterBar searchLabel={t("search")} filters={[{ name: "archived", label: t("show"), emptyLabel: t("active"), options: [{ value: "1", label: t("archived") }] }]} />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<BookMarked />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          { key: "name", header: t("name"), primary: true, cell: (r) => <span className="font-medium">{pickName(r, locale)}</span> },
          { key: "code", header: t("code"), cell: (r) => (r.code ? <Badge>{r.code}</Badge> : "—") },
          { key: "hours", header: t("defaultHours"), hideOnMobile: true, cell: (r) => <span className="tabular">{r.default_weekly_hours ?? "—"}</span> },
          { key: "classes", header: t("usedIn"), cell: (r) => <span className="tabular">{((r.class_subjects ?? []) as Array<{ is_active: boolean }>).filter((c) => c.is_active).length}</span> },
        ]}
        actions={(r) => (
          <span className="flex justify-end gap-1">
            <FormDialog action={saveSubjectAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("edit", { name: pickName(r, locale) })}><Pencil aria-hidden /></Button>} title={t("editTitle")} submitLabel={tc("save")} size="md">
              {fields(r)}
            </FormDialog>
            <ConfirmAction
              action={setSubjectActiveAction}
              fields={{ id: r.id, active: r.is_active ? "false" : "true" }}
              title={r.is_active ? t("archiveTitle") : t("restoreTitle")}
              description={r.is_active ? t("archiveDescription") : undefined}
              confirmLabel={r.is_active ? tc("archive") : tc("restore")}
              tone={r.is_active ? "danger" : "primary"}
              trigger={<Button variant="ghost" size="sm">{r.is_active ? tc("archive") : tc("restore")}</Button>}
            />
          </span>
        )}
      />
    </>
  );
}
