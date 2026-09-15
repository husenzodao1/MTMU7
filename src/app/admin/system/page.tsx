import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CircleAlert, CircleCheck } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can, isPlatformAdmin } from "@/lib/auth/access";
import { requireAdminArea } from "@/lib/auth/guards";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("system") };
}

/**
 * Operational checks without exposing secrets: only presence of settings is
 * reported, never their values.
 */
export default async function SystemStatusPage() {
  const access = await requireAdminArea();
  if (!isPlatformAdmin(access) && !can(access, "settings.update")) redirect("/access-denied");
  const t = await getTranslations("admin.system");
  const supabase = await createClient();

  const started = Date.now();
  const { error: dbError } = await supabase.from("schools").select("id", { head: true, count: "exact" }).limit(1);
  const dbLatency = Date.now() - started;
  const [{ count: pendingBroadcasts }, { count: unsentAnnouncements }] = await Promise.all([
    supabase.from("notification_broadcasts").select("id", { head: true, count: "exact" }).eq("status", "scheduled").lt("scheduled_at", new Date(Date.now() - 15 * 60_000).toISOString()),
    supabase.from("announcements").select("id", { head: true, count: "exact" }).eq("status", "published").is("notified_at", null).lt("publish_at", new Date(Date.now() - 15 * 60_000).toISOString()),
  ]);

  const checks: Array<{ key: string; ok: boolean; detail?: string }> = [
    { key: "supabaseConfigured", ok: isSupabaseConfigured },
    { key: "database", ok: !dbError, detail: dbError ? undefined : t("latency", { ms: dbLatency }) },
    { key: "appUrl", ok: /^https:\/\//.test(publicEnv.NEXT_PUBLIC_APP_URL ?? "") || (process.env.NODE_ENV !== "production" && Boolean(publicEnv.NEXT_PUBLIC_APP_URL)), detail: publicEnv.NEXT_PUBLIC_APP_URL },
    { key: "serviceRole", ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { key: "cronSecret", ok: (process.env.CRON_SECRET ?? "").length >= 32 },
    { key: "scheduler", ok: (pendingBroadcasts ?? 0) === 0 && (unsentAnnouncements ?? 0) === 0, detail: t("overdue", { count: (pendingBroadcasts ?? 0) + (unsentAnnouncements ?? 0) }) },
  ];

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <Card className="max-w-3xl">
        <CardHeader title={t("checks")} description={t("checksHint")} />
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {checks.map((check) => (
              <li key={check.key} className="flex items-start gap-3 px-5 py-3">
                {check.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-600" aria-hidden />}
                <span className="min-w-0">
                  <span className="block font-medium">
                    {t(`items.${check.key}.name`)}
                    <span className="sr-only">: {check.ok ? t("ok") : t("attention")}</span>
                  </span>
                  <span className="block text-sm text-ink-muted">{check.ok ? check.detail ?? t(`items.${check.key}.ok`) : t(`items.${check.key}.problem`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-ink-muted">{t("runtimeNote", { environment: process.env.NODE_ENV ?? "unknown" })}</p>
    </>
  );
}
