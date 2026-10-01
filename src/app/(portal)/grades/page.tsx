import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { scoreTone } from "@/features/academic/components";
import { resolveStudentContext } from "@/features/academic/student-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { TabNav } from "@/components/ui/misc";
import { requireModule } from "@/lib/auth/guards";
import { formatNumber, formatShortDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("grades") };
}

export default async function GradesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("grades");
  const t = await getTranslations("portal.grades");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const context = await resolveStudentContext(access, params);

  if (!context) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Card as="div"><EmptyState icon={<GraduationCap />} title={t("noStudent")} /></Card>
      </>
    );
  }

  const supabase = await createClient();
  const { data: terms } = context.academicYearId
    ? await supabase
        .from("academic_terms")
        .select("id, name, start_date, end_date")
        .eq("academic_year_id", context.academicYearId)
        .in("kind", ["quarter", "semester", "trimester", "term"])
        .order("start_date")
    : { data: [] as Array<{ id: string; name: string; start_date: string; end_date: string }> };

  const today = new Date().toISOString().slice(0, 10);
  const requestedTerm = firstValue(params.term);
  const currentTerm = terms?.find((term) => term.start_date <= today && term.end_date >= today) ?? terms?.at(-1);
  const termId = terms?.some((term) => term.id === requestedTerm) ? requestedTerm : currentTerm?.id;

  let query = supabase
    .from("grades")
    .select("id, score, max_score, grade_date, comment, status, class_subjects!inner(id, subjects!inner(id, name_tg, name_ru, name_en)), assessment_types!inner(name_tg, name_ru, name_en, is_final, weight)")
    .eq("student_id", context.studentId)
    .order("grade_date", { ascending: true });
  if (termId) query = query.eq("academic_term_id", termId);
  const { data: grades } = await query;

  type Row = NonNullable<typeof grades>[number];
  const bySubject = new Map<string, { name: string; items: Row[] }>();
  for (const grade of grades ?? []) {
    const subject = grade.class_subjects.subjects;
    const entry = bySubject.get(subject.id) ?? { name: pickName(subject, locale), items: [] };
    entry.items.push(grade);
    bySubject.set(subject.id, entry);
  }
  const subjects = [...bySubject.values()].sort((x, y) => x.name.localeCompare(y.name, locale));
  const childQuery = context.viewer === "guardian" ? `child=${context.studentId}&` : "";

  return (
    <>
      <PageHeader title={t("title")} description={[`${context.firstName} ${context.lastName}`, context.className].filter(Boolean).join(" · ")} />
      <ChildSwitcher context={context} pathname="/grades" />
      {terms && terms.length > 0 ? (
        <TabNav
          label={t("terms")}
          items={terms.map((term) => ({ href: `/grades?${childQuery}term=${term.id}`, label: term.name, active: term.id === termId }))}
        />
      ) : null}

      {subjects.length === 0 ? (
        <Card as="div"><EmptyState icon={<GraduationCap />} title={t("none")} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {subjects.map((subject) => {
            const regular = subject.items.filter((g) => !g.assessment_types.is_final);
            const finals = subject.items.filter((g) => g.assessment_types.is_final);
            const weightSum = regular.reduce((sum, g) => sum + Number(g.assessment_types.weight), 0);
            const average = weightSum > 0
              ? regular.reduce((sum, g) => sum + (Number(g.score) / Number(g.max_score)) * Number(g.assessment_types.weight), 0) / weightSum
              : null;
            return (
              <Card key={subject.name}>
                <CardHeader
                  title={subject.name}
                  description={average === null ? undefined : t("average", { value: formatNumber(average * 100, locale) })}
                  actions={finals.map((f) => (
                    <Badge key={f.id} tone={scoreTone(Number(f.score), Number(f.max_score))} className="tabular">
                      {pickName(f.assessment_types, locale)}: {formatNumber(f.score, locale)}
                    </Badge>
                  ))}
                />
                <CardBody>
                  {regular.length === 0 ? (
                    <p className="text-sm text-ink-muted">{t("noRegular")}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2" aria-label={t("list", { subject: subject.name })}>
                      {regular.map((grade) => (
                        <li key={grade.id}>
                          <span
                            className="inline-flex flex-col items-center rounded-md border border-line px-2.5 py-1.5"
                            title={[pickName(grade.assessment_types, locale), grade.comment].filter(Boolean).join(" — ")}
                          >
                            <Badge tone={scoreTone(Number(grade.score), Number(grade.max_score))} className="text-sm tabular">
                              {formatNumber(grade.score, locale)}
                            </Badge>
                            <span className="mt-1 text-xs text-ink-muted tabular">{formatShortDate(grade.grade_date, locale).slice(0, 5)}</span>
                            <span className="sr-only">
                              {pickName(grade.assessment_types, locale)}, {formatShortDate(grade.grade_date, locale)}, {formatNumber(grade.score, locale)} / {formatNumber(grade.max_score, locale)}
                              {grade.comment ? `, ${grade.comment}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
