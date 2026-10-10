import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { updateSchoolSettingsAction } from "@/features/admin/management/actions";
import { getSchoolRoles } from "@/features/admin/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { Card, CardBody, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("settings") };
}

const SELF_SERVICE_ROLES = ["student", "parent", "teacher", "staff", "librarian"] as const;

export default async function SchoolSettingsPage() {
  const access = await requirePermission("settings.update");
  const t = await getTranslations("admin.settings");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [{ data: school }, roles] = await Promise.all([
    supabase.from("schools").select("settings").eq("id", access.school!.id).maybeSingle(),
    getSchoolRoles(access.school!.id),
  ]);
  const settings = (school?.settings && typeof school.settings === "object" && !Array.isArray(school.settings) ? school.settings : {}) as Record<string, unknown>;
  const registrationRoles = Array.isArray(settings.registration_roles) ? (settings.registration_roles as string[]) : ["student", "teacher", "parent"];
  const roleName = new Map(roles.map((r) => [r.slug, pickName(r, locale)]));

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <Card className="max-w-3xl">
        <CardBody>
          <ActionForm action={updateSchoolSettingsAction} className="space-y-6">
            <Fieldset legend={t("registration")} description={t("registrationHint")}>
              <Checkbox name="registrationOpen" defaultChecked={settings.registration_open !== false} label={t("registrationOpen")} description={t("registrationOpenHint")} />
              <fieldset>
                <legend className="text-sm font-medium">{t("selfServiceRoles")}</legend>
                <p className="mb-1 text-xs text-ink-muted">{t("selfServiceRolesHint")}</p>
                <div className="grid sm:grid-cols-2">
                  {SELF_SERVICE_ROLES.map((slug) => (
                    <Checkbox key={slug} name="registrationRoles" value={slug} defaultChecked={registrationRoles.includes(slug)} label={roleName.get(slug) ?? slug} />
                  ))}
                </div>
              </fieldset>
            </Fieldset>
            <Fieldset legend={t("messaging")} description={t("messagingHint")}>
              <Checkbox name="studentToStudent" defaultChecked={settings.messaging_student_to_student !== false} label={t("studentToStudent")} description={t("studentToStudentHint")} />
              <Checkbox name="studentsCreateGroups" defaultChecked={settings.messaging_students_create_groups === true} label={t("studentsCreateGroups")} />
            </Fieldset>
            <Fieldset legend={t("attendance")}>
              <TextField
                name="attendanceCorrectionDays"
                type="number"
                min={0}
                max={60}
                label={t("correctionDays")}
                hint={t("correctionDaysHint")}
                defaultValue={typeof settings.attendance_correction_days === "number" ? settings.attendance_correction_days : 7}
                required
              />
            </Fieldset>
            <SubmitButton>{tc("saveChanges")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
