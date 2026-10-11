import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import { ChildSwitcher, YearSwitcher } from "@/features/academic/child-switcher";
import { AttendanceSummary } from "@/features/academic/components";
import { getStudentOverview } from "@/features/academic/queries";
import { resolveStudentContext } from "@/features/academic/student-context";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireModule } from "@/lib/auth/guards";
import { formatShortDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import type { SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("attendance") };
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("attendance");
  const t = await getTranslations("portal.attendance");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const context = await resolveStudentContext(access, await searchParams);

  if (!context) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Card as="div"><EmptyState icon={<ClipboardCheck />} title={t("noStudent")} /></Card>
      </>
    );
  }

  const supabase = await createClient();
  // A past year shows that year's absences and its own totals; this year, the
  // term under way as before.
  const year = context.pastYear ? context.years.find((y) => y.id === context.academicYearId) ?? null : null;
  let records_ = supabase
    .from("attendance_records")
    .select("id, attendance_date, status, minutes_late, note, period_number, class_subjects(subjects(name_tg, name_ru, name_en))")
    .eq("student_id", context.studentId)
    .neq("status", "present")
    .order("attendance_date", { ascending: false })
    .limit(100);
  if (year) records_ = records_.gte("attendance_date", year.start).lte("attendance_date", year.end);
  const count = (status: string) =>
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("student_id", context.studentId)
      .eq("status", status)
      .gte("attendance_date", year!.start)
      .lte("attendance_date", year!.end)
      .then((r) => r.count ?? 0);
  const [overview, { data: records }, yearTotals] = await Promise.all([
    year ? Promise.resolve(null) : getStudentOverview(context.studentId),
    records_,
    year ? Promise.all(["present", "late", "absent", "excused"].map(count)) : Promise.resolve(null),
  ]);
  const summary = yearTotals
    ? {
        present: yearTotals[0]!,
        late: yearTotals[1]!,
        absent: yearTotals[2]!,
        excused: yearTotals[3]!,
        total: yearTotals.reduce((sum, n) => sum + n, 0),
        lessons: 0,
      }
    : overview?.attendance_term ?? null;

  return (
    <>
      <PageHeader title={t("title")} description={[`${context.firstName} ${context.lastName}`, context.className].filter(Boolean).join(" · ")} />
      <ChildSwitcher context={context} pathname="/attendance" />
      <YearSwitcher context={context} pathname="/attendance" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={year ? t("yearSummary", { year: year.name }) : t("termSummary")} />
          <CardBody>{summary ? <AttendanceSummary summary={summary} /> : null}</CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("exceptions")} description={t("exceptionsHint")} />
          <CardBody>
            {!records || records.length === 0 ? (
              <EmptyState icon={<ClipboardCheck />} title={t("noExceptions")} className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {records.map((record) => {
                  const subject = (record.class_subjects as { subjects: { name_tg: string; name_ru: string | null; name_en: string | null } } | null)?.subjects;
                  return (
                    <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="font-medium tabular">{formatShortDate(record.attendance_date, locale)}</p>
                        <p className="text-sm text-ink-muted">
                          {subject ? pickName(subject, locale) : t("daily")}
                          {record.period_number ? ` · ${t("period", { number: record.period_number })}` : ""}
                          {record.minutes_late ? ` · ${t("minutesLate", { minutes: record.minutes_late })}` : ""}
                        </p>
                        {record.note ? <p className="text-sm text-ink-secondary">{record.note}</p> : null}
                      </div>
                      <StatusBadge status={record.status} label={ts(record.status)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
