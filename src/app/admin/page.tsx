import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { getAdminDashboard } from "@/features/admin/dashboard-query";
import { SetupGuide } from "@/features/admin/setup-guide";
import { adminNavigation } from "@/components/shell/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, Metric, PageHeader } from "@/components/ui/surface";
import { can, canAny } from "@/lib/auth/access";
import { requireAdminArea } from "@/lib/auth/guards";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("dashboard") };
}

const ALERT_LINKS: Record<string, string> = {
  no_current_academic_year: "/admin/academic-years",
  no_terms_defined: "/admin/academic-years",
  classes_without_homeroom_teacher: "/admin/classes",
  subjects_without_teacher: "/admin/classes",
  no_bell_schedule: "/admin/timetable",
  official_content_not_approved: "/admin/website",
  students_without_class: "/admin/students?class=none",
};

export default async function AdminDashboardPage() {
  const access = await requireAdminArea();
  if (!canAny(access, ["students.view", "users.view", "reports.view"])) {
    const first = adminNavigation(access).flatMap((g) => g.items).find((i) => i.href !== "/admin");
    redirect(first?.href ?? "/dashboard");
  }
  const t = await getTranslations("admin.dashboard");
  const ta = await getTranslations("admin.audit.actions");
  const tp = await getTranslations("portal.announcements.priority");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const data = await getAdminDashboard();

  if (!data) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Alert tone="danger">{t("loadError")}</Alert>
      </>
    );
  }

  const attendanceTotal = data.attendance_today.present + data.attendance_today.late + data.attendance_today.absent + data.attendance_today.excused;
  const queues = [
    { key: "pending_registrations", value: data.queues.pending_registrations, href: "/admin/approvals", show: can(access, "users.approve") },
    { key: "news_in_review", value: data.queues.news_in_review, href: "/admin/news?status=review", show: can(access, "news.publish") },
    { key: "grades_awaiting_approval", value: data.queues.grades_awaiting_approval, href: "/admin/gradebook", show: can(access, "grades.approve") },
    { key: "open_reports", value: data.queues.open_reports, href: "/admin/moderation", show: can(access, "messages.moderate") },
    { key: "news_scheduled", value: data.queues.news_scheduled, href: "/admin/news?status=scheduled", show: canAny(access, ["news.publish", "news.update"]) },
    { key: "library_drafts", value: data.queues.library_drafts, href: "/admin/library?status=draft", show: canAny(access, ["library.update", "library.publish"]) },
    { key: "documents_drafts", value: data.queues.documents_drafts, href: "/admin/documents?status=draft", show: canAny(access, ["documents.create", "documents.publish"]) },
  ].filter((q) => q.show);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={[access.school!.shortName, data.academic_year ? t("year", { year: data.academic_year.name }) : null, data.current_term ? t("term", { term: data.current_term.name }) : null].filter(Boolean).join(" · ")}
      />

      <SetupGuide data={data} className="mb-5" />

      {data.alerts.length > 0 ? (
        <Card className="mb-5 border-warning-600/30">
          <CardHeader title={<span className="inline-flex items-center gap-2"><TriangleAlert className="size-5 text-warning-600" aria-hidden />{t("setupTitle")}</span>} description={t("setupHint")} />
          <CardBody>
            <ul className="divide-y divide-line">
              {data.alerts.map((alert) => (
                <li key={alert} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-sm text-ink">{t(`alerts.${alert in ALERT_LINKS ? alert : "unknown"}`)}</span>
                  {ALERT_LINKS[alert] ? (
                    <Link href={ALERT_LINKS[alert]!} className={buttonClasses("secondary", "sm")}>
                      {t("fix")}
                      <ArrowRight aria-hidden />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("counts.students")} value={data.counts.students_active} href="/admin/students" />
        <Metric label={t("counts.teachers")} value={data.counts.teachers_active} href="/admin/staff" />
        <Metric label={t("counts.staff")} value={data.counts.staff_active} href="/admin/staff" />
        <Metric label={t("counts.classes")} value={data.counts.classes_active} href="/admin/classes" />
        <Metric label={t("counts.guardians")} value={data.counts.guardians} href="/admin/guardians" />
        <Metric label={t("counts.accounts")} value={data.counts.accounts_active} href="/admin/users" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title={t("attendanceToday")} description={t("studentsMarked", { count: data.attendance_today.students_marked })} />
          <CardBody>
            {attendanceTotal === 0 ? (
              <p className="text-sm text-ink-muted">{t("noAttendanceYet")}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-2">
                {(["present", "late", "absent", "excused"] as const).map((key) => (
                  <div key={key} className="rounded-md bg-surface-muted px-3 py-2">
                    <dt className="text-xs text-ink-muted">{t(`attendance.${key}`)}</dt>
                    <dd className="text-lg font-semibold tabular">{data.attendance_today[key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("queuesTitle")} description={t("queuesHint")} />
          <CardBody>
            {queues.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noQueues")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {queues.map((q) => (
                  <li key={q.key}>
                    <Link href={q.href} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-brand-text">
                      <span>{t(`queues.${q.key}`)}</span>
                      <Badge tone={q.value > 0 ? "warning" : "neutral"}>{q.value}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("upcomingEvents")} actions={can(access, "events.manage") ? <Link href="/admin/events" className={buttonClasses("ghost", "sm")}>{t("manage")}</Link> : null} />
          <CardBody>
            {data.upcoming_events.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noEvents")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.upcoming_events.map((e) => (
                  <li key={e.id} className="py-2.5">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-sm text-ink-muted tabular">{formatDateTime(e.starts_at, locale, timeZone)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader title={t("recentAnnouncements")} actions={can(access, "announcements.publish") ? <Link href="/admin/announcements" className={buttonClasses("ghost", "sm")}>{t("manage")}</Link> : null} />
          <CardBody>
            {data.recent_announcements.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noAnnouncements")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_announcements.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2 py-2.5">
                    <span>
                      <span className="block font-medium">{a.title}</span>
                      <span className="block text-sm text-ink-muted">{formatDate(a.publish_at, locale, timeZone)}</span>
                    </span>
                    {a.priority !== "normal" ? <Badge tone={a.priority === "critical" ? "danger" : "warning"}>{tp(a.priority === "critical" ? "critical" : "important")}</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {data.recent_activity ? (
          <Card className="xl:col-span-2">
            <CardHeader title={t("recentActivity")} actions={<Link href="/admin/audit" className={buttonClasses("ghost", "sm")}>{t("openAudit")}</Link>} />
            <CardBody>
              {data.recent_activity.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noActivity")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_activity.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-medium">{entry.actor ? `${entry.actor.first_name} ${entry.actor.last_name}` : t("system")}</span>{" "}
                        <span className="text-ink-secondary">{ta.has(entry.action) ? ta(entry.action) : entry.action}</span>{" "}
                        <span className="text-ink-muted">{entry.entity_type}</span>
                      </span>
                      <time dateTime={entry.created_at} className="text-xs text-ink-muted tabular">{formatDateTime(entry.created_at, locale, timeZone)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
