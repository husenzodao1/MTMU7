import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import { getTeacherToday } from "@/features/academic/queries";
import { AttendanceRoster, type RosterRow } from "@/features/teach/attendance-roster";
import { getClassContext, getClassSubjectContext, getMyClassSubjects, getRoster } from "@/features/teach/queries";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, todayIso } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teach.attendance");
  return { title: t("title") };
}

export default async function TeachAttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("attendance.mark", "attendance.update");
  const t = await getTranslations("teach.attendance");
  const tt = await getTranslations("teach");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const timeZone = access.school!.timezone;
  const today = todayIso(timeZone);

  const dateRaw = firstValue(params.date) ?? today;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && dateRaw <= today ? dateRaw : today;
  const classSubjectId = firstValue(params.classSubject) ?? null;
  const classIdParam = firstValue(params.class) ?? null;
  const periodRaw = Number(firstValue(params.period));
  const period = Number.isInteger(periodRaw) && periodRaw >= 1 && periodRaw <= 12 ? periodRaw : null;

  const breadcrumb = <Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title") }]} />;

  // Picker: today's lessons and homeroom registers.
  if (!classSubjectId && !classIdParam) {
    const [teacher, myClassSubjects] = await Promise.all([getTeacherToday(today), getMyClassSubjects(access.userId, locale)]);
    return (
      <>
        <PageHeader breadcrumb={breadcrumb} title={t("title")} description={t("pickerDescription")} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("todayLessons")} description={formatDate(today, locale)} />
            <CardBody>
              {!teacher || teacher.lessons.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noLessonsToday")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {teacher.lessons.map((lesson) => (
                    <li key={lesson.timetable_entry_id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="w-8 font-semibold tabular">{lesson.period_number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{lesson.class_name} · {pickText({ tg: lesson.subject_tg, ru: lesson.subject_ru, en: lesson.subject_en }, locale)}</span>
                        {lesson.is_substitution ? <span className="text-sm text-ink-muted">{t("substitution")}</span> : null}
                      </span>
                      {lesson.cancelled_for_me ? (
                        <Badge>{t("covered")}</Badge>
                      ) : (
                        <Link
                          href={`/teach/attendance?classSubject=${lesson.class_subject_id}&date=${today}&period=${lesson.period_number}`}
                          className={buttonClasses(lesson.attendance_marked ? "secondary" : "primary", "sm")}
                        >
                          {lesson.attendance_marked ? t("review") : t("mark")}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("dailyRegisters")} description={t("dailyRegistersHint")} />
            <CardBody>
              {!teacher || teacher.homeroom_classes.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noHomeroom")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {teacher.homeroom_classes.map((c) => (
                    <li key={c.class_id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="font-medium">{c.class_name}</span>
                      <Link href={`/teach/attendance?class=${c.class_id}&date=${today}`} className={buttonClasses(c.daily_attendance_marked ? "secondary" : "primary", "sm")}>
                        {c.daily_attendance_marked ? t("review") : t("mark")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title={t("otherLesson")} description={t("otherLessonHint")} />
            <CardBody>
              {myClassSubjects.length === 0 ? (
                <p className="text-sm text-ink-muted">{tt("noClasses")}</p>
              ) : (
                <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">{t("lesson")}</span>
                    <select name="classSubject" required className="block h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm">
                      {myClassSubjects.map((cs) => (
                        <option key={cs.id} value={cs.id}>{cs.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">{t("date")}</span>
                    <input type="date" name="date" defaultValue={today} max={today} required className="block h-10 rounded-md border border-line-strong bg-surface px-3 text-sm" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">{t("period")}</span>
                    <input type="number" name="period" min={1} max={12} defaultValue={1} required className="block h-10 w-20 rounded-md border border-line-strong bg-surface px-3 text-sm" />
                  </label>
                  <button type="submit" className={buttonClasses("primary")}>{t("open")}</button>
                </form>
              )}
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  // Register for one lesson or one class day.
  let classId: string;
  let heading: string;
  if (classSubjectId) {
    const cs = await getClassSubjectContext(classSubjectId, locale);
    if (!cs || period === null) notFound();
    classId = cs.classId;
    heading = t("lessonHeading", { className: cs.className, subject: cs.subjectName, period });
  } else {
    const klass = await getClassContext(classIdParam!);
    if (!klass) notFound();
    classId = klass.id;
    heading = t("dailyHeading", { className: klass.name });
  }

  const supabase = await createClient();
  const [roster, { data: records }, { data: school }] = await Promise.all([
    getRoster(classId, date),
    (() => {
      let query = supabase
        .from("attendance_records")
        .select("student_id, status, minutes_late, note")
        .eq("class_id", classId)
        .eq("attendance_date", date);
      query = classSubjectId ? query.eq("class_subject_id", classSubjectId).eq("period_number", period!) : query.is("class_subject_id", null);
      return query;
    })(),
    supabase.from("schools").select("settings").eq("id", access.school!.id).maybeSingle(),
  ]);
  const byStudent = new Map((records ?? []).map((r) => [r.student_id, r]));
  const rows: RosterRow[] = roster.map((s) => {
    const record = byStudent.get(s.id);
    return {
      id: s.id,
      name: [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" "),
      number: s.studentNumber,
      status: (record?.status as RosterRow["status"]) ?? null,
      minutesLate: record?.minutes_late ?? null,
      note: record?.note ?? null,
    };
  });

  const settings = (school?.settings ?? {}) as Record<string, unknown>;
  const windowDays = Number(settings.attendance_correction_days ?? 7) || 7;
  const earliest = new Date(`${today}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - windowDays);
  const closed = date < earliest.toISOString().slice(0, 10) && !can(access, "attendance.update");

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={heading} description={formatDate(date, locale)} actions={
        <Link href="/teach/attendance" className={buttonClasses("secondary", "sm")}>{t("changeLesson")}</Link>
      } />
      {closed ? <Alert tone="warning" className="mb-4">{t("windowClosed", { days: windowDays })}</Alert> : null}
      {rows.length === 0 ? (
        <Card as="div"><EmptyState icon={<ClipboardCheck />} title={t("emptyRoster")} /></Card>
      ) : (
        <AttendanceRoster rows={rows} classId={classId} classSubjectId={classSubjectId} date={date} period={classSubjectId ? period : null} readOnly={closed} />
      )}
    </>
  );
}
