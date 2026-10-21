"use client";

import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Fieldset } from "@/components/ui/form-controls";
import { createStudentAction, updateStudentAction } from "@/features/admin/people/student-actions";

export interface StudentFormValues {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  studentNumber: string | null;
  admissionDate: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export function StudentForm({ student, classes, readOnly }: { student: StudentFormValues | null; classes?: Array<{ value: string; label: string }>; readOnly?: boolean }) {
  const t = useTranslations("admin.people");
  const tc = useTranslations("common");
  return (
    <ActionForm action={student ? updateStudentAction : createStudentAction} className="space-y-5">
      {student ? <input type="hidden" name="id" value={student.id} /> : null}
      <fieldset disabled={readOnly} className="space-y-5">
        <Fieldset legend={t("identity")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="lastName" label={t("lastName")} defaultValue={student?.lastName} required maxLength={100} autoComplete="off" />
            <TextField name="firstName" label={t("firstName")} defaultValue={student?.firstName} required maxLength={100} autoComplete="off" />
            <TextField name="middleName" label={t("middleName")} defaultValue={student?.middleName ?? ""} maxLength={100} autoComplete="off" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              name="gender"
              label={t("gender")}
              defaultValue={student?.gender ?? ""}
              placeholder={tc("notSet")}
              options={[{ value: "male", label: tc("genders.male") }, { value: "female", label: tc("genders.female") }]}
            />
            <TextField name="dateOfBirth" type="date" label={t("dateOfBirth")} defaultValue={student?.dateOfBirth ?? ""} />
            <TextField name="studentNumber" label={t("studentNumber")} defaultValue={student?.studentNumber ?? ""} maxLength={32} />
          </div>
        </Fieldset>
        <Fieldset legend={t("schooling")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="admissionDate" type="date" label={t("admissionDate")} defaultValue={student?.admissionDate ?? ""} />
            {!student && classes ? <SelectField name="classId" label={t("class")} placeholder={t("noClass")} options={classes} /> : null}
          </div>
        </Fieldset>
        <Fieldset legend={t("contact")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="phone" type="tel" label={t("phone")} defaultValue={student?.phone ?? ""} maxLength={50} />
            <TextField name="address" label={t("address")} defaultValue={student?.address ?? ""} maxLength={500} />
          </div>
          <TextAreaField name="notes" label={t("notes")} hint={t("notesHint")} defaultValue={student?.notes ?? ""} rows={3} maxLength={2000} />
        </Fieldset>
      </fieldset>
      {!readOnly ? <SubmitButton>{student ? tc("saveChanges") : t("createStudent")}</SubmitButton> : null}
    </ActionForm>
  );
}
