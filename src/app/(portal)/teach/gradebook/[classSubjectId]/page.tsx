import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/fields";
import { JournalGrid, type JournalColumn, type JournalRow } from "@/features/teach/journal-grid";
import { LessonTopics, type LessonTopic } from "@/features/teach/lesson-topics";
import { ruleJournalColumnAction } from "@/features/teach/journal-actions";
import { getClassSubjectContext, getRoster, getTermsForYear } from "@/features/teach/queries";
import { TabNav } from "@/components/ui/misc";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatShortDate, todayIso } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

/**
 * The class register, laid out as the printed one is: the subject at the top,
 * pupils down the left, dates written vertically across the marks page, and the
 * topics of the lessons on the facing page.
 *
 * Every date here was typed by the teacher. Nothing is taken from the timetable:
 * a register records the lessons that happened, and a lesson that was cancelled
 * has no column.
 */
export default async function GradebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ classSubjectId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const access = await requirePermission("grades.enter", "grades.update", "grades.view");
  const { classSubjectId } = await params;
  const query = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("teach.gradebook");
  const tt = await getTranslations("teach");
  const cs = await getClassSubjectContext(classSubjectId, locale);
  if (!cs) notFound();

  const today = todayIso(access.school!.timezone);
  const terms = await getTermsForYear(cs.academicYearId);
  const termParam = firstValue(query.term);
  const term = terms.find((x) => x.id === termParam) ?? terms.find((x) => x.start_date <= today && x.end_date >= today) ?? terms[0];

  const breadcrumb = (
    <Breadcrumb
      label={tt("breadcrumb")}
      items={[
        { label: tt("title"), href: "/teach" },
        { label: t("title"), href: "/teach/gradebook" },
        { label: `${cs.className} · ${cs.subjectName}` },
      ]}
    />
  );
  if (!term) {
    return (
      <>
        <PageHeader breadcrumb={breadcrumb} title={`${cs.className} · ${cs.subjectName}`} />
        <Card as="div">
          <EmptyState title={t("noTerms")} description={t("noTermsHint")} />
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const [roster, { data: gradeRows }, { data: typeRows }, { data: columnRows }, { data: attendanceRows }, { data: topicRows }] =
    await Promise.all([
      getRoster(cs.classId, term.start_date, term.end_date),
      supabase
        .from("grades")
        .select("student_id, assessment_type_id, score, max_score, grade_date, status")
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
        .select("column_date, assessment_type_id, label, kind")
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
      supabase
        .from("lesson_topics")
        .select("lesson_date, topic, homework")
        .eq("class_subject_id", classSubjectId)
        .gte("lesson_date", term.start_date)
        .lte("lesson_date", term.end_date)
        .order("lesson_date"),
    ]);

  const grades = gradeRows ?? [];
  const types = typeRows ?? [];
  const typeById = new Map(types.map((type) => [type.id, type]));
  const activeTypes = types.filter((type) => type.is_active);

  // The columns the teacher ruled, plus any a mark implies: a mark entered
  // before a column existed must never drop out of the register.
  const ruled = columnRows ?? [];
  const ruledByKey = new Map(ruled.map((c) => [`${c.column_date}~${c.assessment_type_id}`, c]));
  const keys = [
    ...new Set([
      ...ruled.map((c) => `${c.column_date}~${c.assessment_type_id}`),
      ...grades.map((g) => `${g.grade_date}~${g.assessment_type_id}`),
    ]),
  ].sort();

  const absenceLetter: Record<string, string> = {
    absent: t("absence.absent"),
    late: t("absence.late"),
    excused: t("absence.excused"),
  };

  const columns: JournalColumn[] = keys.map((key) => {
    const [date, typeId] = key.split("~") as [string, string];
    const ruledColumn = ruledByKey.get(key);
    const type = typeById.get(typeId);
    const kind = ruledColumn?.kind === "term" ? "term" : "lesson";
    return {
      key,
      date,
      typeId,
      heading: kind === "term" ? (ruledColumn?.label ?? t("termColumn")) : formatShortDate(date, locale),
      kind,
      title: [formatShortDate(date, locale), ruledColumn?.label, type ? pickName(type, locale) : null].filter(Boolean).join(" · "),
    };
  });

  const markAt = new Map(grades.map((g) => [`${g.student_id}|${g.grade_date}~${g.assessment_type_id}`, g]));
  const absenceAt = new Map((attendanceRows ?? []).map((r) => [`${r.student_id}|${r.attendance_date}`, r.status]));

  const rows: JournalRow[] = roster.map((student) => {
    const cells: Record<string, string> = {};
    for (const column of columns) {
      const mark = markAt.get(`${student.id}|${column.key}`);
      if (mark) {
        cells[column.key] = String(Number(mark.score));
        continue;
      }
      const absence = absenceAt.get(`${student.id}|${column.date}`);
      cells[column.key] = absence ? absenceLetter[absence] ?? "" : "";
    }

    // The running average excludes the quarter marks: those are a verdict on
    // the term, not part of what is being averaged.
    let weighted = 0;
    let weights = 0;
    for (const g of grades) {
      if (g.student_id !== student.id) continue;
      const type = typeById.get(g.assessment_type_id);
      if (!type || type.is_final) continue;
      weighted += (Number(g.score) / Number(g.max_score)) * Number(type.weight);
      weights += Number(type.weight);
    }

    return {
      id: student.id,
      name: `${student.lastName} ${student.firstName}`,
      cells,
      average: weights > 0 ? Math.round((weighted / weights) * 1000) / 10 : null,
    };
  });

  const topics: LessonTopic[] = (topicRows ?? []).map((row) => ({
    date: row.lesson_date,
    shortDate: formatShortDate(row.lesson_date, locale),
    topic: row.topic,
    homework: row.homework,
  }));

  const mayWrite = can(access, "grades.enter") || can(access, "grades.update");
  const defaultDate = today < term.start_date ? term.start_date : today > term.end_date ? term.end_date : today;

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={`${cs.className} · ${cs.subjectName}`} description={t("description")} />
      <TabNav
        label={t("terms")}
        items={terms.map((x) => ({ href: `/teach/gradebook/${cs.id}?term=${x.id}`, label: x.name, active: x.id === term.id }))}
      />
      {term.is_locked ? (
        <Alert tone="warning" className="mb-4" title={t("lockedTitle")}>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-4" aria-hidden />
            {t("locked")}
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <CardHeader title={`${t("journal")} · ${cs.subjectName}`} description={t("journalHint")} />
          <CardBody>
            {roster.length === 0 ? (
              <EmptyState title={t("emptyRoster")} />
            ) : (
              <JournalGrid
                classSubjectId={cs.id}
                academicTermId={term.id}
                columns={columns}
                rows={rows}
                locked={term.is_locked}
                readOnly={!mayWrite}
              />
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          {mayWrite && !term.is_locked && activeTypes.length > 0 ? (
            <Card>
              <CardHeader title={t("ruleColumn")} description={t("ruleColumnHint")} />
              <CardBody>
                <ActionForm action={ruleJournalColumnAction} className="space-y-3" resetOnSuccess>
                  <input type="hidden" name="classSubjectId" value={cs.id} />
                  <input type="hidden" name="academicTermId" value={term.id} />
                  <input type="hidden" name="kind" value="lesson" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      name="date"
                      type="date"
                      label={t("date")}
                      defaultValue={defaultDate}
                      min={term.start_date}
                      max={term.end_date}
                      required
                    />
                    <SelectField
                      name="assessmentTypeId"
                      label={t("assessmentType")}
                      options={activeTypes.map((x) => ({ value: x.id, label: pickName(x, locale) }))}
                    />
                  </div>
                  <SubmitButton size="sm">{t("ruleColumn")}</SubmitButton>
                </ActionForm>

                {/* The last columns of a register are the quarter marks, headed
                    «Чоряки I» rather than a day in May. */}
                <ActionForm action={ruleJournalColumnAction} className="mt-4 space-y-3 border-t border-line pt-4" resetOnSuccess>
                  <input type="hidden" name="classSubjectId" value={cs.id} />
                  <input type="hidden" name="academicTermId" value={term.id} />
                  <input type="hidden" name="kind" value="term" />
                  <TextField name="label" label={t("termColumnLabel")} hint={t("termColumnHint")} maxLength={60} defaultValue={term.name} required />
                  <SubmitButton size="sm" variant="secondary">
                    {t("ruleTermColumn")}
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("topics")} description={t("topicsHint")} />
            <CardBody>
              <LessonTopics
                classSubjectId={cs.id}
                academicTermId={term.id}
                topics={topics}
                defaultDate={defaultDate}
                readOnly={!mayWrite || term.is_locked}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
