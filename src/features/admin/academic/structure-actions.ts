"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date");
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
// Academic years and terms
// ---------------------------------------------------------------------------
const yearSchema = z
  .object({ id: optionalUuid, name: z.string().trim().min(4, "validation.too_small").max(50, "validation.too_big"), startDate: date, endDate: date, isCurrent: checkbox })
  .refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "validation.dateOrder" });

export async function saveAcademicYearAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("academic_years.manage");
  if ("error" in s) return s.error!;
  const input = parseInput(yearSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const row = { name: v.name, start_date: v.startDate, end_date: v.endDate, ...(v.isCurrent ? { is_current: true } : {}) };
  const { error } = v.id
    ? await s.supabase.from("academic_years").update(row).eq("id", v.id)
    : await s.supabase.from("academic_years").insert({ ...row, school_id: s.school.id, status: v.isCurrent ? "active" : "planned" });
  if (error) return done(error.code === "23505" ? uniqueViolation("name") : mapDbError(error));
  revalidatePath("/admin", "layout");
  return done(success(v.id ? "common.saved" : "admin.years.created"));
}

export async function setYearStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("academic_years.manage");
  if ("error" in s) return s.error!;
  const parsed = z.object({ id: uuid, action: z.enum(["current", "close", "reopen"]) }).safeParse({ id: formData.get("id"), action: formData.get("action") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const patch =
    parsed.data.action === "current" ? { is_current: true, status: "active" } : parsed.data.action === "close" ? { status: "closed", is_current: false } : { status: "active" };
  const { error } = await s.supabase.from("academic_years").update(patch).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin", "layout");
  return done(success("common.saved"));
}

const TERM_KINDS = ["quarter", "semester", "trimester", "term", "exam_period", "holiday"] as const;
const termSchema = z
  .object({
    id: optionalUuid,
    academicYearId: uuid,
    name: z.string().trim().min(1, "validation.required").max(100, "validation.too_big"),
    kind: z.enum(TERM_KINDS),
    startDate: date,
    endDate: date,
    sortOrder: optionalInt(0, 100),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "validation.dateOrder" });

export async function saveTermAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("academic_years.manage");
  if ("error" in s) return s.error!;
  const input = parseInput(termSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const { data: year } = await s.supabase.from("academic_years").select("start_date, end_date").eq("id", v.academicYearId).maybeSingle();
  if (!year) return done(failure("errors.not_found"));
  if (v.startDate < year.start_date || v.endDate > year.end_date) return done(failure("errors.validation", { startDate: ["validation.termOutsideYear"] }));
  const row = { name: v.name, kind: v.kind, start_date: v.startDate, end_date: v.endDate, sort_order: v.sortOrder ?? 0 };
  const { error } = v.id
    ? await s.supabase.from("academic_terms").update(row).eq("id", v.id)
    : await s.supabase.from("academic_terms").insert({ ...row, school_id: s.school.id, academic_year_id: v.academicYearId });
  if (error) return done(error.code === "23505" ? uniqueViolation("name") : mapDbError(error));
  revalidatePath("/admin", "layout");
  return done(success(v.id ? "common.saved" : "admin.years.termCreated"));
}

export async function deleteTermAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("academic_years.manage");
  if ("error" in s) return s.error!;
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const { error, count } = await s.supabase.from("academic_terms").delete({ count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("admin.years.termInUse"));
  revalidatePath("/admin/academic-years");
  return done(success("common.deleted"));
}

export async function setTermLockAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z.object({ id: uuid, locked: z.enum(["true", "false"]) }).safeParse({ id: formData.get("id"), locked: formData.get("locked") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("academic_terms").update({ is_locked: parsed.data.locked === "true" }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin", "layout");
  return done(success(parsed.data.locked === "true" ? "admin.years.termLocked" : "admin.years.termUnlocked"));
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------
const classSchema = z.object({
  id: optionalUuid,
  academicYearId: uuid,
  name: z.string().trim().toUpperCase().min(1, "validation.required").max(20, "validation.too_big"),
  gradeLevel: z.coerce.number().int().min(1, "validation.invalid_value").max(11, "validation.invalid_value"),
  shift: z.coerce.number().int().min(1).max(3),
  capacity: optionalInt(1, 60),
  homeroomStaffId: optionalUuid,
  roomId: optionalUuid,
});

export async function saveClassAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(classSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  if (!can(access, v.id ? "classes.update" : "classes.create")) return done(failure("errors.forbidden"));
  const supabase = await createClient();
  const row = { name: v.name, grade_level: v.gradeLevel, shift: v.shift, capacity: v.capacity, homeroom_staff_id: v.homeroomStaffId, room_id: v.roomId };
  if (v.id) {
    const { error } = await supabase.from("classes").update(row).eq("id", v.id);
    if (error) return done(error.code === "23505" ? uniqueViolation("name") : mapDbError(error));
    revalidatePath(`/admin/classes/${v.id}`);
    revalidatePath("/admin/classes");
    return done(success("common.saved"));
  }
  const { data, error } = await supabase
    .from("classes")
    .insert({ ...row, school_id: access.school.id, academic_year_id: v.academicYearId })
    .select("id")
    .single();
  if (error || !data) return done(error?.code === "23505" ? uniqueViolation("name") : mapDbError(error));
  revalidatePath("/admin/classes");
  redirect(`/admin/classes/${data.id}?saved=created`);
}

export async function setClassActiveAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("classes.archive");
  if ("error" in s) return s.error!;
  const parsed = z.object({ id: uuid, active: z.enum(["true", "false"]) }).safeParse({ id: formData.get("id"), active: formData.get("active") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const active = parsed.data.active === "true";
  if (!active) {
    const { count } = await s.supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("class_id", parsed.data.id).eq("status", "active");
    if ((count ?? 0) > 0) return done(failure("admin.classes.hasActiveStudents"));
  }
  const { error } = await s.supabase
    .from("classes")
    .update({ is_active: active, deactivated_at: active ? null : new Date().toISOString() })
    .eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  return done(success(active ? "admin.classes.restored" : "admin.classes.archived"));
}

export async function saveClassSubjectAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "classes.update") && !can(access, "subjects.manage")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      id: optionalUuid,
      classId: uuid,
      subjectId: optionalUuid,
      teacherId: optionalUuid,
      weeklyHours: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
        .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 20), "validation.hours"),
    })
    .safeParse({
      id: formData.get("id") ?? "",
      classId: formData.get("classId"),
      subjectId: formData.get("subjectId") ?? "",
      teacherId: formData.get("teacherId") ?? "",
      weeklyHours: formData.get("weeklyHours") ?? undefined,
    });
  if (!parsed.success) return done(failure("errors.validation", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message.startsWith("validation.") ? i.message : "validation.invalid_value"]]))));
  const v = parsed.data;
  const supabase = await createClient();
  if (v.id) {
    const { error } = await supabase.from("class_subjects").update({ teacher_id: v.teacherId, weekly_hours: v.weeklyHours }).eq("id", v.id);
    if (error) return done(mapDbError(error));
  } else {
    if (!v.subjectId) return done(failure("errors.validation", { subjectId: ["validation.required"] }));
    const { error } = await supabase
      .from("class_subjects")
      .insert({ school_id: access.school.id, class_id: v.classId, subject_id: v.subjectId, teacher_id: v.teacherId, weekly_hours: v.weeklyHours });
    if (error) return done(error.code === "23505" ? failure("admin.classes.subjectExists") : mapDbError(error));
  }
  revalidatePath(`/admin/classes/${v.classId}`);
  return done(success("common.saved"));
}

export async function removeClassSubjectAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z.object({ id: uuid, classId: uuid }).safeParse({ id: formData.get("id"), classId: formData.get("classId") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("class_subjects").delete({ count: "exact" }).eq("id", parsed.data.id);
  if (error?.code === "23503" || (!error && !count)) {
    // Referenced by grades, homework or timetable: deactivate instead of deleting history.
    const { error: deactivateError, count: updated } = await supabase.from("class_subjects").update({ is_active: false }, { count: "exact" }).eq("id", parsed.data.id);
    if (deactivateError) return done(mapDbError(deactivateError));
    if (!updated) return done(failure("errors.forbidden"));
  } else if (error) {
    return done(mapDbError(error));
  }
  revalidatePath(`/admin/classes/${parsed.data.classId}`);
  return done(success("admin.classes.subjectRemoved"));
}

export async function promoteStudentsAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("enrollments.manage");
  if ("error" in s) return s.error!;
  const parsed = z
    .object({ fromClassId: uuid, toClassId: uuid, studentIds: z.array(uuid).min(1, "admin.classes.selectStudents").max(200) })
    .safeParse({ fromClassId: formData.get("fromClassId"), toClassId: formData.get("toClassId"), studentIds: formData.getAll("studentId") });
  if (!parsed.success) return done(failure(parsed.error.issues.some((i) => i.message === "admin.classes.selectStudents") ? "admin.classes.selectStudents" : "errors.validation", { toClassId: ["validation.required"] }));
  const { data, error } = await s.supabase.rpc("promote_students", {
    p_from_class_id: parsed.data.fromClassId,
    p_to_class_id: parsed.data.toClassId,
    p_student_ids: parsed.data.studentIds,
  });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/classes", "layout");
  return done(success(Number(data ?? 0) > 0 ? "admin.classes.promoted" : "admin.classes.nothingPromoted"));
}

// ---------------------------------------------------------------------------
// Subjects and rooms
// ---------------------------------------------------------------------------
const subjectSchema = z.object({
  id: optionalUuid,
  nameTg: z.string().trim().min(1, "validation.required").max(200, "validation.too_big"),
  nameRu: z.string().trim().max(200).optional().transform((v) => v || null),
  nameEn: z.string().trim().max(200).optional().transform((v) => v || null),
  code: z.string().trim().toUpperCase().max(20).regex(/^[A-Z0-9_-]*$/, "validation.code").optional().transform((v) => v || null),
  defaultWeeklyHours: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 20), "validation.hours"),
});

export async function saveSubjectAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("subjects.manage");
  if ("error" in s) return s.error!;
  const input = parseInput(subjectSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const row = { name_tg: v.nameTg, name_ru: v.nameRu, name_en: v.nameEn, code: v.code, default_weekly_hours: v.defaultWeeklyHours };
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

/** Enrolls selected students (e.g. without a class) into a class of the same academic year. */
export async function enrollStudentsAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await session("enrollments.manage");
  if ("error" in s) return s.error!;
  const parsed = z
    .object({ classId: uuid, studentIds: z.array(uuid).min(1).max(100) })
    .safeParse({ classId: formData.get("classId"), studentIds: formData.getAll("studentId") });
  if (!parsed.success) return done(failure("admin.classes.selectStudents"));
  for (const studentId of parsed.data.studentIds) {
    const { error } = await s.supabase.rpc("transfer_student_class", { p_student_id: studentId, p_to_class_id: parsed.data.classId });
    if (error) return done(mapDbError(error));
  }
  revalidatePath(`/admin/classes/${parsed.data.classId}`);
  revalidatePath("/admin/students");
  return done(success("admin.classes.enrolled"));
}
