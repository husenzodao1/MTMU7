import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/fields";
import { ruleJournalColumnAction } from "@/features/teach/grade-actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { scoreTone } from "@/features/academic/components";
import { GradeEntryForm, type GradeEntryStudent } from "@/features/teach/grade-entry";
import { getClassSubjectContext, getRoster, getTermsForYear } from "@/features/teach/queries";
import { buttonClasses } from "@/components/ui/button";
import { TabNav } from "@/components/ui/misc";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatNumber, formatShortDate, todayIso } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { robots: { index: false } };

const toneClass = { success: "text-success-700", warning: "text-warning-700", danger: "text-danger-700", neutral: "text-ink", brand: "text-brand-text-strong" } as const;

export default async function GradebookPage({ params, searchParams }: { params: Promise<{ classSubjectId: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("grades.enter", "grades.update", "grades.view");
  const { classSubjectId } = await params;
  const query = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("teach.gradebook");
  const tt = await getTranslations("teach");
  const cs = await getClassSubjectContext(classSubjectId, locale);
  if (!cs) notFound();

  const timeZone = access.school!.timezone;
  const today = todayIso(timeZone);
  const terms = await getTermsForYear(cs.academicYearId);
  const termParam = firstValue(query.term);
  const term = terms.find((x) => x.id === termParam) ?? terms.find((x) => x.start_date <= today && x.end_date >= today) ?? terms[0];

  const breadcrumb = (
    <Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title"), href: "/teach/gradebook" }, { label: `${cs.className} · ${cs.subjectName}` }]} />
  );
  if (!term) {
    return (
      <>
        <PageHeader breadcrumb={breadcrumb} title={`${cs.className} · ${cs.subjectName}`} />
        <Card as="div"><EmptyState title={t("noTerms")} description={t("noTermsHint")} /></Card>
      </>
    );
  }

  const supabase = await createClient();
  const [roster, { data: gradeRows }, { data: typeRows }, { data: columnRows }, { data: attendanceRows }] = await Promise.all([
    getRoster(cs.classId, term.start_date, term.end_date),
    supabase
      .from("grades")
      .select("id, student_id, assessment_type_id, score, max_score, grade_date, comment, status")
      .eq("class_subject_id", cs.id)
      .eq("academic_term_id", term.id)
      .order("grade_date")
      .limit(5000),
    supabase
      .from("assessment_types")
      .select("id, name_tg, name_ru, name_en, code, weight, max_score, is_final, is_active, sort_order")
      .eq("school_id", access.school!.id)
      .order("sort_order"),
    supabase
      .from("journal_columns")
      .select("column_date, assessment_type_id, label")
      .eq("class_subject_id", classSubjectId)
      .eq("academic_term_id", term.id)
      .order("column_date"),
    supabase
      .from("attendance_records")
      .select("student_id, attendance_date, status")
      .eq("class_subject_id", classSubjectId)
      .gte("attendance_date", term.start_date)
      .lte("attendance_date", term.end_date)
      .limit(5000),
  ]);
  const grades = gradeRows ?? [];
  const types = typeRows ?? [];
  const typeById = new Map(types.map((type) => [type.id, type]));

  // Columns are the ones the teacher ruled, plus any a mark implies — a mark
  // entered before this page existed must never disappear from the journal.
  const ruled = columnRows ?? [];
  const columnLabel = new Map(ruled.map((c) => [`${c.column_date}~${c.assessment_type_id}`, c.label]));
  const columnKeys = [
    ...new Set([
      ...ruled.map((c) => `${c.column_date}~${c.assessment_type_id}`),
      ...grades.map((g) => `${g.grade_date}~${g.assessment_type_id}`),
    ]),
  ].sort();
  const cell = new Map(grades.map((g) => [`${g.student_id}|${g.grade_date}~${g.assessment_type_id}`, g]));
  // A column holds a mark or, where there is none, the letter for an absence.
  const attended = new Map((attendanceRows ?? []).map((r) => [`${r.student_id}|${r.attendance_date}`, r.status]));
  // The letters the paper register uses. They are read aloud in class, so they
  // stay the school's own letters — but they are translatable, because a
  // Russian-language school writes н, о and у instead.
  const ABSENCE_LETTER: Record<string, string> = {
    absent: t("absence.absent"),
    late: t("absence.late"),
    excused: t("absence.excused"),
  };

  const editKey = firstValue(query.column);
  const [editDate, editType] = editKey && columnKeys.includes(editKey) ? (editKey.split("~") as [string, string]) : [null, null];
  const defaultDate = today < term.start_date ? term.start_date : today > term.end_date ? term.end_date : today;

  const entryStudents: GradeEntryStudent[] = roster.map((s) => {
    const existing = editDate && editType ? cell.get(`${s.id}|${editDate}~${editType}`) : undefined;
    return {
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      gradeId: existing?.id ?? null,
      score: existing ? Number(existing.score) : null,
      comment: existing?.comment ?? null,
      approved: existing?.status === "approved",
      attendance: editDate ? attended.get(`${s.id}|${editDate}`) ?? null : null,
    };
  });

  const average = (studentId: string) => {
    let weighted = 0;
    let weights = 0;
    for (const g of grades) {
      if (g.student_id !== studentId) continue;
      const type = typeById.get(g.assessment_type_id);
      if (!type || type.is_final) continue;
      weighted += (Number(g.score) / Number(g.max_score)) * Number(type.weight);
      weights += Number(type.weight);
    }
    return weights > 0 ? (weighted / weights) * 100 : null;
  };
  const base = `/teach/gradebook/${cs.id}?term=${term.id}`;

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={`${cs.className} · ${cs.subjectName}`} description={t("description")} />
      <TabNav label={t("terms")} items={terms.map((x) => ({ href: `/teach/gradebook/${cs.id}?term=${x.id}`, label: x.name, active: x.id === term.id }))} />
      {term.is_locked ? (
        <Alert tone="warning" className="mb-4" title={t("lockedTitle")}>
          <span className="inline-flex items-center gap-1.5"><Lock className="size-4" aria-hidden />{t("locked")}</span>
        </Alert>
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <Card>
          <CardHeader title={t("journal")} description={t("journalHint")} />
          <CardBody className="p-0">
            {roster.length === 0 ? (
              <EmptyState title={t("emptyRoster")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{t("journalCaption", { className: cs.className, subject: cs.subjectName, term: term.name })}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-muted/60">
                      <th scope="col" className="sticky left-0 z-10 min-w-48 bg-surface-muted px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("student")}</th>
                      {columnKeys.map((key) => {
                        const [date, typeId] = key.split("~") as [string, string];
                        const type = typeById.get(typeId);
                        return (
                          <th key={key} scope="col" className={cn("px-2 py-2 text-center align-bottom", key === editKey && "bg-brand-50")}>
                            <Link href={`${base}&column=${encodeURIComponent(key)}`} className="block rounded px-1 text-xs font-medium text-ink-secondary hover:text-brand-text hover:underline" aria-label={t("editColumn", { date: formatShortDate(date, locale), type: type ? pickName(type, locale) : "" })}>
                              <span className="block tabular">{formatShortDate(date, locale).slice(0, 5)}</span>
                              <span className="block max-w-16 truncate">{columnLabel.get(key) || type?.code || ""}</span>
                            </Link>
                          </th>
                        );
                      })}
                      <th scope="col" className="px-3 py-2 text-end text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("average")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {roster.map((s) => {
                      const avg = average(s.id);
                      return (
                        <tr key={s.id} className="hover:bg-surface-muted/40">
                          <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-start font-medium">{s.lastName} {s.firstName}</th>
                          {columnKeys.map((key) => {
                            const g = cell.get(`${s.id}|${key}`);
                            return (
                              <td key={key} className={cn("px-2 py-2 text-center tabular", key === editKey && "bg-brand-50/60")} title={g?.comment ?? undefined}>
                                {g ? (
                                  <span className={cn("font-semibold", toneClass[scoreTone(Number(g.score), Number(g.max_score))])}>
                                    {formatNumber(g.score, locale)}
                                    {g.status === "approved" ? <span className="sr-only"> ({t("approved")})</span> : null}
                                  </span>
                                ) : attended.get(`${s.id}|${key.split("~")[0]}`) &&
                                  ABSENCE_LETTER[attended.get(`${s.id}|${key.split("~")[0]}`)!] ? (
                                  <span
                                    className="font-semibold text-danger-700"
                                    title={t(`attendanceStatus.${attended.get(`${s.id}|${key.split("~")[0]}`)}`)}
                                  >
                                    {ABSENCE_LETTER[attended.get(`${s.id}|${key.split("~")[0]}`)!]}
                                  </span>
                                ) : (
                                  <span className="text-ink-muted" aria-label={t("noGrade")}>·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-end font-semibold tabular">{avg === null ? "—" : `${formatNumber(avg, locale)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {!term.is_locked && types.filter((x) => x.is_active).length > 0 ? (
          <Card>
            <CardHeader title={t("ruleColumn")} description={t("ruleColumnHint")} />
            <CardBody>
              <ActionForm action={ruleJournalColumnAction} className="space-y-3" resetOnSuccess>
                <input type="hidden" name="classSubjectId" value={cs.id} />
                <input type="hidden" name="academicTermId" value={term.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField name="date" type="date" label={t("date")} defaultValue={defaultDate} min={term.start_date} max={term.end_date} required />
                  <SelectField
                    name="assessmentTypeId"
                    label={t("assessmentType")}
                    required
                    options={types.filter((x) => x.is_active).map((x) => ({ value: x.id, label: pickName(x, locale) }))}
                  />
                </div>
                <TextField name="label" label={t("columnLabel")} maxLength={60} placeholder={t("columnLabelExample")} />
                <SubmitButton size="sm">{t("ruleColumn")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={editDate ? t("editTitle") : t("newTitle")}
            description={editDate ? t("editDescription") : t("newDescription")}
            actions={editDate ? <Link href={base} className={buttonClasses("ghost", "sm")}>{t("newColumn")}</Link> : null}
          />
          <CardBody>
            {types.filter((x) => x.is_active).length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noTypes")}</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("emptyRoster")}</p>
            ) : (
              <GradeEntryForm
                key={editKey ?? "new"}
                classSubjectId={cs.id}
                types={types.filter((x) => x.is_active || x.id === editType).map((x) => ({ id: x.id, label: pickName(x, locale), maxScore: Number(x.max_score) }))}
                students={entryStudents}
                initialTypeId={editType}
                initialDate={editDate ?? defaultDate}
                minDate={term.start_date}
                maxDate={term.end_date < today ? term.end_date : today}
                locked={term.is_locked}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
