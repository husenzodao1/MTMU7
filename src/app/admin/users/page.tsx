import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { UserCog } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getSchoolRoles } from "@/features/admin/queries";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Avatar } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Alert, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

const USER_STATUSES = ["active", "pending", "blocked", "graduated", "rejected"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("users") };
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("users.view");
  const t = await getTranslations("admin.users");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const roles = await getSchoolRoles(access.school!.id);
  const list = parseListParams(params, {
    sorts: ["created_desc", "created_asc", "name_asc", "name_desc"],
    defaultSort: "created_desc",
    filters: { status: USER_STATUSES, role: roles.map((r) => r.slug) },
  });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_users", {
    p_query: list.query || undefined,
    p_role: list.filters.role,
    p_status: list.filters.status,
    p_sort: list.sort,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "role", label: t("role"), options: roles.map((r) => ({ value: r.slug, label: pickName(r, locale) })) },
          { name: "status", label: tp("status"), options: USER_STATUSES.map((s) => ({ value: s, label: ts(s) })) },
          { name: "sort", label: t("sort"), emptyLabel: t("sorts.created_desc"), options: (["created_asc", "name_asc", "name_desc"] as const).map((s) => ({ value: s, label: t(`sorts.${s}`) })) },
        ]}
      />
      {error ? <Alert tone="danger" className="mb-4">{t("loadError")}</Alert> : null}
      <DataTable
        caption={t("title")}
        rows={rows}
        rowKey={(r) => r.id ?? ""}
        empty={<EmptyState icon={<UserCog />} title={t("empty")} description={t("emptyHint")} />}
        columns={[
          {
            key: "name",
            header: tp("name"),
            primary: true,
            cell: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={`${r.first_name ?? ""} ${r.last_name ?? ""}`} src={r.avatar_url} size="sm" />
                <div className="min-w-0">
                  <Link href={`/admin/users/${r.id}`} className="font-medium hover:text-brand-text hover:underline">{[r.last_name, r.first_name, r.middle_name].filter(Boolean).join(" ")}</Link>
                  <p className="truncate text-xs text-ink-muted">{r.email} · {r.public_id}</p>
                </div>
              </div>
            ),
          },
          {
            key: "roles",
            header: t("roles"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {((r.roles ?? []) as Array<{ slug: string; name_tg: string; name_ru: string | null; name_en: string | null }>).map((role) => (
                  <Badge key={role.slug} tone="brand">{pickName(role, locale)}</Badge>
                ))}
              </span>
            ),
          },
          { key: "status", header: tp("status"), cell: (r) => <StatusBadge status={r.status ?? "pending"} label={ts((r.status ?? "pending") as "pending")} /> },
          { key: "login", header: t("lastLogin"), hideOnMobile: true, cell: (r) => <span className="text-sm tabular">{r.last_login_at ? formatDateTime(r.last_login_at, locale, access.school!.timezone) : "—"}</span> },
        ]}
      />
      <Pagination pathname="/admin/users" searchParams={params} page={list.page} pageSize={list.pageSize} total={total} />
    </>
  );
}
