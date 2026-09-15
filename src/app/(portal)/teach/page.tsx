import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpenCheck, ClipboardCheck, NotebookPen } from "lucide-react";
import { getTeacherToday } from "@/features/academic/queries";
import { getMyClassSubjects } from "@/features/teach/queries";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, Metric, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, todayIso } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("teach") };
}

export default async function TeachPage() {
  const access = await requirePermission("grades.enter", "attendance.mark", "homework.create");
  const t = await getTranslations("teach");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const today = todayIso(timeZone);
  const [teacher, classSubjects] = await Promise.all([getTeacherToday(today), getMyClassSubjects(access.userId, locale)]);

  return (
    <>
      <PageHeader title={t("title")} description={formatDate(today, locale, timeZone)} />
      {!teacher ? (
        <Card as="div"><EmptyState title={t("noStaffRecord")} description={t("noStaffRecordHint")} /></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label={t("metrics.lessons")} value={teacher.lessons.length} href="/teach/attendance" />
            <Metric label={t("metrics.unmarked")} value={teacher.lessons.filter((l) => !l.attendance_marked && !l.cancelled_for_me).length} tone={teacher.lessons.some((l) => !l.attendance_marked && !l.cancelled_for_me) ? "attention" : "default"} href="/teach/attendance" />
            <Metric label={t("metrics.toReview")} value={teacher.submissions_to_review} tone={teacher.submissions_to_review > 0 ? "attention" : "default"} href="/teach/homework" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("todayLessons")} actions={<Link href="/teach/attendance" className={buttonClasses("secondary", "sm")}>{t("attendanceLink")}</Link>} />
              <CardBody>
                {teacher.lessons.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("noLessons")}</p>
                ) : (
                  <ol className="divide-y divide-line">
                    {teacher.lessons.map((lesson) => (
                      <li key={lesson.timetable_entry_id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="w-8 font-semibold tabular">{lesson.period_number}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{lesson.class_name} · {pickText({ tg: lesson.subject_tg, ru: lesson.subject_ru, en: lesson.subject_en }, locale)}</span>
                          <span className="block text-sm text-ink-muted">{[lesson.start_time?.slice(0, 5), lesson.room].filter(Boolean).join(" · ")}</span>
                        </span>
                        {lesson.cancelled_for_me ? (
                          <Badge>{t("covered")}</Badge>
                        ) : lesson.attendance_marked ? (
                          <Badge tone="success" dot>{t("marked")}</Badge>
                        ) : (
                          <Link href={`/teach/attendance?classSubject=${lesson.class_subject_id}&date=${today}&period=${lesson.period_number}`} className={buttonClasses("primary", "sm")}>
                            <ClipboardCheck aria-hidden />
                            {t("mark")}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t("dueSoon")} actions={can(access, "homework.create") ? <Link href="/teach/homework/new" className={buttonClasses("secondary", "sm")}>{t("newHomework")}</Link> : null} />
              <CardBody>
                {teacher.homework_due_soon.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("nothingDue")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {teacher.homework_due_soon.map((h) => (
                      <li key={h.id} className="py-2.5">
                        <Link href={`/teach/homework/${h.id}`} className="font-medium hover:text-brand-700 hover:underline">{h.title}</Link>
                        <p className="text-sm text-ink-muted">{h.class_name} · {formatDateTime(h.due_at, locale, timeZone)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title={t("myClasses")} description={t("myClassesHint")} />
            <CardBody>
              {classSubjects.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noClasses")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {classSubjects.map((cs) => (
                    <li key={cs.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="font-medium">{cs.label}</span>
                      <span className="flex flex-wrap gap-2">
                        {can(access, "grades.enter") ? (
                          <Link href={`/teach/gradebook/${cs.id}`} className={buttonClasses("secondary", "sm")}>
                            <BookOpenCheck aria-hidden />
                            {t("gradebookLink")}
                          </Link>
                        ) : null}
                        {can(access, "homework.create") ? (
                          <Link href={`/teach/homework?classSubject=${cs.id}`} className={buttonClasses("ghost", "sm")}>
                            <NotebookPen aria-hidden />
                            {t("homeworkLink")}
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
