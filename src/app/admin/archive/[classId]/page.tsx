import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpenCheck, FileDown } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName } from "@/features/admin/queries";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { hasModule } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("archive") };
}

type Person = { first_name: string; last_name: string; middle_name: string | null };

/**
 * One class of any year, as the archive keeps it: who studied in it that year
 * — still there, finished, moved on — its journals subject by subject, and its
 * report cards.
 */
export default async function ArchiveClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const access = await requirePermission("classes.view", "grades.view", "grades.approve", "grades.update", "reports.view");
  const { classId } = await params;
  if (!isUuid(classId)) notFound();
  const t = await getTranslations("admin.archive");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, school_id, academic_year_id, name, staff:homeroom_staff_id(first_name, last_name, middle_name), academic_years(name)")
    .eq("id", classId)
    .maybeSingle();
  if (!klass || klass.school_id !== access.school!.id) notFound();

  const [{ data: enrollments }, { data: journals }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("status, students(id, first_name, last_name, middle_name)")
      .eq("class_id", classId),
    supabase
      .from("class_subjects")
      .select("id, group_label, subjects(name_tg, name_ru, name_en), staff:teacher_id(first_name, last_name, middle_name)")
      .eq("class_id", classId),
  ]);

  const year = klass.academic_years as unknown as { name: string } | null;
  const homeroom = klass.staff ? fullName(klass.staff as unknown as Person) : null;
  const pupils = (enrollments ?? [])
    .map((e) => ({ status: e.status, student: e.students as unknown as (Person & { id: string }) | null }))
    .filter((e): e is { status: string; student: Person & { id: string } } => Boolean(e.student))
    .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name) || a.student.first_name.localeCompare(b.student.first_name));
  const subjects = (journals ?? [])
    .map((cs) => ({
      id: cs.id,
      subject: [pickName(cs.subjects as unknown as { name_tg: string; name_ru: string | null; name_en: string | null }, locale), cs.group_label].filter(Boolean).join(" · "),
      teacher: cs.staff ? fullName(cs.staff as unknown as Person) : null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, locale));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: `/admin/archive?year=${klass.academic_year_id}` }, { label: klass.name }]} />}
        title={klass.name}
        description={[year?.name, homeroom, t("pupilsCount", { count: pupils.length })].filter(Boolean).join(" · ")}
        actions={
          hasModule(access, "grades") && pupils.length > 0 ? (
            <a href={`/report-cards?class=${klass.id}`} download data-instant="off" className={buttonClasses("secondary")}>
              <FileDown aria-hidden />
              {t("reportCards")}
            </a>
          ) : null
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("journals")} />
          <CardBody className="p-0">
            {subjects.length === 0 ? (
              <EmptyState icon={<BookOpenCheck />} title={t("noJournals")} />
            ) : (
              <ul>
                {subjects.map((s) => (
                  <li key={s.id}>
                    <Link href={`/teach/gradebook/${s.id}`} className="archive-row">
                      <BookOpenCheck className="size-4 shrink-0 text-brand-text" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{s.subject}</span>
                        {s.teacher ? <span className="block truncate text-xs text-ink-muted">{s.teacher}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("pupils")} />
          <CardBody className="p-0">
            <ol>
              {pupils.map(({ status, student }, index) => (
                <li key={student.id} className="archive-row">
                  <span className="w-6 text-end text-xs text-ink-muted tabular">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{fullName(student)}</span>
                  {status !== "active" ? <Badge tone="neutral">{t(`enrollment.${status === "completed" || status === "transferred" || status === "withdrawn" ? status : "other"}`)}</Badge> : null}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
