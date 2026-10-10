import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { FileText, FolderPlus, History, Pencil, Upload } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveDocumentAction, saveFolderAction, setDocumentStatusAction } from "@/features/admin/content/document-actions";
import { getSchoolRoles } from "@/features/admin/queries";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORIES } from "@/features/content/constants";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DirectUpload } from "@/components/ui/direct-upload";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Checkbox } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { ListBox, Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { formatBytes } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("documents") };
}

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("documents.create", "documents.publish");
  const t = await getTranslations("admin.documents");
  const tpd = await getTranslations("portal.documents.categories");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const schoolId = access.school!.id;
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", filters: { status: ["draft", "published", "archived"], category: DOCUMENT_CATEGORIES, folder: "uuid" } });
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select("id, title, description, category, folder_id, access, allowed_roles, status, current_version, file_name, size_bytes, updated_at, document_versions(id, version, file_name, size_bytes, created_at)", { count: "exact" })
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (list.filters.status) query = query.eq("status", list.filters.status);
  else query = query.neq("status", "archived");
  if (list.filters.category) query = query.eq("category", list.filters.category);
  if (list.filters.folder) query = query.eq("folder_id", list.filters.folder);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  const [{ data, count }, { data: folders }, roles] = await Promise.all([
    query,
    supabase.from("document_folders").select("id, name").eq("school_id", schoolId).order("name"),
    getSchoolRoles(schoolId),
  ]);
  const folderOptions = (folders ?? []).map((f) => ({ value: f.id, label: f.name }));
  const folderName = new Map((folders ?? []).map((f) => [f.id, f.name]));
  const canPublish = can(access, "documents.publish");

  const fields = (d?: NonNullable<typeof data>[number]) => (
    <>
      {d ? <input type="hidden" name="id" value={d.id} /> : null}
      <TextField name="title" label={t("titleField")} defaultValue={d?.title} required maxLength={300} />
      <TextAreaField name="description" label={t("descriptionField")} defaultValue={d?.description ?? ""} rows={3} maxLength={5000} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField name="category" label={t("category")} defaultValue={d?.category ?? "other"} options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: tpd(c) }))} />
        <SelectField name="folderId" label={t("folder")} defaultValue={d?.folder_id ?? ""} placeholder={t("noFolder")} options={folderOptions} />
        <SelectField name="access" label={t("access")} defaultValue={d?.access ?? "school"} options={DOCUMENT_ACCESS.map((a) => ({ value: a, label: t(`accessOptions.${a}`) }))} />
        <SelectField name="status" label={t("status")} defaultValue={d?.status === "published" ? "published" : "draft"} options={[{ value: "draft", label: ts("draft") }, ...(canPublish ? [{ value: "published", label: ts("published") }] : [])]} />
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{t("allowedRoles")}</legend>
        <p className="text-xs text-ink-muted">{t("allowedRolesHint")}</p>
        <div className="grid grid-cols-2">
          {roles.filter((r) => r.is_active).map((r) => <Checkbox key={r.id} name="allowedRoles" value={r.slug} defaultChecked={d?.allowed_roles.includes(r.slug)} label={pickName(r, locale)} />)}
        </div>
      </fieldset>
      <DirectUpload kind="document" folder={`${schoolId}/docs`} name="file" label={d ? t("newVersion") : t("file")} hint={d ? t("newVersionHint") : undefined} />
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
            <FormDialog action={saveFolderAction} trigger={<Button variant="secondary"><FolderPlus aria-hidden />{t("newFolder")}</Button>} title={t("newFolder")} submitLabel={tc("create")}>
              <TextField name="name" label={t("folderName")} required maxLength={200} />
            </FormDialog>
            <FormDialog action={saveDocumentAction} trigger={<Button><Upload aria-hidden />{t("upload")}</Button>} title={t("upload")} submitLabel={t("uploadSubmit")} size="lg">
              {fields()}
            </FormDialog>
          </>
        }
      />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "status", label: t("status"), emptyLabel: t("notArchived"), options: ["draft", "published", "archived"].map((s) => ({ value: s, label: ts(s as "draft") })) },
          { name: "category", label: t("category"), options: DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: tpd(c) })) },
          { name: "folder", label: t("folder"), options: folderOptions },
        ]}
      />
      <ListBox>
        <DataTable
          caption={t("title")}
          rows={data ?? []}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={<FileText />} title={t("empty")} description={t("emptyHint")} />}
          columns={[
            {
              key: "title",
              header: t("titleField"),
              primary: true,
              cell: (r) => (
                <div>
                  <a href={`/files/documents/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{r.title}</a>
                  <p className="text-xs text-ink-muted">{[tpd(r.category as "other"), r.folder_id ? folderName.get(r.folder_id) : null, `${r.file_name} · ${formatBytes(r.size_bytes)}`].filter(Boolean).join(" · ")}</p>
                </div>
              ),
            },
            { key: "access", header: t("access"), hideOnMobile: true, cell: (r) => <Badge>{t(`accessOptions.${r.access as "school"}`)}</Badge> },
            { key: "version", header: t("version"), hideOnMobile: true, cell: (r) => <span className="tabular">v{r.current_version}</span> },
            { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status as "draft")} /> },
            { key: "updated", header: t("updated"), hideOnMobile: true, cell: (r) => <span className="text-sm tabular">{formatDateTime(r.updated_at, locale, timeZone)}</span> },
          ]}
          actions={(r) => {
            const versions = [...((r.document_versions ?? []) as Array<{ id: string; version: number; file_name: string; size_bytes: number; created_at: string }>)].sort((a, b) => b.version - a.version);
            return (
              <span className="flex justify-end gap-1">
                <FormDialog action={saveDocumentAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editNamed", { name: r.title })}><Pencil aria-hidden /></Button>} title={t("edit")} submitLabel={tc("save")} size="lg">{fields(r)}</FormDialog>
                {versions.length > 1 ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t("versionsNamed", { name: r.title })}><History aria-hidden /></Button>
                    </DialogTrigger>
                    <DialogContent title={t("versions")} description={r.title} closeLabel={tc("close")} size="sm">
                      <ul className="divide-y divide-line text-sm">
                        {versions.map((v) => (
                          <li key={v.id} className="flex justify-between gap-2 py-2">
                            <a href={`/files/document-versions/${v.id}?download=1`} className="text-brand-text hover:underline">v{v.version} · {v.file_name}</a>
                            <span className="text-ink-muted tabular">{formatDateTime(v.created_at, locale, timeZone)}</span>
                          </li>
                        ))}
                      </ul>
                    </DialogContent>
                  </Dialog>
                ) : null}
                {r.status !== "archived" && can(access, "documents.archive") ? (
                  <ConfirmAction action={setDocumentStatusAction} fields={{ id: r.id, status: "archived" }} title={t("archiveTitle")} description={t("archiveDescription")} confirmLabel={tc("archive")} trigger={<Button variant="ghost" size="sm">{tc("archive")}</Button>} />
                ) : null}
                {r.status === "archived" && can(access, "documents.archive") ? (
                  <ConfirmAction action={setDocumentStatusAction} fields={{ id: r.id, status: "draft" }} title={t("restoreTitle")} confirmLabel={tc("restore")} tone="primary" trigger={<Button variant="ghost" size="sm">{tc("restore")}</Button>} />
                ) : null}
              </span>
            );
          }}
        />
        <Pagination pathname="/admin/documents" searchParams={params} page={list.page} pageSize={list.perPage} total={count ?? 0} />
      </ListBox>
    </>
  );
}
