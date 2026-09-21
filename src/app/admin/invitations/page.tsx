import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyRound, Plus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions, getSchoolRoles } from "@/features/admin/queries";
import { createInvitationAction, deactivateInvitationAction } from "@/features/admin/users/actions";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SelectField, TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("invitations") };
}

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("invitations.manage");
  const t = await getTranslations("admin.invitations");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", filters: { state: ["usable", "all"] } });
  const schoolId = access.school!.id;
  const supabase = await createClient();

  let query = supabase
    .from("invitation_codes")
    .select("id, code, role_id, max_uses, used_count, expires_at, is_active, person_type, note, created_at, last_used_at, classes(name)", { count: "exact" })
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (list.filters.state !== "all") query = query.eq("is_active", true);
  const [{ data, count }, roles, classes] = await Promise.all([query, getSchoolRoles(schoolId), getClassOptions(schoolId)]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const now = new Date().toISOString();

  const state = (row: NonNullable<typeof data>[number]) =>
    !row.is_active ? "inactive" : row.used_count >= row.max_uses ? "used" : row.expires_at && row.expires_at <= now ? "expired" : "usable";

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <FormDialog action={createInvitationAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} description={t("newHint")} submitLabel={t("create")} size="md">
            <SelectField name="roleId" label={t("role")} required options={roles.filter((r) => r.is_active && r.level > 1).map((r) => ({ value: r.id, label: pickName(r, locale) }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="maxUses" type="number" min={1} max={1000} defaultValue={30} label={t("maxUses")} required />
              <TextField name="validDays" type="number" min={1} max={365} defaultValue={14} label={t("validDays")} required />
            </div>
            <SelectField name="classId" label={t("class")} hint={t("classHint")} placeholder={t("noClass")} options={classes.map(({ value, label }) => ({ value, label }))} />
            <TextField name="note" label={t("note")} maxLength={200} />
          </FormDialog>
        }
      />
      <FilterBar filters={[{ name: "state", label: t("show"), emptyLabel: t("activeOnly"), options: [{ value: "all", label: t("allCodes") }] }]} />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<KeyRound />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          { key: "code", header: t("code"), primary: true, cell: (r) => <span className="font-mono text-base font-semibold tracking-widest">{r.code}</span> },
          {
            key: "role",
            header: t("role"),
            cell: (r) => (
              <span>
                {roleById.get(r.role_id) ? pickName(roleById.get(r.role_id)!, locale) : "—"}
                {r.person_type ? <span className="block text-xs text-ink-muted">{t(`personal.${r.person_type as "student"}`)}</span> : null}
                {(r.classes as { name: string } | null)?.name ? <span className="block text-xs text-ink-muted">{(r.classes as { name: string }).name}</span> : null}
              </span>
            ),
          },
          { key: "uses", header: t("uses"), cell: (r) => <span className="tabular">{r.used_count} / {r.max_uses}</span> },
          { key: "expires", header: t("expires"), hideOnMobile: true, cell: (r) => <span className="text-sm tabular">{r.expires_at ? formatDateTime(r.expires_at, locale, timeZone) : "—"}</span> },
          {
            key: "state",
            header: t("state"),
            cell: (r) => {
              const s = state(r);
              return <Badge tone={s === "usable" ? "success" : s === "expired" || s === "used" ? "warning" : "neutral"}>{t(`states.${s}`)}</Badge>;
            },
          },
          { key: "note", header: t("note"), hideOnMobile: true, cell: (r) => <span className="text-sm text-ink-secondary">{r.note ?? ""}</span> },
        ]}
        actions={(r) => r.is_active ? (
          <ConfirmAction
            action={deactivateInvitationAction}
            fields={{ id: r.id }}
            title={t("deactivateTitle")}
            description={t("deactivateDescription", { code: r.code })}
            confirmLabel={t("deactivate")}
            trigger={<Button variant="ghost" size="sm">{t("deactivate")}</Button>}
          />
        ) : null}
      />
      <Pagination pathname="/admin/invitations" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
