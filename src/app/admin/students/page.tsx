import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, GraduationCap, Plus, Upload } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName, getClassOptions } from "@/features/admin/queries";
import { STUDENT_STATUSES } from "@/features/admin/people/schemas";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { buildQueryString, ilikeAny, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("students") };
}

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("students.view");
  const t = await getTranslations("admin.students");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const tg = await getTranslations("common.genders");
  const params = await searchParams;
  const schoolId = access.school!.id;
  const classes = await getClassOptions(schoolId);
  const list = parseListParams(params, {
    sorts: ["name", "recent"],
    defaultSort: "name",
    filters: { status: STUDENT_STATUSES, class: "any", gender: ["male", "female"], account: ["linked", "none"] },
  });
  const classFilter = list.filters.class === "none" || classes.some((c) => c.value === list.filters.class) ? list.filters.class : undefined;

  const supabase = await createClient();
  const enrollmentEmbed = classFilter && classFilter !== "none" ? "enrollments!inner" : "enrollments";
  let query = supabase
    .from("students")
    .select(`id, first_name, last_name, middle_name, student_number, status, gender, user_id, ${enrollmentEmbed}(status, class_id, classes(name))`, { count: "exact" })
    .eq("school_id", schoolId)
    .eq("enrollments.status", "active")
    .range(list.offset, list.offset + list.pageSize - 1);
  const search = ilikeAny(["last_name", "first_name", "middle_name", "student_number"], list.query);
  if (search) query = query.or(search);
  query = list.filters.status ? query.eq("status", list.filters.status) : query.neq("status", "archived");
  if (list.filters.gender) query = query.eq("gender", list.filters.gender);
  if (list.filters.account === "linked") query = query.not("user_id", "is", null);
  if (list.filters.account === "none") query = query.is("user_id", null);
  if (classFilter === "none") query = query.is("enrollments", null);
  else if (classFilter) query = query.eq("enrollments.class_id", classFilter);
  query = list.sort === "recent" ? query.order("created_at", { ascending: false }) : query.order("last_name").order("first_name");
  const { data, count, error } = await query;

  type Row = NonNullable<typeof data>[number];
  const className = (row: Row) => {
    const active = (row.enrollments as unknown as Array<{ classes: { name: string } | null }> | null) ?? [];
    return active[0]?.classes?.name ?? null;
  };

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {can(access, "reports.export") ? (
              <a href={`/admin/students/export${buildQueryString(params, { page: null })}`} className={buttonClasses("ghost")}>
                <Download aria-hidden />
                {t("export")}
              </a>
            ) : null}
            {can(access, "students.import") ? (
              <Link href="/admin/students/import" className={buttonClasses("secondary")}>
                <Upload aria-hidden />
                {t("import")}
              </Link>
            ) : null}
            {can(access, "students.create") ? (
              <Link href="/admin/students/new" className={buttonClasses("primary")}>
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
          { name: "status", label: tp("status"), emptyLabel: t("notArchived"), options: STUDENT_STATUSES.map((s) => ({ value: s, label: ts(s) })) },
          { name: "class", label: tp("class"), options: [{ value: "none", label: t("withoutClass") }, ...classes] },
          { name: "gender", label: tp("gender"), options: [{ value: "male", label: tg("male") }, { value: "female", label: tg("female") }] },
          { name: "account", label: t("account"), options: [{ value: "linked", label: t("accountLinked") }, { value: "none", label: t("accountNone") }] },
          { name: "sort", label: t("sort"), emptyLabel: t("sortName"), options: [{ value: "recent", label: t("sortRecent") }] },
        ]}
      />
      {error ? <p className="mb-3 text-sm text-danger-700" role="alert">{t("loadError")}</p> : null}
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/students/${r.id}`}
        empty={<EmptyState icon={<GraduationCap />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          {
            key: "name",
            header: tp("name"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/students/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{fullName(r)}</Link>
                {r.student_number ? <p className="text-xs text-ink-muted">{r.student_number}</p> : null}
              </div>
            ),
          },
          { key: "class", header: tp("class"), cell: (r) => className(r) ?? <span className="text-ink-muted">{t("withoutClass")}</span> },
          { key: "status", header: tp("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status)} /> },
          { key: "account", header: t("account"), hideOnMobile: true, cell: (r) => (r.user_id ? <Badge tone="success">{t("accountLinked")}</Badge> : <Badge>{t("accountNone")}</Badge>) },
        ]}
      />
      <Pagination pathname="/admin/students" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
