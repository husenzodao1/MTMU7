import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarRange, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import {
  addStandardTermsAction,
  deleteTermAction,
  saveAcademicYearAction,
  saveTermAction,
  setTermLockAction,
  setYearStatusAction,
} from "@/features/admin/academic/structure-actions";
import { NewYearDialog, previewNewYear } from "@/features/admin/academic/new-year";
import { ConfirmAction, FormDialog } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatShortDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("academicYears") };
}

const TERM_KINDS = ["quarter", "semester", "trimester", "term", "exam_period", "holiday"] as const;

export default async function AcademicYearsPage() {
  const access = await requirePermission("academic_years.manage", "grades.approve");
  const t = await getTranslations("admin.years");
  const ts = await getTranslations("common.status");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const manage = can(access, "academic_years.manage");
  const supabase = await createClient();
  const { data: years } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_current, status, academic_terms(id, name, kind, start_date, end_date, is_locked, sort_order)")
    .eq("school_id", access.school!.id)
    .order("start_date", { ascending: false });

  // What moving up a year would do, read from the current year: shown before
  // anything happens, in the dialog that does it.
  const current = (years ?? []).find((y) => y.is_current) ?? null;
  const rollover = current && manage && can(access, "enrollments.manage") ? await previewNewYear(supabase, current) : null;

  const yearFields = (year?: { id: string; name: string; start_date: string; end_date: string; is_current: boolean }) => (
    <>
      {year ? <input type="hidden" name="id" value={year.id} /> : null}
      <TextField name="name" label={t("yearName")} hint={t("yearNameHint")} defaultValue={year?.name} required maxLength={50} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="startDate" type="date" label={t("startDate")} defaultValue={year?.start_date} required />
        <TextField name="endDate" type="date" label={t("endDate")} defaultValue={year?.end_date} required />
      </div>
      {!year?.is_current ? <Checkbox name="isCurrent" label={t("makeCurrent")} description={t("makeCurrentHint")} /> : null}
    </>
  );

  const termFields = (yearId: string, term?: { id: string; name: string; kind: string; start_date: string; end_date: string; sort_order: number }) => (
    <>
      <input type="hidden" name="academicYearId" value={yearId} />
      {term ? <input type="hidden" name="id" value={term.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="name" label={t("termName")} defaultValue={term?.name} required maxLength={100} />
        <SelectField name="kind" label={t("termKind")} defaultValue={term?.kind ?? "quarter"} options={TERM_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="startDate" type="date" label={t("startDate")} defaultValue={term?.start_date} required />
        <TextField name="endDate" type="date" label={t("endDate")} defaultValue={term?.end_date} required />
        <TextField name="sortOrder" type="number" min={0} max={100} label={t("order")} defaultValue={term?.sort_order ?? ""} />
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={manage ? (
          <span className="flex flex-wrap gap-2">
            {rollover ? <NewYearDialog preview={rollover} /> : null}
            <FormDialog
              action={saveAcademicYearAction}
              trigger={<Button variant={rollover ? "secondary" : "primary"}><Plus aria-hidden />{t("newYear")}</Button>}
              title={t("newYear")}
              submitLabel={tc("create")}
            >
              {yearFields()}
            </FormDialog>
          </span>
        ) : null}
      />
      {!years || years.length === 0 ? (
        <Card as="div"><EmptyState icon={<CalendarRange />} title={t("empty")} description={t("emptyHint")} /></Card>
      ) : (
        <div className="space-y-5">
          {years.map((year) => {
            const terms = [...(year.academic_terms ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order);
            return (
              <Card key={year.id} className={year.is_current ? "border-brand-300" : undefined}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {year.name}
                      {year.is_current ? <Badge tone="brand">{t("current")}</Badge> : null}
                      <StatusBadge status={year.status} label={ts(year.status as "active")} />
                    </span>
                  }
                  description={`${formatDate(year.start_date, locale)} — ${formatDate(year.end_date, locale)}`}
                  actions={manage ? (
                    <span className="flex flex-wrap gap-2">
                      {!year.is_current && year.status !== "closed" ? (
                        <ConfirmAction action={setYearStatusAction} fields={{ id: year.id, action: "current" }} title={t("makeCurrentTitle")} description={t("makeCurrentDescription", { name: year.name })} confirmLabel={t("makeCurrent")} tone="primary" trigger={<Button variant="secondary" size="sm">{t("makeCurrent")}</Button>} />
                      ) : null}
                      {year.status !== "closed" && !year.is_current ? (
                        <ConfirmAction action={setYearStatusAction} fields={{ id: year.id, action: "close" }} title={t("closeTitle")} description={t("closeDescription")} confirmLabel={t("close")} trigger={<Button variant="ghost" size="sm">{t("close")}</Button>} />
                      ) : null}
                      {year.status === "closed" ? (
                        <ConfirmAction action={setYearStatusAction} fields={{ id: year.id, action: "reopen" }} title={t("reopenTitle")} confirmLabel={t("reopen")} tone="primary" trigger={<Button variant="ghost" size="sm">{t("reopen")}</Button>} />
                      ) : null}
                      <FormDialog action={saveAcademicYearAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editYear", { name: year.name })}><Pencil aria-hidden /></Button>} title={t("editYearTitle")} submitLabel={tc("save")}>
                        {yearFields(year)}
                      </FormDialog>
                    </span>
                  ) : null}
                />
                <CardBody className="p-0">
                  {terms.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-ink-muted">{t("noTerms")}</p>
                  ) : (
                    // One row per term. On a phone the four columns fold into two lines —
                    // the name and its buttons, then the dates and the grading — so
                    // nothing hides off to the right; from a tablet up they line up
                    // under a header row as a table does.
                    <div>
                      <div aria-hidden className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.7fr)_7rem_auto] gap-x-3 border-y border-line bg-surface-muted/60 px-4 py-2 text-xs sm:px-5 uppercase tracking-wide text-ink-muted sm:grid">
                        <span>{t("termName")}</span>
                        <span>{t("termKind")}</span>
                        <span>{t("dates")}</span>
                        <span>{t("grading")}</span>
                        <span className="w-[6.5rem]" />
                      </div>
                      <ul aria-label={t("termsOf", { name: year.name })} className="divide-y divide-line border-t border-line text-sm sm:border-t-0">
                        {terms.map((term) => (
                          <li
                            key={term.id}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.7fr)_7rem_auto] sm:gap-y-0"
                          >
                            <p className="min-w-0 truncate font-medium text-ink">
                              {term.name}
                              <span className="font-normal text-ink-muted sm:hidden"> · {t(`kinds.${term.kind as "quarter"}`)}</span>
                            </p>
                            <span className="hidden text-ink-secondary sm:block">{t(`kinds.${term.kind as "quarter"}`)}</span>
                            <span className="col-start-1 row-start-2 whitespace-nowrap text-xs text-ink-muted tabular sm:col-start-auto sm:row-start-auto sm:whitespace-normal sm:text-sm sm:text-ink-secondary">
                              <span className="sm:hidden">
                                {formatShortDate(term.start_date, locale)} – {formatShortDate(term.end_date, locale)}
                              </span>
                              <span className="hidden sm:inline">
                                {formatDate(term.start_date, locale)} — {formatDate(term.end_date, locale)}
                              </span>
                            </span>
                            <span className="col-start-2 row-start-2 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-start">
                              {term.is_locked ? <Badge tone="warning"><Lock className="size-3" aria-hidden />{t("locked")}</Badge> : <Badge>{t("open")}</Badge>}
                            </span>
                            <span className="col-start-2 row-start-1 flex w-[6.5rem] justify-end gap-0.5 sm:col-start-auto sm:row-start-auto">
                              <ConfirmAction
                                action={setTermLockAction}
                                fields={{ id: term.id, locked: term.is_locked ? "false" : "true" }}
                                title={term.is_locked ? t("unlockTitle") : t("lockTitle")}
                                description={term.is_locked ? t("unlockDescription") : t("lockDescription")}
                                confirmLabel={term.is_locked ? t("unlock") : t("lock")}
                                tone={term.is_locked ? "primary" : "danger"}
                                trigger={<Button variant="ghost" size="icon-sm" aria-label={term.is_locked ? t("unlockNamed", { name: term.name }) : t("lockNamed", { name: term.name })}>{term.is_locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}</Button>}
                              />
                              {manage ? (
                                <>
                                  <FormDialog action={saveTermAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editTerm", { name: term.name })}><Pencil aria-hidden /></Button>} title={t("editTermTitle")} submitLabel={tc("save")} size="md">
                                    {termFields(year.id, term)}
                                  </FormDialog>
                                  <ConfirmAction action={deleteTermAction} fields={{ id: term.id }} title={t("deleteTermTitle")} description={t("deleteTermDescription")} confirmLabel={tc("delete")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("deleteTerm", { name: term.name })}><Trash2 aria-hidden /></Button>} />
                                </>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {manage && year.status !== "closed" ? (
                    <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
                      {terms.length === 0 ? (
                        <ConfirmAction
                          action={addStandardTermsAction}
                          fields={{ id: year.id }}
                          title={t("quarters.title")}
                          description={t("quarters.description")}
                          confirmLabel={t("quarters.confirm")}
                          tone="primary"
                          trigger={<Button size="sm"><CalendarRange aria-hidden />{t("quarters.button")}</Button>}
                        />
                      ) : null}
                      <FormDialog action={saveTermAction} trigger={<Button variant="secondary" size="sm"><Plus aria-hidden />{t("addTerm")}</Button>} title={t("addTerm")} description={t("addTermHint")} submitLabel={tc("create")} size="md">
                        {termFields(year.id)}
                      </FormDialog>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

