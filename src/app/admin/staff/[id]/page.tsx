import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyRound } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { STAFF_STATUSES } from "@/features/admin/people/schemas";
import { setStaffStatusAction } from "@/features/admin/people/staff-actions";
import { StaffForm } from "@/features/admin/people/staff-form";
import { createPersonInvitationAction } from "@/features/admin/people/student-actions";
import { fullName } from "@/features/admin/queries";
import { ActionForm, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/fields";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

const ROLE_FOR_TYPE: Record<string, string> = { teacher: "teacher", director: "director", vice_principal: "vice_principal", librarian: "librarian" };

export default async function AdminStaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("staff.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const saved = firstValue((await searchParams).saved);
  const t = await getTranslations("admin.staff");
  const ts = await getTranslations("common.status");
  const tp = await getTranslations("admin.people");
  const tStudents = await getTranslations("admin.students");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, school_id, user_id, employee_number, first_name, last_name, middle_name, gender, date_of_birth, staff_type, position, qualification, hire_date, phone, email, max_weekly_hours, status")
    .eq("id", id)
    .maybeSingle();
  if (!staff || staff.school_id !== access.school!.id) notFound();

  const [{ data: assignments }, { data: homerooms }, { data: account }, { data: invitations }] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id, weekly_hours, classes!inner(id, name, grade_level, is_active, academic_years!inner(is_current)), subjects(name_tg, name_ru, name_en)")
      .eq("teacher_id", id)
      .eq("is_active", true)
      .eq("classes.academic_years.is_current", true),
    supabase.from("classes").select("id, name, academic_years!inner(is_current)").eq("homeroom_staff_id", id).eq("academic_years.is_current", true),
    staff.user_id ? supabase.from("users").select("id, public_id").eq("id", staff.user_id).maybeSingle() : Promise.resolve({ data: null }),
    can(access, "invitations.manage") && !staff.user_id
      ? supabase.from("invitation_codes").select("id, code, expires_at, used_count, max_uses, is_active").eq("person_type", "staff").eq("person_id", id).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const totalHours = (assignments ?? []).reduce((sum, a) => sum + Number(a.weekly_hours ?? 0), 0);
  const name = fullName(staff);
  const openInvitation = (invitations ?? []).find((i) => i.is_active && i.used_count < i.max_uses && (!i.expires_at || i.expires_at > new Date().toISOString()));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/staff" }, { label: name }]} />}
        title={name}
        description={[t(`types.${staff.staff_type as "teacher"}`), staff.position].filter(Boolean).join(" · ")}
        meta={<StatusBadge status={staff.status} label={ts(staff.status)} />}
        actions={can(access, "staff.archive") ? (
          <FormDialog action={setStaffStatusAction} trigger={<Button variant="secondary">{t("changeStatus")}</Button>} title={t("changeStatus")} submitLabel={tStudents("applyStatus")}>
            <input type="hidden" name="id" value={staff.id} />
            <SelectField name="status" label={tp("status")} defaultValue={staff.status} options={STAFF_STATUSES.map((s) => ({ value: s, label: ts(s) }))} />
          </FormDialog>
        ) : null}
      />
      {saved === "created" ? <Alert tone="success" className="mb-4">{t("created")}</Alert> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader title={tp("profile")} />
          <CardBody>
            <StaffForm
              readOnly={!can(access, "staff.update")}
              staff={{
                id: staff.id,
                lastName: staff.last_name,
                firstName: staff.first_name,
                middleName: staff.middle_name,
                gender: staff.gender,
                dateOfBirth: staff.date_of_birth,
                staffType: staff.staff_type,
                position: staff.position,
                qualification: staff.qualification,
                employeeNumber: staff.employee_number,
                hireDate: staff.hire_date,
                phone: staff.phone,
                email: staff.email,
                maxWeeklyHours: staff.max_weekly_hours === null ? null : Number(staff.max_weekly_hours),
              }}
            />
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("teaching")} description={t("teachingHours", { hours: totalHours, max: staff.max_weekly_hours ?? "—" })} />
            <CardBody>
              {(homerooms ?? []).length > 0 ? (
                <p className="mb-3 text-sm">
                  {t("homeroomOf")}{" "}
                  {(homerooms ?? []).map((c, i) => (
                    <span key={c.id}>{i > 0 ? ", " : ""}<Link href={`/admin/classes/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link></span>
                  ))}
                </p>
              ) : null}
              {(assignments ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noAssignments")}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {(assignments ?? []).map((a) => {
                    const klass = a.classes as unknown as { id: string; name: string };
                    const subject = a.subjects as { name_tg: string; name_ru: string | null; name_en: string | null } | null;
                    return (
                      <li key={a.id} className="flex justify-between gap-2 py-2">
                        <Link href={`/admin/classes/${klass.id}`} className="hover:text-brand-700 hover:underline">{klass.name} · {subject ? pickName(subject, locale) : ""}</Link>
                        <span className="text-ink-muted tabular">{a.weekly_hours ?? "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("account")} />
            <CardBody className="space-y-3">
              {account ? (
                <>
                  <p className="text-sm">{tStudents("accountLinkedHint", { id: account.public_id })}</p>
                  {can(access, "users.view") ? <Link href={`/admin/users/${account.id}`} className="text-sm font-medium text-brand-700 hover:underline">{tStudents("openAccount")}</Link> : null}
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-secondary">{t("accountNoneHint")}</p>
                  {openInvitation ? (
                    <div className="rounded-md border border-line bg-surface-muted/50 p-3">
                      <p className="text-xs text-ink-muted">{tStudents("invitationCode")}</p>
                      <p className="font-mono text-lg font-semibold tracking-widest">{openInvitation.code}</p>
                      {openInvitation.expires_at ? <p className="text-xs text-ink-muted">{tStudents("validUntil", { date: formatDateTime(openInvitation.expires_at, locale, access.school!.timezone) })}</p> : null}
                    </div>
                  ) : null}
                  {can(access, "invitations.manage") ? (
                    <ActionForm action={createPersonInvitationAction}>
                      <input type="hidden" name="personType" value="staff" />
                      <input type="hidden" name="personId" value={staff.id} />
                      <input type="hidden" name="roleSlug" value={ROLE_FOR_TYPE[staff.staff_type] ?? "staff"} />
                      <input type="hidden" name="returnTo" value={`/admin/staff/${staff.id}`} />
                      <SubmitButton variant="secondary" size="sm"><KeyRound aria-hidden />{openInvitation ? tStudents("newInvitation") : tStudents("createInvitation")}</SubmitButton>
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
