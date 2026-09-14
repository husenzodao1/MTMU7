import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
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
  const [overview, { data: records }] = await Promise.all([
    getStudentOverview(context.studentId),
    supabase
      .from("attendance_records")
      .select("id, attendance_date, status, minutes_late, note, period_number, class_subjects(subjects(name_tg, name_ru, name_en))")
      .eq("student_id", context.studentId)
      .neq("status", "present")
      .order("attendance_date", { ascending: false })
      .limit(100),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={[`${context.firstName} ${context.lastName}`, context.className].filter(Boolean).join(" · ")} />
      <ChildSwitcher context={context} pathname="/attendance" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("termSummary")} />
          <CardBody>{overview ? <AttendanceSummary summary={overview.attendance_term} /> : null}</CardBody>
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
