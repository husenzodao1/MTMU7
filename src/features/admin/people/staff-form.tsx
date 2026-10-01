"use client";

import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Fieldset } from "@/components/ui/form-controls";
import { STAFF_TYPES } from "@/features/admin/people/schemas";
import { createStaffAction, updateStaffAction } from "@/features/admin/people/staff-actions";

export interface StaffFormValues {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  staffType: string;
  position: string | null;
  qualification: string | null;
  employeeNumber: string | null;
  hireDate: string | null;
  phone: string | null;
  email: string | null;
  maxWeeklyHours: number | null;
}

export function StaffForm({ staff, readOnly }: { staff: StaffFormValues | null; readOnly?: boolean }) {
  const t = useTranslations("admin.people");
  const tc = useTranslations("common");
  const types = useTranslations("admin.staff.types");
  return (
    <ActionForm action={staff ? updateStaffAction : createStaffAction} className="space-y-5">
      {staff ? <input type="hidden" name="id" value={staff.id} /> : null}
      <fieldset disabled={readOnly} className="space-y-5">
        <Fieldset legend={t("identity")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="lastName" label={t("lastName")} defaultValue={staff?.lastName} required maxLength={100} autoComplete="off" />
            <TextField name="firstName" label={t("firstName")} defaultValue={staff?.firstName} required maxLength={100} autoComplete="off" />
            <TextField name="middleName" label={t("middleName")} defaultValue={staff?.middleName ?? ""} maxLength={100} autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField name="gender" label={t("gender")} defaultValue={staff?.gender ?? ""} placeholder={tc("notSet")} options={[{ value: "male", label: tc("genders.male") }, { value: "female", label: tc("genders.female") }]} />
            <TextField name="dateOfBirth" type="date" label={t("dateOfBirth")} defaultValue={staff?.dateOfBirth ?? ""} />
            <TextField name="employeeNumber" label={t("employeeNumber")} defaultValue={staff?.employeeNumber ?? ""} maxLength={32} />
          </div>
        </Fieldset>
        <Fieldset legend={t("employment")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField name="staffType" label={t("staffType")} defaultValue={staff?.staffType ?? "teacher"} options={STAFF_TYPES.map((value) => ({ value, label: types(value) }))} />
            <TextField name="position" label={t("position")} defaultValue={staff?.position ?? ""} maxLength={200} />
            <TextField name="hireDate" type="date" label={t("hireDate")} defaultValue={staff?.hireDate ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="maxWeeklyHours" inputMode="decimal" label={t("maxWeeklyHours")} defaultValue={staff?.maxWeeklyHours ?? ""} />
          </div>
          <TextAreaField name="qualification" label={t("qualification")} defaultValue={staff?.qualification ?? ""} rows={3} maxLength={2000} />
        </Fieldset>
        <Fieldset legend={t("contact")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="phone" type="tel" label={t("phone")} defaultValue={staff?.phone ?? ""} maxLength={50} />
            <TextField name="email" type="email" label={t("email")} defaultValue={staff?.email ?? ""} maxLength={255} />
          </div>
        </Fieldset>
      </fieldset>
      {!readOnly ? <SubmitButton>{staff ? tc("saveChanges") : t("createStaff")}</SubmitButton> : null}
    </ActionForm>
  );
}
