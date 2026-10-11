"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);
const checkbox = z.string().optional().transform((v) => v === "on");
const optionalInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), "validation.invalid_value");

async function session(permission: Parameters<typeof can>[1]) {
  const access = await getAccess();
  if (!access?.school) return { error: done(failure("errors.not_authenticated")) } as const;
  if (!can(access, permission)) return { error: done(failure("errors.forbidden")) } as const;
  return { access, school: access.school, supabase: await createClient() } as const;
}

const uniqueViolation = (field: string) => failure("errors.validation", { [field]: ["validation.duplicateName"] });

// ---------------------------------------------------------------------------
// Classes
//
// 1А … 11Д exist by themselves (00086) and a class with no pupils is not
// shown, so classes are never made or archived by hand. What can be set on
// one is its class teacher and the shift it studies in.
// ---------------------------------------------------------------------------

export async function setClassTeacherAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("classes.update");
  if ("error" in s) return s.error!;
  const parsed = z.object({ classId: uuid, staffId: optionalUuid }).safeParse({ classId: formData.get("classId"), staffId: formData.get("staffId") ?? "" });
  if (!parsed.success) return done(failure("errors.invalid"));
  const { data: klass } = await s.supabase.from("classes").select("academic_year_id").eq("id", parsed.data.classId).maybeSingle();
  if (!klass) return done(failure("errors.not_found"));
  if (parsed.data.staffId) {
    // One class per class teacher: the class they led until now lets them go.
    await s.supabase
      .from("classes")
      .update({ homeroom_staff_id: null })
      .eq("academic_year_id", klass.academic_year_id)
      .eq("homeroom_staff_id", parsed.data.staffId)
      .neq("id", parsed.data.classId);
  }
  const { error } = await s.supabase.from("classes").update({ homeroom_staff_id: parsed.data.staffId }).eq("id", parsed.data.classId);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  return done(success("common.saved"));
}

export async function setClassShiftAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "classes.update") && !can(access, "timetable.manage")) return done(failure("errors.forbidden"));
  const parsed = z.object({ classId: uuid, shift: z.coerce.number().int().min(1).max(2) }).safeParse({ classId: formData.get("classId"), shift: formData.get("shift") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_class_shift", { p_class_id: parsed.data.classId, p_shift: parsed.data.shift });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  revalidatePath("/admin/timetable", "layout");
  revalidatePath("/schedule");
  return done(success("common.saved"));
}

/** A pupil to another class this year: a transfer, so the class they left stays on their record. */
export async function moveStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("enrollments.manage");
  if ("error" in s) return s.error!;
  const parsed = z.object({ studentId: uuid, toClassId: uuid }).safeParse({ studentId: formData.get("studentId"), toClassId: formData.get("toClassId") });
  if (!parsed.success) return done(failure("errors.validation", { toClassId: ["validation.required"] }));
  const { error } = await s.supabase.rpc("transfer_student_class", { p_student_id: parsed.data.studentId, p_to_class_id: parsed.data.toClassId });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  revalidatePath("/admin/accounts", "layout");
  return done(success("admin.classes.moved"));
}

/** A pupil who leaves the school: their place ends today, their record stays, their login stops working. */
export async function removeStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "students.archive") && !can(access, "students.update")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({ studentId: uuid, reason: z.string().trim().max(500).optional().transform((v) => v || null) })
    .safeParse({ studentId: formData.get("studentId"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_student", { p_student: parsed.data.studentId, p_reason: parsed.data.reason ?? undefined });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  revalidatePath("/admin/accounts", "layout");
  return done(success("admin.classes.removedFromSchool"));
}

// ---------------------------------------------------------------------------
// Subjects and rooms
// ---------------------------------------------------------------------------
const subjectSchema = z.object({
  id: optionalUuid,
  nameTg: z.string().trim().min(1, "validation.required").max(200, "validation.too_big"),
  // The Russian and English names and the code are the platform's (00087);
  // a name typed here by hand is kept instead.
  nameRu: z.string().trim().max(200).optional().transform((v) => v || null),
});

export async function saveSubjectAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("subjects.manage");
  if ("error" in s) return s.error!;
  const input = parseInput(subjectSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const row = v.id ? { name_tg: v.nameTg, ...(v.nameRu ? { name_ru: v.nameRu } : {}) } : { name_tg: v.nameTg };
  const { error } = v.id
    ? await s.supabase.from("subjects").update(row).eq("id", v.id)
    : await s.supabase.from("subjects").insert({ ...row, school_id: s.school.id });
  if (error) return done(error.code === "23505" ? uniqueViolation("nameTg") : mapDbError(error));
  revalidatePath("/admin/subjects");
  return done(success(v.id ? "common.saved" : "common.created"));
}

export async function setSubjectActiveAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("subjects.manage");
  if ("error" in s) return s.error!;
  const parsed = z.object({ id: uuid, active: z.enum(["true", "false"]) }).safeParse({ id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const active = parsed.data.active === "true";
  const { error } = await s.supabase.from("subjects").update({ is_active: active, deactivated_at: active ? null : new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/subjects");
  return done(success(active ? "common.saved" : "common.archived"));
}

const ROOM_TYPES = ["classroom", "laboratory", "computer_lab", "gym", "library", "hall", "workshop", "other"] as const;

export async function saveRoomAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "timetable.manage") && !can(access, "classes.update")) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      id: optionalUuid,
      name: z.string().trim().min(1, "validation.required").max(50, "validation.too_big"),
      code: z.string().trim().max(20).optional().transform((v) => v || null),
      roomType: z.enum(ROOM_TYPES),
      capacity: optionalInt(1, 2000),
      isActive: checkbox,
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const row = { name: v.name, code: v.code, room_type: v.roomType, capacity: v.capacity, is_active: v.id ? v.isActive : true };
  const { error } = v.id ? await supabase.from("rooms").update(row).eq("id", v.id) : await supabase.from("rooms").insert({ ...row, school_id: access.school.id });
  if (error) return done(error.code === "23505" ? uniqueViolation("name") : mapDbError(error));
  revalidatePath("/admin/timetable", "layout");
  return done(success(v.id ? "common.saved" : "common.created"));
}
