import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KeyRound, Pencil, Plus, UsersRound } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { saveGuardianAction, setGuardianStatusAction } from "@/features/admin/people/staff-actions";
import { createPersonInvitationAction } from "@/features/admin/people/student-actions";
import { fullName } from "@/features/admin/queries";
import { ActionForm, ConfirmAction, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { ilikeAny, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("guardians") };
}

function GuardianFields({ values, label }: { values?: { last_name: string; first_name: string; middle_name: string | null; phone: string | null; email: string | null; address: string | null }; label: (key: string) => string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="lastName" label={label("lastName")} defaultValue={values?.last_name} required maxLength={100} />
        <TextField name="firstName" label={label("firstName")} defaultValue={values?.first_name} required maxLength={100} />
        <TextField name="middleName" label={label("middleName")} defaultValue={values?.middle_name ?? ""} maxLength={100} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="phone" type="tel" label={label("phone")} defaultValue={values?.phone ?? ""} maxLength={50} />
        <TextField name="email" type="email" label={label("email")} defaultValue={values?.email ?? ""} maxLength={255} />
      </div>
      <TextField name="address" label={label("address")} defaultValue={values?.address ?? ""} maxLength={500} />
    </>
  );
}

export default async function AdminGuardiansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("guardians.view", "guardians.manage");
  const t = await getTranslations("admin.guardians");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const tStudents = await getTranslations("admin.students");
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["name"], defaultSort: "name", filters: { status: ["active", "archived"], account: ["linked", "none"] } });
  const manage = can(access, "guardians.manage");

  const supabase = await createClient();
  let query = supabase
    .from("guardians")
    .select("id, first_name, last_name, middle_name, phone, email, address, status, user_id, student_guardians(relationship, students(id, first_name, last_name))", { count: "exact" })
    .eq("school_id", access.school!.id)
    .eq("status", list.filters.status ?? "active")
    .order("last_name")
    .order("first_name")
    .range(list.offset, list.offset + list.pageSize - 1);
  const search = ilikeAny(["last_name", "first_name", "middle_name", "phone", "email"], list.query);
  if (search) query = query.or(search);
  if (list.filters.account === "linked") query = query.not("user_id", "is", null);
  if (list.filters.account === "none") query = query.is("user_id", null);
  const [{ data, count }, { data: codes }] = await Promise.all([
    query,
    can(access, "invitations.manage")
      ? supabase.from("invitation_codes").select("person_id, code, used_count, max_uses, expires_at, is_active").eq("person_type", "guardian").eq("is_active", true)
      : Promise.resolve({ data: [] }),
  ]);
  const now = new Date().toISOString();
  const codeFor = new Map((codes ?? []).filter((c) => c.used_count < c.max_uses && (!c.expires_at || c.expires_at > now)).map((c) => [c.person_id, c.code]));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={manage ? (
          <FormDialog action={saveGuardianAction} trigger={<Button><Plus aria-hidden />{t("new")}</Button>} title={t("new")} description={t("newHint")} submitLabel={tp("save")} size="md">
            <GuardianFields label={tp} />
          </FormDialog>
        ) : null}
      />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "status", label: tp("status"), emptyLabel: ts("active"), options: [{ value: "archived", label: ts("archived") }] },
          { name: "account", label: tStudents("account"), options: [{ value: "linked", label: tStudents("accountLinked") }, { value: "none", label: tStudents("accountNone") }] },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<UsersRound />} title={t("empty")} />}
        columns={[
          { key: "name", header: tp("name"), primary: true, cell: (r) => <span className="font-medium">{fullName(r)}</span> },
          { key: "contact", header: tp("contact"), cell: (r) => <span className="text-sm">{[r.phone, r.email].filter(Boolean).join(" · ") || "—"}</span> },
          {
            key: "children",
            header: t("children"),
            cell: (r) => {
              const links = (r.student_guardians ?? []) as unknown as Array<{ students: { id: string; first_name: string; last_name: string } | null }>;
              return links.length === 0 ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {links.map((l) => l.students ? (
                    <Link key={l.students.id} href={`/admin/students/${l.students.id}`} className="text-sm text-brand-700 hover:underline">{l.students.last_name} {l.students.first_name}</Link>
                  ) : null)}
                </span>
              );
            },
          },
          {
            key: "account",
            header: tStudents("account"),
            hideOnMobile: true,
            cell: (r) => r.user_id ? <Badge tone="success">{tStudents("accountLinked")}</Badge> : codeFor.get(r.id) ? <span className="font-mono text-sm tracking-wider">{codeFor.get(r.id)}</span> : <Badge>{tStudents("accountNone")}</Badge>,
          },
          { key: "status", header: tp("status"), hideOnMobile: true, cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
        ]}
        actions={(r) => (
          <span className="flex flex-wrap justify-end gap-1">
            {manage ? (
              <FormDialog action={saveGuardianAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editNamed", { name: fullName(r) })}><Pencil aria-hidden /></Button>} title={t("edit")} submitLabel={tp("save")} size="md">
                <input type="hidden" name="id" value={r.id} />
                <GuardianFields label={tp} values={r} />
              </FormDialog>
            ) : null}
            {can(access, "invitations.manage") && !r.user_id && !codeFor.get(r.id) && r.status === "active" ? (
              <ActionForm action={createPersonInvitationAction}>
                <input type="hidden" name="personType" value="guardian" />
                <input type="hidden" name="personId" value={r.id} />
                <input type="hidden" name="roleSlug" value="parent" />
                <input type="hidden" name="returnTo" value="/admin/guardians" />
                <SubmitButton variant="ghost" size="icon-sm" aria-label={t("inviteNamed", { name: fullName(r) })}><KeyRound aria-hidden /></SubmitButton>
              </ActionForm>
            ) : null}
            {manage ? (
              <ConfirmAction
                action={setGuardianStatusAction}
                fields={{ id: r.id, status: r.status === "active" ? "archived" : "active" }}
                title={r.status === "active" ? t("archiveTitle") : t("restoreTitle")}
                description={r.status === "active" ? t("archiveDescription") : undefined}
                confirmLabel={r.status === "active" ? tp("archive") : tp("restore")}
                tone={r.status === "active" ? "danger" : "primary"}
                trigger={<Button variant="ghost" size="sm">{r.status === "active" ? tp("archive") : tp("restore")}</Button>}
              />
            ) : null}
          </span>
        )}
      />
      <Pagination pathname="/admin/guardians" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
