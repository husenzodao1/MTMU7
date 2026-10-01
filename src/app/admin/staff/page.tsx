import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Upload, Users } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { STAFF_STATUSES, STAFF_TYPES } from "@/features/admin/people/schemas";
import { fullName } from "@/features/admin/queries";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { ilikeAny, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("staff") };
}

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("staff.view");
  const t = await getTranslations("admin.staff");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["name"], defaultSort: "name", filters: { status: STAFF_STATUSES, type: STAFF_TYPES } });

  const supabase = await createClient();
  let query = supabase
    .from("staff")
    .select("id, first_name, last_name, middle_name, employee_number, staff_type, position, status, user_id, phone", { count: "exact" })
    .eq("school_id", access.school!.id)
    .order("last_name")
    .order("first_name")
    .range(list.offset, list.offset + list.pageSize - 1);
  const search = ilikeAny(["last_name", "first_name", "middle_name", "employee_number", "position"], list.query);
  if (search) query = query.or(search);
  query = list.filters.status ? query.eq("status", list.filters.status) : query.neq("status", "archived");
  if (list.filters.type) query = query.eq("staff_type", list.filters.type);
  const { data, count } = await query;

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {can(access, "staff.create") ? (
              <Link href="/admin/staff/import" className={buttonClasses("secondary")}>
                <Upload aria-hidden />
                {t("import")}
              </Link>
            ) : null}
            {can(access, "staff.create") ? (
              <Link href="/admin/staff/new" className={buttonClasses("primary")}>
                <Plus aria-hidden />
                {t("new")}
              </Link>
            ) : null}
          </>
        }
      />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "type", label: tp("staffType"), options: STAFF_TYPES.map((s) => ({ value: s, label: t(`types.${s}`) })) },
          { name: "status", label: tp("status"), emptyLabel: t("notArchived"), options: STAFF_STATUSES.map((s) => ({ value: s, label: ts(s) })) },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/staff/${r.id}`}
        empty={<EmptyState icon={<Users />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          {
            key: "name",
            header: tp("name"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/staff/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{fullName(r)}</Link>
                {r.employee_number ? <p className="text-xs text-ink-muted">{r.employee_number}</p> : null}
              </div>
            ),
          },
          { key: "type", header: tp("staffType"), cell: (r) => <span>{t(`types.${r.staff_type as (typeof STAFF_TYPES)[number]}`)}{r.position ? <span className="block text-xs text-ink-muted">{r.position}</span> : null}</span> },
          { key: "phone", header: tp("phone"), hideOnMobile: true, cell: (r) => r.phone ?? "—" },
          { key: "status", header: tp("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
          { key: "account", header: t("account"), hideOnMobile: true, cell: (r) => (r.user_id ? <Badge tone="success">{t("accountLinked")}</Badge> : <Badge>{t("accountNone")}</Badge>) },
        ]}
      />
      <Pagination pathname="/admin/staff" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
