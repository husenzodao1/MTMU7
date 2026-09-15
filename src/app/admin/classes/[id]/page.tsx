import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { ClassFields } from "@/features/admin/academic/class-fields";
import {
  enrollStudentsAction,
  promoteStudentsAction,
  removeClassSubjectAction,
  saveClassAction,
  saveClassSubjectAction,
  setClassActiveAction,
} from "@/features/admin/academic/structure-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName, getStaffOptions } from "@/features/admin/queries";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("classes.view", "classes.update", "enrollments.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const saved = firstValue((await searchParams).saved);
  const t = await getTranslations("admin.classes");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, school_id, academic_year_id, name, grade_level, shift, capacity, homeroom_staff_id, room_id, is_active, academic_years(name, is_current)")
    .eq("id", id)
    .maybeSingle();
  if (!klass || klass.school_id !== schoolId) notFound();

  const [{ data: enrollments }, { data: classSubjects }, { data: subjects }, staff, { data: rooms }, { data: otherYearClasses }, { data: unassigned }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, enrolled_on, students(id, first_name, last_name, middle_name, student_number, status)")
      .eq("class_id", id)
      .eq("status", "active"),
    supabase
      .from("class_subjects")
      .select("id, subject_id, teacher_id, weekly_hours, is_active, subjects(name_tg, name_ru, name_en)")
      .eq("class_id", id)
      .eq("is_active", true),
    supabase.from("subjects").select("id, name_tg, name_ru, name_en").eq("school_id", schoolId).eq("is_active", true).order("name_tg"),
    getStaffOptions(schoolId),
    supabase.from("rooms").select("id, name").eq("school_id", schoolId).eq("is_active", true).order("name"),
    supabase
      .from("classes")
      .select("id, name, grade_level, academic_years!inner(name, start_date)")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .neq("academic_year_id", klass.academic_year_id)
      .order("grade_level"),
    can(access, "enrollments.manage")
      ? supabase
          .from("students")
          .select("id, first_name, last_name, middle_name, enrollments(status, academic_year_id)")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .eq("enrollments.status", "active")
          .eq("enrollments.academic_year_id", klass.academic_year_id)
          .is("enrollments", null)
          .order("last_name")
          .limit(300)
      : Promise.resolve({ data: [] }),
  ]);

  const students = (enrollments ?? [])
    .map((e) => e.students as { id: string; first_name: string; last_name: string; middle_name: string | null; student_number: string | null; status: string } | null)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const staffOptions = staff.map(({ value, label }) => ({ value, label }));
  const usedSubjects = new Set((classSubjects ?? []).map((cs) => cs.subject_id));
  const year = klass.academic_years as { name: string; is_current: boolean } | null;
  const update = can(access, "classes.update");
  const manageEnrollment = can(access, "enrollments.manage");
  const totalHours = (classSubjects ?? []).reduce((sum, cs) => sum + Number(cs.weekly_hours ?? 0), 0);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/classes" }, { label: klass.name }]} />}
        title={t("classTitle", { name: klass.name })}
        description={[year?.name, t("studentsCount", { count: students.length })].filter(Boolean).join(" · ")}
        meta={!klass.is_active ? <Badge>{tc("status.archived")}</Badge> : null}
        actions={can(access, "classes.archive") ? (
          <ConfirmAction
            action={setClassActiveAction}
            fields={{ id: klass.id, active: klass.is_active ? "false" : "true" }}
            title={klass.is_active ? t("archiveTitle") : t("restoreTitle")}
            description={klass.is_active ? t("archiveDescription") : undefined}
            confirmLabel={klass.is_active ? tc("archive") : tc("restore")}
            tone={klass.is_active ? "danger" : "primary"}
            trigger={<Button variant="secondary">{klass.is_active ? tc("archive") : tc("restore")}</Button>}
          />
        ) : null}
      />
      {saved === "created" ? <Alert tone="success" className="mb-4">{t("created")}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("details")} />
          <CardBody>
            <ActionForm action={saveClassAction} className="space-y-4">
              <fieldset disabled={!update} className="space-y-4">
                <ClassFields academicYearId={klass.academic_year_id} values={klass} staff={staffOptions} rooms={(rooms ?? []).map((r) => ({ value: r.id, label: r.name }))} />
              </fieldset>
              {update ? <SubmitButton variant="secondary">{tc("saveChanges")}</SubmitButton> : null}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("subjects")} description={t("hoursTotal", { hours: totalHours })} />
          <CardBody className="space-y-4">
            {(classSubjects ?? []).length === 0 ? <p className="text-sm text-ink-muted">{t("noSubjects")}</p> : null}
            <ul className="divide-y divide-line">
              {(classSubjects ?? []).map((cs) => {
                const subject = cs.subjects as { name_tg: string; name_ru: string | null; name_en: string | null } | null;
                const subjectName = subject ? pickName(subject, locale) : "";
                return (
                  <li key={cs.id} className="py-3">
                    <ActionForm action={saveClassSubjectAction} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_5rem_auto]">
                      <input type="hidden" name="id" value={cs.id} />
                      <input type="hidden" name="classId" value={klass.id} />
                      <p className="self-center font-medium">{subjectName}</p>
                      <SelectField name="teacherId" id={`teacher-${cs.id}`} label={t("teacher")} defaultValue={cs.teacher_id ?? ""} placeholder={t("notAssigned")} options={staffOptions} disabled={!update} />
                      <TextField name="weeklyHours" id={`hours-${cs.id}`} inputMode="decimal" label={t("hours")} defaultValue={cs.weekly_hours ?? ""} disabled={!update} />
                      {update ? (
                        <span className="flex gap-1">
                          <SubmitButton variant="secondary" size="sm">{tc("save")}</SubmitButton>
                        </span>
                      ) : null}
                    </ActionForm>
                    {update ? (
                      <div className="mt-1 flex justify-end">
                        <ConfirmAction action={removeClassSubjectAction} fields={{ id: cs.id, classId: klass.id }} title={t("removeSubjectTitle")} description={t("removeSubjectDescription", { subject: subjectName })} confirmLabel={tc("remove")} trigger={<Button variant="ghost" size="sm"><Trash2 aria-hidden />{t("removeSubject")}</Button>} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {update ? (
              <ActionForm action={saveClassSubjectAction} className="grid items-end gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_12rem_5rem_auto]">
                <input type="hidden" name="classId" value={klass.id} />
                <SelectField name="subjectId" id="new-subject" label={t("addSubject")} placeholder={t("chooseSubject")} options={(subjects ?? []).filter((s) => !usedSubjects.has(s.id)).map((s) => ({ value: s.id, label: pickName(s, locale) }))} />
                <SelectField name="teacherId" id="new-teacher" label={t("teacher")} placeholder={t("notAssigned")} options={staffOptions} />
                <TextField name="weeklyHours" id="new-hours" inputMode="decimal" label={t("hours")} />
                <SubmitButton size="sm">{tc("add")}</SubmitButton>
              </ActionForm>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("roster")} description={klass.capacity ? t("capacityUse", { count: students.length, capacity: klass.capacity }) : undefined} />
          <CardBody>
            {students.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noStudents")}</p>
            ) : (
              <ol className="grid gap-x-6 sm:grid-cols-2">
                {students.map((s, index) => (
                  <li key={s.id} className="flex gap-2 border-b border-line py-1.5 text-sm">
                    <span className="w-6 text-end text-ink-muted tabular">{index + 1}</span>
                    <Link href={`/admin/students/${s.id}`} className="hover:text-brand-700 hover:underline">{fullName(s)}</Link>
                  </li>
                ))}
              </ol>
            )}
            {manageEnrollment && klass.is_active && (unassigned ?? []).length > 0 ? (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium">{t("enrollUnassigned", { count: (unassigned ?? []).length })}</summary>
                <ActionForm action={enrollStudentsAction} className="mt-3 space-y-3">
                  <input type="hidden" name="classId" value={klass.id} />
                  <div className="max-h-64 overflow-y-auto rounded-md border border-line px-3">
                    {(unassigned ?? []).map((s) => (
                      <Checkbox key={s.id} name="studentId" value={s.id} label={fullName(s)} />
                    ))}
                  </div>
                  <SubmitButton variant="secondary" size="sm">{t("enrollSelected")}</SubmitButton>
                </ActionForm>
              </details>
            ) : null}
          </CardBody>
        </Card>

        {manageEnrollment && students.length > 0 ? (
          <Card>
            <CardHeader title={t("promote")} description={t("promoteHint")} />
            <CardBody>
              {(otherYearClasses ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">{t("promoteNoTarget")}</p>
              ) : (
                <ActionForm action={promoteStudentsAction} className="space-y-3">
                  <input type="hidden" name="fromClassId" value={klass.id} />
                  <SelectField
                    name="toClassId"
                    label={t("promoteTo")}
                    placeholder={t("chooseClass")}
                    required
                    options={(otherYearClasses ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${(c.academic_years as unknown as { name: string }).name}` }))}
                  />
                  <fieldset className="max-h-64 overflow-y-auto rounded-md border border-line px-3">
                    <legend className="sr-only">{t("promoteStudents")}</legend>
                    {students.map((s) => (
                      <Checkbox key={s.id} name="studentId" value={s.id} defaultChecked label={fullName(s)} />
                    ))}
                  </fieldset>
                  <SubmitButton variant="secondary">{t("promoteSubmit")}</SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
