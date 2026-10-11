import "server-only";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, BookOpen, CalendarRange, GraduationCap, Plus, Sparkles } from "lucide-react";
import { startNewYearAction } from "@/features/admin/academic/structure-actions";
import { FormDialog } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import type { createClient } from "@/lib/supabase/server";

export interface NewYearPreview {
  name: string;
  start: string;
  end: string;
  moving: Array<{ from: string; to: string; pupils: number }>;
  movingPupils: number;
  leaving: string[];
  leavingPupils: number;
  firstForms: string[];
  terms: number;
  subjects: number;
}

/**
 * "Move to the new year": what will happen, in a few short lines, above the
 * name and dates of the new year (already filled in) and the two things that
 * can be left out. One press does it all (start_new_school_year).
 */
export async function NewYearDialog({ preview }: { preview: NewYearPreview }) {
  const t = await getTranslations("admin.years");
  return (
    <FormDialog
      action={startNewYearAction}
      trigger={<Button><Sparkles aria-hidden />{t("rollover.button")}</Button>}
      title={t("rollover.title")}
      description={t("rollover.description")}
      submitLabel={t("rollover.submit")}
      size="md"
    >
      <div className="rounded-lg border border-line bg-surface-muted/50 px-3 py-2.5 text-xs text-ink-secondary">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">{t("rollover.whatHappens")}</p>
        <ul className="mt-1.5 space-y-1">
          <li className="flex items-start gap-2">
            <ArrowUpRight className="mt-px size-3.5 shrink-0 text-brand-text" aria-hidden />
            {t("rollover.moving", { classes: preview.moving.length, pupils: preview.movingPupils })}
          </li>
          {preview.leaving.length > 0 ? (
            <li className="flex items-start gap-2">
              <GraduationCap className="mt-px size-3.5 shrink-0 text-brand-text" aria-hidden />
              {t("rollover.leaving", { classes: preview.leaving.join(", "), pupils: preview.leavingPupils })}
            </li>
          ) : null}
          <li className="flex items-start gap-2">
            <Plus className="mt-px size-3.5 shrink-0 text-brand-text" aria-hidden />
            {t("rollover.firstForms", { classes: preview.firstForms.join(", ") })}
          </li>
          <li className="flex items-start gap-2">
            <CalendarRange className="mt-px size-3.5 shrink-0 text-brand-text" aria-hidden />
            {preview.terms > 0 ? t("rollover.termsCopied", { count: preview.terms }) : t("rollover.termsStandard")}
          </li>
          <li className="flex items-start gap-2">
            <BookOpen className="mt-px size-3.5 shrink-0 text-brand-text" aria-hidden />
            {t("rollover.subjects", { count: preview.subjects })}
          </li>
        </ul>
        {preview.moving.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-[0.6875rem] font-medium text-brand-text">{t("rollover.classList")}</summary>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 tabular sm:grid-cols-3">
              {preview.moving.map((m) => (
                <li key={m.from} className="whitespace-nowrap">
                  {m.from} → <span className="font-medium text-ink">{m.to}</span>
                  <span className="text-ink-muted"> · {m.pupils}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <TextField name="name" label={t("yearName")} defaultValue={preview.name} required maxLength={50} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="startDate" type="date" label={t("startDate")} defaultValue={preview.start} required />
        <TextField name="endDate" type="date" label={t("endDate")} defaultValue={preview.end} required />
      </div>
      <div className="space-y-0.5">
        <Checkbox name="terms" defaultChecked label={t("rollover.optTerms")} description={t("rollover.optTermsHint")} />
        <Checkbox name="subjects" defaultChecked label={t("rollover.optSubjects")} description={t("rollover.optSubjectsHint")} />
      </div>
    </FormDialog>
  );
}

/** "2026-2027" → "2027-2028"; any other name gets the years after the current one's start. */
function nextYearName(name: string, start: string): string {
  const match = /^\s*(\d{4})\s*[-–—/]\s*(\d{4})\s*$/.exec(name);
  if (match) return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
  const year = Number(start.slice(0, 4)) + 1;
  return `${year}-${year + 1}`;
}

const plusYear = (iso: string) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;

/**
 * What start_new_school_year will do, worked out the same way it does it:
 * 5А becomes 6А, the eleventh form leaves, the first forms start again.
 */
export async function previewNewYear(
  supabase: Awaited<ReturnType<typeof createClient>>,
  current: { id: string; name: string; start_date: string; end_date: string; academic_terms: unknown[] | null }
): Promise<NewYearPreview> {
  const [{ data: classes }, { count: subjects }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, grade_level, enrollments(count)")
      .eq("academic_year_id", current.id)
      .eq("is_active", true)
      .eq("enrollments.status", "active")
      .order("grade_level")
      .order("name"),
    supabase
      .from("class_subjects")
      .select("id, classes!inner(academic_year_id)", { count: "exact", head: true })
      .eq("classes.academic_year_id", current.id)
      .eq("is_active", true),
  ]);
  const rows = (classes ?? []).map((c) => ({
    name: c.name,
    grade: c.grade_level,
    pupils: (c.enrollments as unknown as Array<{ count: number }> | null)?.[0]?.count ?? 0,
  }));
  const letter = (name: string) => name.replace(/^\s*\d+/, "");
  const moving = rows.filter((c) => c.grade < 11).map((c) => ({ from: c.name, to: `${c.grade + 1}${letter(c.name)}`, pupils: c.pupils }));
  const leavers = rows.filter((c) => c.grade >= 11);
  const firstForms = rows.filter((c) => c.grade === 1).map((c) => `1${letter(c.name)}`);
  return {
    name: nextYearName(current.name, current.start_date),
    start: plusYear(current.start_date),
    end: plusYear(current.end_date),
    moving,
    movingPupils: moving.reduce((sum, m) => sum + m.pupils, 0),
    leaving: leavers.map((c) => c.name),
    leavingPupils: leavers.reduce((sum, c) => sum + c.pupils, 0),
    firstForms: firstForms.length > 0 ? firstForms : ["1А"],
    terms: (current.academic_terms ?? []).length,
    subjects: subjects ?? 0,
  };
}
