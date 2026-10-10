import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TabNav } from "@/components/ui/misc";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("moderation") };
}

export default async function ModerationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("messages.moderate");
  const t = await getTranslations("admin.moderation");
  const tr = await getTranslations("portal.messages.reasons");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const view = firstValue((await searchParams).view) === "resolved" ? "resolved" : "open";
  const supabase = await createClient();
  let query = supabase
    .from("message_reports")
    .select("id, reason, status, created_at, reviewed_at")
    .eq("school_id", access.school!.id)
    .order("created_at", { ascending: view === "open" })
    .limit(100);
  query = view === "open" ? query.eq("status", "open") : query.neq("status", "open");
  const { data } = await query;

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav label={t("views")} items={[{ href: "/admin/moderation", label: t("open"), active: view === "open" }, { href: "/admin/moderation?view=resolved", label: t("resolved"), active: view === "resolved" }]} />
      <DataTable
        caption={t("title")}
        rows={data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/moderation/${r.id}`}
        empty={<EmptyState icon={<ShieldCheck />} title={view === "open" ? t("emptyOpen") : t("emptyResolved")} />}
        columns={[
          { key: "reason", header: t("reason"), primary: true, cell: (r) => <span className="font-medium">{tr(r.reason as "other")}</span> },
          { key: "created", header: t("reported"), cell: (r) => <span className="tabular text-sm">{formatDateTime(r.created_at, locale, access.school!.timezone)}</span> },
          { key: "status", header: t("status"), cell: (r) => <StatusBadge status={r.status} label={ts(r.status as "open")} /> },
        ]}
        actions={(r) => <Link href={`/admin/moderation/${r.id}`} className={buttonClasses("secondary", "sm")}>{t("review")}</Link>}
      />
    </>
  );
}
