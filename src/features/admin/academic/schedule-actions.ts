"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "validation.time");

async function manager() {
  const access = await getAccess();
  if (!access?.school) return null;
  if (!can(access, "timetable.manage")) return null;
  return { access, school: access.school, supabase: await createClient() };
}

/** Replaces the bell schedule of one shift. Rows with empty times are removed. */
export async function saveBellScheduleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const shift = z.coerce.number().int().min(1).max(3).safeParse(formData.get("shift"));
  if (!shift.success) return done(failure("errors.invalid"));

  const rows: Array<{ school_id: string; shift: number; period_number: number; start_time: string; end_time: string }> = [];
  const remove: number[] = [];
  const fieldErrors: Record<string, string[]> = {};
  let previousEnd = "";
  for (let period = 1; period <= 12; period += 1) {
    const start = String(formData.get(`start_${period}`) ?? "").trim();
    const end = String(formData.get(`end_${period}`) ?? "").trim();
    if (!start && !end) {
      remove.push(period);
      continue;
    }
    if (!time.safeParse(start).success || !time.safeParse(end).success || end <= start) {
      fieldErrors[`start_${period}`] = ["validation.timeRange"];
      continue;
    }
    if (previousEnd && start < previousEnd) {
      fieldErrors[`start_${period}`] = ["validation.periodOverlap"];
      continue;
    }
    previousEnd = end;
    rows.push({ school_id: m.school.id, shift: shift.data, period_number: period, start_time: start, end_time: end });
  }
  if (Object.keys(fieldErrors).length > 0) return done(failure("errors.validation", fieldErrors));

  if (rows.length > 0) {
    const { error } = await m.supabase.from("bell_periods").upsert(rows, { onConflict: "school_id,shift,period_number" });
    if (error) return done(mapDbError(error));
  }
  if (remove.length > 0) {
    const { error } = await m.supabase.from("bell_periods").delete().eq("school_id", m.school.id).eq("shift", shift.data).in("period_number", remove);
    if (error) return done(mapDbError(error));
  }
  revalidatePath("/admin/timetable", "layout");
  return done(success("admin.timetable.bellSaved"));
}

export async function saveTimetableEntryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      classId: uuid,
      classSubjectId: uuid,
      dayOfWeek: z.coerce.number().int().min(1).max(6),
      periodNumber: z.coerce.number().int().min(1).max(12),
      roomId: optionalUuid,
    })
    .safeParse({
      classId: formData.get("classId"),
      classSubjectId: formData.get("classSubjectId"),
      dayOfWeek: formData.get("dayOfWeek"),
      periodNumber: formData.get("periodNumber"),
      roomId: formData.get("roomId") ?? "",
    });
  if (!parsed.success) return done(failure("errors.validation", { classSubjectId: ["validation.required"] }));
  const v = parsed.data;
  const [{ data: klass }, { data: cs }] = await Promise.all([
    m.supabase.from("classes").select("academic_year_id, shift").eq("id", v.classId).maybeSingle(),
    m.supabase.from("class_subjects").select("class_id, teacher_id").eq("id", v.classSubjectId).maybeSingle(),
  ]);
  if (!klass || !cs || cs.class_id !== v.classId) return done(failure("errors.invalid"));

  const { error } = await m.supabase.from("timetable_entries").insert({
    school_id: m.school.id,
    academic_year_id: klass.academic_year_id,
    class_id: v.classId,
    class_subject_id: v.classSubjectId,
    teacher_id: cs.teacher_id,
    room_id: v.roomId,
    day_of_week: v.dayOfWeek,
    shift: klass.shift,
    period_number: v.periodNumber,
  });
  if (error) {
    const text = `${error.message} ${error.details ?? ""}`;
    if (/timetable_class_conflict/.test(text)) return done(failure("errors.timetable_class_conflict"));
    if (/timetable_teacher_conflict/.test(text)) return done(failure("errors.timetable_teacher_conflict"));
    if (/timetable_room_conflict/.test(text)) return done(failure("errors.timetable_room_conflict"));
    return done(mapDbError(error));
  }
  revalidatePath("/admin/timetable", "layout");
  revalidatePath("/schedule");
  return done(success("admin.timetable.entrySaved"));
}

export async function deleteTimetableEntryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const { error, count } = await m.supabase.from("timetable_entries").delete({ count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/timetable", "layout");
  revalidatePath("/schedule");
  return done(success("admin.timetable.entryDeleted"));
}

export async function saveSubstitutionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      timetableEntryId: uuid,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      substituteTeacherId: optionalUuid,
      roomId: optionalUuid,
      reason: z.string().trim().max(500).optional().transform((v) => v || null),
    })
    .safeParse({
      timetableEntryId: formData.get("timetableEntryId"),
      date: formData.get("date"),
      substituteTeacherId: formData.get("substituteTeacherId") ?? "",
      roomId: formData.get("roomId") ?? "",
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) return done(failure("errors.invalid"));
  const v = parsed.data;
  const { error } = await m.supabase.from("substitutions").upsert(
    {
      school_id: m.school.id,
      timetable_entry_id: v.timetableEntryId,
      substitution_date: v.date,
      substitute_teacher_id: v.substituteTeacherId,
      room_id: v.roomId,
      reason: v.reason,
      status: "confirmed",
    },
    { onConflict: "timetable_entry_id,substitution_date" }
  );
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/timetable", "layout");
  return done(success("admin.timetable.substitutionSaved"));
}

export async function cancelSubstitutionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const { error } = await m.supabase.from("substitutions").update({ status: "cancelled" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/timetable", "layout");
  return done(success("admin.timetable.substitutionCancelled"));
}
