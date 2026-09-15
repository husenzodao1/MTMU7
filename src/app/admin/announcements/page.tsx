import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Megaphone, Paperclip, Plus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { Alert, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, ilikePattern, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("announcements") };
}

export default async function AdminAnnouncementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("announcements.publish");
  const t = await getTranslations("admin.announcements");
  const ts = await getTranslations("common.status");
  const tp = await getTranslations("portal.announcements.priority");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const saved = firstValue(params.saved);
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", filters: { status: ["draft", "published", "archived"], priority: ["normal", "important", "critical"] } });
  const supabase = await createClient();

  let query = supabase
    .from("announcements")
    .select("id, title, status, priority, audience_type, publish_at, expires_at, attachment_name, notified_at", { count: "exact" })
    .eq("school_id", access.school!.id)
    .order("publish_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (list.filters.status) query = query.eq("status", list.filters.status);
  if (list.filters.priority) query = query.eq("priority", list.filters.priority);
  if (list.query) query = query.ilike("title", ilikePattern(list.query));
  const { data, count } = await query;
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={<Link href="/admin/announcements/new" className={buttonClasses("primary")}><Plus aria-hidden />{t("new")}</Link>}
      />
      {saved ? <Alert tone="success" className="mb-4">{t.has(`saved.${saved}`) ? t(`saved.${saved}`) : tc("saved")}</Alert> : null}
      <FilterBar
        searchLabel={t("search")}
        filters={[
          { name: "status", label: t("status"), options: ["draft", "published", "archived"].map((s) => ({ value: s, label: ts(s as "draft") })) },
          { name: "priority", label: t("priority"), options: (["normal", "important", "critical"] as const).map((p) => ({ value: p, label: tp(p) })) },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<Megaphone />} title={t("empty")} />}
        columns={[
          {
            key: "title",
            header: t("titleField"),
            primary: true,
            cell: (r) => (
              <div>
                <Link href={`/admin/announcements/${r.id}`} className="font-medium hover:text-brand-700 hover:underline">{r.title}</Link>
                <p className="flex items-center gap-1 text-xs text-ink-muted">
                  {t(`audiences.${r.audience_type as "school"}`)}
                  {r.attachment_name ? <><Paperclip className="size-3" aria-hidden /><span className="sr-only">{t("hasAttachment")}</span></> : null}
                </p>
              </div>
            ),
          },
          {
            key: "status",
            header: t("status"),
            cell: (r) => {
              const scheduled = r.status === "published" && r.publish_at > now;
              const expired = r.status === "published" && r.expires_at && r.expires_at <= now;
              return (
                <span className="flex flex-wrap gap-1">
                  <StatusBadge status={scheduled ? "scheduled" : expired ? "expired" : r.status} label={scheduled ? ts("scheduled") : expired ? ts("expired") : ts(r.status as "draft")} />
                  {r.priority !== "normal" ? <Badge tone={r.priority === "critical" ? "danger" : "warning"}>{tp(r.priority as "important")}</Badge> : null}
                </span>
              );
            },
          },
          { key: "publish", header: t("publishAt"), hideOnMobile: true, cell: (r) => <span className="text-sm tabular">{formatDateTime(r.publish_at, locale, timeZone)}</span> },
          { key: "notified", header: t("notified"), hideOnMobile: true, cell: (r) => (r.notified_at ? <Badge tone="success">{t("sent")}</Badge> : <span className="text-ink-muted">—</span>) },
        ]}
      />
      <Pagination pathname="/admin/announcements" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
