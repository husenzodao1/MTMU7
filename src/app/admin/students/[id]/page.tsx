import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyRound, UserMinus, UserPlus } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { GUARDIAN_RELATIONSHIPS, STUDENT_STATUSES } from "@/features/admin/people/schemas";
import { StudentForm } from "@/features/admin/people/student-form";
import {
  changeStudentStatusAction,
  createPersonInvitationAction,
  linkGuardianAction,
  transferStudentAction,
  unlinkGuardianAction,
} from "@/features/admin/people/student-actions";
import { fullName, getClassOptions } from "@/features/admin/queries";
import { ActionForm, ConfirmAction, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, todayIso } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminStudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("students.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const saved = firstValue((await searchParams).saved);
  const t = await getTranslations("admin.students");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const tr = await getTranslations("portal.children.relationship");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, school_id, user_id, student_number, first_name, last_name, middle_name, gender, date_of_birth, admission_date, status, status_changed_at, address, phone, notes, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!student || student.school_id !== schoolId) notFound();

  const canGuardians = can(access, "guardians.view") || can(access, "guardians.manage");
  const [{ data: enrollments }, guardianLinks, guardianOptions, classes, { data: account }, { data: invitations }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, enrolled_on, left_on, reason, classes(id, name), academic_years(name)")
      .eq("student_id", id)
      .order("enrolled_on", { ascending: false }),
    canGuardians
      ? supabase.from("student_guardians").select("relationship, is_primary, guardians(id, first_name, last_name, middle_name, phone, user_id)").eq("student_id", id)
      : Promise.resolve({ data: [] }),
    can(access, "guardians.manage")
      ? supabase.from("guardians").select("id, first_name, last_name, middle_name, phone").eq("school_id", schoolId).eq("status", "active").order("last_name").limit(2000)
      : Promise.resolve({ data: [] }),
    can(access, "enrollments.manage") ? getClassOptions(schoolId) : Promise.resolve([]),
    student.user_id ? supabase.from("users").select("id, public_id, status").eq("id", student.user_id).maybeSingle() : Promise.resolve({ data: null }),
    can(access, "invitations.manage") && !student.user_id
      ? supabase.from("invitation_codes").select("id, code, expires_at, used_count, max_uses, is_active").eq("person_type", "student").eq("person_id", id).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const active = (enrollments ?? []).find((e) => e.status === "active");
  const activeClass = active?.classes as { id: string; name: string } | null | undefined;
  const links = (guardianLinks.data ?? []) as Array<{ relationship: string; is_primary: boolean; guardians: { id: string; first_name: string; last_name: string; middle_name: string | null; phone: string | null; user_id: string | null } | null }>;
  const linkedIds = new Set(links.map((l) => l.guardians?.id));
  const name = fullName(student);
  const today = todayIso(timeZone);
  const openInvitation = (invitations ?? []).find((i) => i.is_active && i.used_count < i.max_uses && (!i.expires_at || i.expires_at > new Date().toISOString()));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/students" }, { label: name }]} />}
        title={name}
        description={[student.student_number, activeClass ? tp("classValue", { name: activeClass.name }) : t("withoutClass")].filter(Boolean).join(" · ")}
        meta={<StatusBadge status={student.status} label={ts(student.status)} />}
        actions={
          can(access, "students.archive") ? (
            <FormDialog
              action={changeStudentStatusAction}
              trigger={<Button variant="secondary">{t("changeStatus")}</Button>}
              title={t("changeStatus")}
              description={t("changeStatusHint")}
              submitLabel={t("applyStatus")}
            >
              <input type="hidden" name="studentId" value={student.id} />
              <SelectField name="status" label={tp("status")} defaultValue={student.status} options={STUDENT_STATUSES.map((s) => ({ value: s, label: ts(s) }))} />
              <TextField name="effectiveDate" type="date" label={t("effectiveDate")} defaultValue={today} max={today} />
              <TextAreaField name="reason" label={t("reason")} hint={t("reasonHint")} rows={3} maxLength={500} />
            </FormDialog>
          ) : null
        }
      />
      {saved === "created" ? <Alert tone="success" className="mb-4">{t("created")}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader title={tp("profile")} />
          <CardBody>
            <StudentForm
              readOnly={!can(access, "students.update")}
              student={{
                id: student.id,
                lastName: student.last_name,
                firstName: student.first_name,
                middleName: student.middle_name,
                gender: student.gender,
                dateOfBirth: student.date_of_birth,
                studentNumber: student.student_number,
                admissionDate: student.admission_date,
                phone: student.phone,
                address: student.address,
                notes: student.notes,
              }}
            />
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t("enrollment")} />
            <CardBody className="space-y-4">
              <DescriptionList
                items={[
                  { term: tp("class"), description: activeClass ? <Link className="text-brand-700 hover:underline" href={`/admin/classes/${activeClass.id}`}>{activeClass.name}</Link> : t("withoutClass") },
                  { term: t("enrolledOn"), description: active ? formatDate(active.enrolled_on, locale) : "—" },
                ]}
              />
              {can(access, "enrollments.manage") && student.status === "active" ? (
                <ActionForm action={transferStudentAction} className="space-y-3 border-t border-line pt-4">
                  <input type="hidden" name="studentId" value={student.id} />
                  <SelectField name="classId" label={activeClass ? t("transferTo") : t("enrollIn")} placeholder={t("chooseClass")} options={classes.filter((c) => c.value !== activeClass?.id).map(({ value, label }) => ({ value, label }))} required />
                  <TextField name="reason" label={t("reason")} maxLength={500} />
                  <SubmitButton variant="secondary">{activeClass ? t("transfer") : t("enroll")}</SubmitButton>
                </ActionForm>
              ) : null}
              {(enrollments ?? []).length > 0 ? (
                <details className="border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink">{t("history")}</summary>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(enrollments ?? []).map((e) => (
                      <li key={e.id} className="flex flex-wrap justify-between gap-2">
                        <span>
                          {(e.classes as { name: string } | null)?.name} · {(e.academic_years as { name: string } | null)?.name}
                          <span className="block text-xs text-ink-muted">{formatDate(e.enrolled_on, locale)} — {e.left_on ? formatDate(e.left_on, locale) : t("present")}</span>
                        </span>
                        <StatusBadge status={e.status} label={ts(e.status)} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardBody>
          </Card>

          {canGuardians ? (
            <Card>
              <CardHeader
                title={t("guardians")}
                actions={can(access, "guardians.manage") ? (
                  <FormDialog action={linkGuardianAction} trigger={<Button variant="secondary" size="sm"><UserPlus aria-hidden />{t("addGuardian")}</Button>} title={t("addGuardian")} description={t("addGuardianHint")} submitLabel={t("link")} size="md">
                    <input type="hidden" name="studentId" value={student.id} />
                    <SelectField name="relationship" label={t("relationship")} defaultValue="guardian" options={GUARDIAN_RELATIONSHIPS.map((r) => ({ value: r, label: tr(r) }))} />
                    <SelectField
                      name="guardianId"
                      label={t("existingGuardian")}
                      placeholder={t("newGuardianOption")}
                      options={(guardianOptions.data ?? []).filter((g) => !linkedIds.has(g.id)).map((g) => ({ value: g.id, label: `${fullName(g)}${g.phone ? ` · ${g.phone}` : ""}` }))}
                    />
                    <fieldset className="space-y-3 rounded-md border border-line p-3">
                      <legend className="px-1 text-sm font-medium">{t("newGuardian")}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField name="lastName" label={tp("lastName")} maxLength={100} />
                        <TextField name="firstName" label={tp("firstName")} maxLength={100} />
                        <TextField name="middleName" label={tp("middleName")} maxLength={100} />
                        <TextField name="phone" type="tel" label={tp("phone")} maxLength={50} />
                      </div>
                      <TextField name="email" type="email" label={tp("email")} maxLength={255} />
                    </fieldset>
                    <Checkbox name="isPrimary" label={t("primaryContact")} />
                  </FormDialog>
                ) : null}
              />
              <CardBody>
                {links.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("noGuardians")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {links.map((link) => link.guardians ? (
                      <li key={link.guardians.id} className="flex items-start justify-between gap-2 py-2.5">
                        <span className="min-w-0">
                          <span className="block font-medium">{fullName(link.guardians)}</span>
                          <span className="block text-sm text-ink-muted">
                            {tr(link.relationship as (typeof GUARDIAN_RELATIONSHIPS)[number])}
                            {link.guardians.phone ? ` · ${link.guardians.phone}` : ""}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {link.is_primary ? <Badge tone="brand">{t("primaryContact")}</Badge> : null}
                            {link.guardians.user_id ? <Badge tone="success">{t("accountLinked")}</Badge> : null}
                          </span>
                        </span>
                        {can(access, "guardians.manage") ? (
                          <ConfirmAction
                            action={unlinkGuardianAction}
                            fields={{ studentId: student.id, guardianId: link.guardians.id }}
                            title={t("unlinkTitle")}
                            description={t("unlinkDescription", { name: fullName(link.guardians) })}
                            confirmLabel={t("unlink")}
                            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("unlinkNamed", { name: fullName(link.guardians) })}><UserMinus aria-hidden /></Button>}
                          />
                        ) : null}
                      </li>
                    ) : null)}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("account")} />
            <CardBody className="space-y-3">
              {account ? (
                <>
                  <p className="text-sm">{t("accountLinkedHint", { id: account.public_id })}</p>
                  {can(access, "users.view") ? <Link href={`/admin/users/${account.id}`} className="text-sm font-medium text-brand-700 hover:underline">{t("openAccount")}</Link> : null}
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-secondary">{t("accountNoneHint")}</p>
                  {openInvitation ? (
                    <div className="rounded-md border border-line bg-surface-muted/50 p-3">
                      <p className="text-xs text-ink-muted">{t("invitationCode")}</p>
                      <p className="font-mono text-lg font-semibold tracking-widest">{openInvitation.code}</p>
                      {openInvitation.expires_at ? <p className="text-xs text-ink-muted">{t("validUntil", { date: formatDateTime(openInvitation.expires_at, locale, timeZone) })}</p> : null}
                    </div>
                  ) : null}
                  {can(access, "invitations.manage") ? (
                    <ActionForm action={createPersonInvitationAction}>
                      <input type="hidden" name="personType" value="student" />
                      <input type="hidden" name="personId" value={student.id} />
                      <input type="hidden" name="roleSlug" value="student" />
                      <input type="hidden" name="returnTo" value={`/admin/students/${student.id}`} />
                      <SubmitButton variant="secondary" size="sm"><KeyRound aria-hidden />{openInvitation ? t("newInvitation") : t("createInvitation")}</SubmitButton>
                    </ActionForm>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
