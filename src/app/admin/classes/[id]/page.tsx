import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRightLeft, FileDown, UserMinus } from "lucide-react";
import {
  moveStudentAction,
  removeStudentAction,
  setClassShiftAction,
  setClassTeacherAction,
} from "@/features/admin/academic/structure-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName, getClassOptions, getStaffOptions } from "@/features/admin/queries";
import { compareClassNames } from "@/features/academic/class-order";
import { ActionForm, ConfirmAction, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { SelectField } from "@/components/ui/fields";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can, hasModule } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

type Person = { first_name: string; last_name: string; middle_name: string | null };

/**
 * One class: its pupils, each of whom can be moved to another class or taken
 * out of the school, its class teacher and its shift. The subjects and who
 * teaches them come from the timetable and are only listed here.
 */
export default async function AdminClassPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("classes.view", "classes.update", "enrollments.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin.classes");
  const tr = await getTranslations("reportCard");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, school_id, academic_year_id, name, grade_level, shift, homeroom_staff_id, academic_years(name)")
    .eq("id", id)
    .maybeSingle();
  if (!klass || klass.school_id !== schoolId) notFound();

  const [{ data: enrollments }, { data: classSubjects }, staff, classes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, students(id, user_id, first_name, last_name, middle_name, users:user_id(public_id))")
      .eq("class_id", id)
      .eq("status", "active"),
    supabase
      .from("class_subjects")
      .select("id, group_label, subjects(name_tg, name_ru, name_en), staff:teacher_id(first_name, last_name, middle_name, employee_number)")
      .eq("class_id", id)
      .eq("is_active", true),
    getStaffOptions(schoolId),
    getClassOptions(schoolId, klass.academic_year_id),
  ]);

  const students = (enrollments ?? [])
    .map((e) => e.students as unknown as (Person & { id: string; user_id: string | null; users: { public_id: string } | null }) | null)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const year = klass.academic_years as { name: string } | null;
  const homeroom = staff.find((s) => s.value === klass.homeroom_staff_id);
  const update = can(access, "classes.update");
  const manage = can(access, "enrollments.manage");
  const remove = can(access, "students.archive") || can(access, "students.update");
  const otherClasses = classes
    .filter((c) => c.value !== klass.id)
    .sort((a, b) => compareClassNames(a.label, b.label))
    .map((c) => ({ value: c.value, label: c.label }));
  const subjects = (classSubjects ?? [])
    .map((cs) => {
      const subject = cs.subjects as { name_tg: string; name_ru: string | null; name_en: string | null } | null;
      const teacher = cs.staff as unknown as (Person & { employee_number: string | null }) | null;
      return {
        id: cs.id,
        subject: `${subject ? pickName(subject, locale) : ""}${cs.group_label ? ` · ${t("group", { group: cs.group_label })}` : ""}`,
        teacher: teacher ? `${fullName(teacher)}${teacher.employee_number ? ` (${teacher.employee_number})` : ""}` : null,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject, locale));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/classes" }, { label: klass.name }]} />}
        title={t("classTitle", { name: klass.name })}
        description={[year?.name, t("studentsCount", { count: students.length }), t("shiftValue", { shift: klass.shift })].filter(Boolean).join(" · ")}
        actions={
          hasModule(access, "grades") && students.length > 0 ? (
            <a href={`/report-cards?class=${klass.id}`} download className={buttonClasses("secondary")}>
              <FileDown aria-hidden />
              {tr("classButton")}
            </a>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title={t("roster")} description={t("rosterHint")} />
          <CardBody className="p-0">
            {students.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-muted">{t("noStudents")}</p>
            ) : (
              <ol className="divide-y divide-line">
                {students.map((s, index) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
                    <span className="w-6 text-end text-sm text-ink-muted tabular">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      {s.user_id ? (
                        <Link href={`/admin/accounts/${s.user_id}`} className="font-medium hover:text-brand-text hover:underline">{fullName(s)}</Link>
                      ) : (
                        <span className="font-medium">{fullName(s)}</span>
                      )}
                      {s.users?.public_id ? <span className="ms-2 font-mono text-xs text-ink-muted">{s.users.public_id}</span> : null}
                    </span>
                    <span className="flex gap-1">
                      {manage ? (
                        <FormDialog
                          action={moveStudentAction}
                          trigger={<Button variant="ghost" size="sm"><ArrowRightLeft aria-hidden />{t("move")}</Button>}
                          title={t("moveTitle", { name: fullName(s) })}
                          description={t("moveHint")}
                          submitLabel={t("move")}
                        >
                          <input type="hidden" name="studentId" value={s.id} />
                          <SelectField name="toClassId" label={t("moveTo")} placeholder={t("chooseClass")} required options={otherClasses} />
                        </FormDialog>
                      ) : null}
                      {remove ? (
                        <ConfirmAction
                          action={removeStudentAction}
                          fields={{ studentId: s.id }}
                          title={t("removeTitle", { name: fullName(s) })}
                          description={t("removeHint")}
                          confirmLabel={t("remove")}
                          trigger={<Button variant="ghost" size="sm" className="text-danger-700"><UserMinus aria-hidden />{t("remove")}</Button>}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t("homeroom")} description={homeroom ? undefined : t("homeroomHint")} />
            <CardBody className="space-y-3">
              {homeroom ? <p className="font-medium">{homeroom.label}</p> : <Badge tone="warning">{t("notAssigned")}</Badge>}
              {update ? (
                <ActionForm action={setClassTeacherAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="classId" value={klass.id} />
                  <div className="min-w-0 flex-1">
                    <SelectField
                      name="staffId"
                      label={t("changeHomeroom")}
                      defaultValue={klass.homeroom_staff_id ?? ""}
                      placeholder={t("notAssigned")}
                      options={staff.filter((s) => s.type === "teacher" || s.value === klass.homeroom_staff_id).map(({ value, label }) => ({ value, label }))}
                    />
                  </div>
                  <SubmitButton variant="secondary" size="sm">{tc("save")}</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("shiftTitle")} description={t("shiftHint")} />
            <CardBody>
              {update || can(access, "timetable.manage") ? (
                <ActionForm action={setClassShiftAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="classId" value={klass.id} />
                  <div className="min-w-0 flex-1">
                    <SelectField
                      name="shift"
                      label={t("shift")}
                      defaultValue={String(klass.shift)}
                      options={[1, 2].map((shift) => ({ value: String(shift), label: t("shiftValue", { shift }) }))}
                    />
                  </div>
                  <SubmitButton variant="secondary" size="sm">{tc("save")}</SubmitButton>
                </ActionForm>
              ) : (
                <p>{t("shiftValue", { shift: klass.shift })}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("subjects")}
              description={t("subjectsFromTimetable")}
              actions={can(access, "timetable.manage") ? <Link href={`/admin/timetable?class=${klass.id}`} className={buttonClasses("ghost", "sm")}>{t("openTimetable")}</Link> : null}
            />
            <CardBody className="p-0">
              {subjects.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-muted">{t("noSubjects")}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {subjects.map((row) => (
                    <li key={row.id} className="px-5 py-2">
                      <span className="block font-medium">{row.subject}</span>
                      <span className="block text-ink-muted">{row.teacher ?? t("noTeacher")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
