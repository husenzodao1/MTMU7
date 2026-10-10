import { getTranslations } from "next-intl/server";
import { SelectField, TextField } from "@/components/ui/fields";

export interface ClassFieldValues {
  id: string;
  name: string;
  grade_level: number;
  shift: number;
  capacity: number | null;
  homeroom_staff_id: string | null;
  room_id: string | null;
}

/** Shared class form fields (used in dialogs and on the class page). */
export async function ClassFields({
  academicYearId,
  values,
  staff,
  rooms,
}: {
  academicYearId: string;
  values?: ClassFieldValues;
  staff: Array<{ value: string; label: string }>;
  rooms: Array<{ value: string; label: string }>;
}) {
  const t = await getTranslations("admin.classes");
  return (
    <>
      <input type="hidden" name="academicYearId" value={academicYearId} />
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="name" label={t("name")} hint={t("nameHint")} defaultValue={values?.name} required maxLength={20} />
        <SelectField name="gradeLevel" label={t("gradeLevel")} defaultValue={String(values?.grade_level ?? 1)} options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        <SelectField name="shift" label={t("shift")} defaultValue={String(values?.shift ?? 1)} options={[1, 2].map((s) => ({ value: String(s), label: t("shiftValue", { shift: s }) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField name="homeroomStaffId" label={t("homeroom")} defaultValue={values?.homeroom_staff_id ?? ""} placeholder={t("notAssigned")} options={staff} />
        <SelectField name="roomId" label={t("room")} defaultValue={values?.room_id ?? ""} placeholder={t("notAssigned")} options={rooms} />
        <TextField name="capacity" type="number" min={1} max={60} label={t("capacity")} defaultValue={values?.capacity ?? ""} />
      </div>
    </>
  );
}
