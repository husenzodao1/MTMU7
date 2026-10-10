import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Send } from "lucide-react";
import { getAudienceOptions } from "@/features/admin/content/announcement-options";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { cancelBroadcastAction } from "@/features/admin/management/actions";
import { BroadcastForm } from "@/features/admin/management/broadcast-form";
import { ConfirmAction } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("notifications") };
}

export default async function AdminBroadcastsPage() {
  const access = await requirePermission("notifications.send");
  const t = await getTranslations("admin.broadcasts");
  const ta = await getTranslations("admin.announcements.audiences");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();
  const [{ data }, options] = await Promise.all([
    supabase
      .from("notification_broadcasts")
      .select("id, title, audience_type, status, scheduled_at, sent_at, sent_count, created_at")
      .eq("school_id", access.school!.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getAudienceOptions(access.school!.id, locale),
  ]);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,28rem)_1fr]">
        <Card>
          <CardHeader title={t("new")} description={t("newHint")} />
          <CardBody>
            <BroadcastForm roles={options.roles} classes={options.classes} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("history")} />
          <CardBody className="p-0">
            {!data || data.length === 0 ? (
              <EmptyState icon={<Send />} title={t("empty")} description={t("emptyHint")} />
            ) : (
              <ul className="divide-y divide-line">
                {data.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{b.title}</span>
                      <span className="block text-sm text-ink-muted">
                        {ta(b.audience_type as "school")} ·{" "}
                        {b.status === "sent" && b.sent_at
                          ? t("sentSummary", { date: formatDateTime(b.sent_at, locale, timeZone), count: b.sent_count })
                          : b.scheduled_at
                            ? t("scheduledFor", { date: formatDateTime(b.scheduled_at, locale, timeZone) })
                            : formatDateTime(b.created_at, locale, timeZone)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={b.status} label={ts(b.status as "sent")} />
                      {b.status === "scheduled" || b.status === "draft" ? (
                        <ConfirmAction action={cancelBroadcastAction} fields={{ id: b.id }} title={t("cancelTitle")} confirmLabel={t("cancel")} trigger={<Button variant="ghost" size="sm">{t("cancel")}</Button>} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
