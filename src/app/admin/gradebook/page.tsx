import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck, Pencil, Plus } from "lucide-react";
import { approveGradesAction, saveAssessmentTypeAction } from "@/features/admin/academic/grading-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions, getCurrentYear } from "@/features/admin/queries";
import { ActionForm, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Checkbox } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatNumber, formatShortDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("gradebook") };
}

type Named = { name_tg: string; name_ru: string | null; name_en: string | null };

export default async function AdminGradebookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("grades.approve", "grades.update", "assessments.manage");
  const t = await getTranslations("admin.gradebook");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const schoolId = access.school!.id;
  const tabs = [
    ...(can(access, "grades.approve") ? (["approvals"] as const) : []),
    "classes" as const,
    ...(can(access, "assessments.manage") ? (["types"] as const) : []),
  ];
  const tabRaw = firstValue(params.tab);
  const tab = tabs.find((x) => x === tabRaw) ?? tabs[0]!;
  const supabase = await createClient();
  const [classes, year] = await Promise.all([getClassOptions(schoolId), getCurrentYear(schoolId)]);

  const header = (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav label={t("sections")} items={tabs.map((key) => ({ href: `/admin/gradebook?tab=${key}`, label: t(`tabs.${key}`), active: key === tab }))} />
    </>
  );

  if (tab === "types") {
    const { data: types } = await supabase.from("assessment_types").select("id, code, name_tg, name_ru, name_en, weight, max_score, is_final, is_active, sort_order").eq("school_id", schoolId).order("sort_order");
    const fields = (type?: NonNullable<typeof types>[number]) => (
      <>
        {type ? <input type="hidden" name="id" value={type.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="code" label={t("code")} hint={t("codeHint")} defaultValue={type?.code} required maxLength={32} />
          <TextField name="sortOrder" type="number" min={0} max={100} label={t("order")} defaultValue={type?.sort_order ?? 0} />
        </div>
        <TextField name="nameTg" label={t("nameTg")} defaultValue={type?.name_tg} required maxLength={100} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="nameRu" label={t("nameRu")} defaultValue={type?.name_ru ?? ""} maxLength={100} />
          <TextField name="nameEn" label={t("nameEn")} defaultValue={type?.name_en ?? ""} maxLength={100} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="weight" inputMode="decimal" label={t("weight")} hint={t("weightHint")} defaultValue={type ? String(type.weight) : "1"} required />
          <TextField name="maxScore" inputMode="decimal" label={t("maxScore")} defaultValue={type ? String(type.max_score) : "5"} required />
        </div>
        <Checkbox name="isFinal" defaultChecked={type?.is_final} label={t("isFinal")} description={t("isFinalHint")} />
        {type ? <Checkbox name="isActive" defaultChecked={type.is_active} label={t("isActive")} /> : null}
      </>
    );
    return (
      <>
        {header}
        <Card>
          <CardHeader title={t("typesTitle")} description={t("typesHint")} actions={<FormDialog action={saveAssessmentTypeAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newType")}</Button>} title={t("newType")} submitLabel={tc("create")} size="md">{fields()}</FormDialog>} />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {(types ?? []).map((type) => (
                <li key={type.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span>
                    <span className="font-medium">{pickName(type, locale)}</span> <span className="font-mono text-xs text-ink-muted">{type.code}</span>
                    <span className="block text-sm text-ink-muted">{t("typeSummary", { weight: formatNumber(type.weight, locale), max: formatNumber(type.max_score, locale) })}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {type.is_final ? <Badge tone="brand">{t("final")}</Badge> : null}
                    {!type.is_active ? <Badge>{tc("status.inactive")}</Badge> : null}
                    <FormDialog action={saveAssessmentTypeAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editType", { name: pickName(type, locale) })}><Pencil aria-hidden /></Button>} title={t("editTypeTitle")} submitLabel={tc("save")} size="md">{fields(type)}</FormDialog>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </>
    );
  }

  if (tab === "classes") {
    const classParam = firstValue(params.class);
    const classId = classes.find((c) => c.value === classParam)?.value;
    const { data: classSubjects } = classId
      ? await supabase.from("class_subjects").select("id, subjects(name_tg, name_ru, name_en), staff:teacher_id(last_name, first_name)").eq("class_id", classId).eq("is_active", true)
      : { data: [] };
    return (
      <>
        {header}
        <FilterBar filters={[{ name: "class", label: t("class"), emptyLabel: t("chooseClass"), options: classes.map(({ value, label }) => ({ value, label })) }]} />
        {!classId ? (
          <Card as="div"><EmptyState icon={<ClipboardCheck />} title={t("chooseClassHint")} /></Card>
        ) : (
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {(classSubjects ?? []).map((cs) => {
                  const subject = cs.subjects as Named | null;
                  const teacher = cs.staff as unknown as { last_name: string; first_name: string } | null;
                  return (
                    <li key={cs.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <span>
                        <span className="font-medium">{subject ? pickName(subject, locale) : ""}</span>
                        <span className="block text-sm text-ink-muted">{teacher ? `${teacher.last_name} ${teacher.first_name}` : t("noTeacher")}</span>
                      </span>
                      <Link href={`/teach/gradebook/${cs.id}`} className={buttonClasses("secondary", "sm")}>{t("openJournal")}</Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        )}
      </>
    );
  }

  // Approvals of final grades (current academic year).
  const classParam = firstValue(params.class);
  const classId = classes.find((c) => c.value === classParam)?.value;
  let query = supabase
    .from("grades")
    .select("id, score, max_score, grade_date, students(first_name, last_name), assessment_types!inner(name_tg, name_ru, name_en, is_final), class_subjects!inner(class_id, classes!inner(name, academic_year_id), subjects(name_tg, name_ru, name_en)), academic_terms(name)")
    .eq("school_id", schoolId)
    .eq("status", "recorded")
    .eq("assessment_types.is_final", true)
    .order("grade_date", { ascending: false })
    .limit(300);
  if (year) query = query.eq("class_subjects.classes.academic_year_id", year.id);
  if (classId) query = query.eq("class_subjects.class_id", classId);
  const { data: pending } = await query;

  return (
    <>
      {header}
      <FilterBar filters={[{ name: "class", label: t("class"), options: classes.map(({ value, label }) => ({ value, label })) }]} />
      {!pending || pending.length === 0 ? (
        <Card as="div"><EmptyState icon={<ClipboardCheck />} title={t("nothingToApprove")} /></Card>
      ) : (
        <ActionForm action={approveGradesAction}>
          <Card>
            <CardHeader title={t("pendingFinals", { count: pending.length })} description={t("pendingFinalsHint")} actions={<SubmitButton name="decision" value="approve" size="sm">{t("approveSelected")}</SubmitButton>} />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("pendingFinals", { count: pending.length })}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="w-10 px-4 py-2"><span className="sr-only">{t("select")}</span></th>
                      <th scope="col" className="px-4 py-2 text-start">{t("student")}</th>
                      <th scope="col" className="px-4 py-2 text-start">{t("class")}</th>
                      <th scope="col" className="px-4 py-2 text-start">{t("subject")}</th>
                      <th scope="col" className="px-4 py-2 text-start">{t("assessment")}</th>
                      <th scope="col" className="px-4 py-2 text-end">{t("score")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pending.map((g) => {
                      const student = g.students as { first_name: string; last_name: string } | null;
                      const cs = g.class_subjects as unknown as { classes: { name: string }; subjects: Named | null };
                      const type = g.assessment_types as unknown as Named;
                      const studentName = student ? `${student.last_name} ${student.first_name}` : "";
                      return (
                        <tr key={g.id}>
                          <td className="px-4 py-2"><input type="checkbox" name="gradeId" value={g.id} defaultChecked className="size-4 accent-brand-600" aria-label={t("selectGrade", { name: studentName })} /></td>
                          <th scope="row" className="px-4 py-2 text-start font-medium">{studentName}</th>
                          <td className="px-4 py-2">{cs.classes.name}</td>
                          <td className="px-4 py-2">{cs.subjects ? pickName(cs.subjects, locale) : ""}</td>
                          <td className="px-4 py-2">{pickName(type, locale)}{(g.academic_terms as { name: string } | null)?.name ? ` · ${(g.academic_terms as { name: string }).name}` : ""}<span className="block text-xs text-ink-muted">{formatShortDate(g.grade_date, locale)}</span></td>
                          <td className="px-4 py-2 text-end font-semibold tabular">{formatNumber(g.score, locale)} / {formatNumber(g.max_score, locale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </ActionForm>
      )}
    </>
  );
}
