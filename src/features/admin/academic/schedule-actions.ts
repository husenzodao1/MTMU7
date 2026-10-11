"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const optionalUuid = uuid.optional().or(z.literal("")).transform((v) => v || null);

async function manager() {
  const access = await getAccess();
  if (!access?.school) return null;
  if (!can(access, "timetable.manage")) return null;
  return { access, school: access.school, supabase: await createClient() };
}

/**
 * One lesson by hand: the subject (attached to the class on the way), the
 * teacher who gives it, the day and the period. The bells are fixed (00086),
 * so a period after the shift's last bell is refused.
 */
export async function saveTimetableEntryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const m = await manager();
  if (!m) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      classId: uuid,
      subjectId: uuid,
      teacherId: optionalUuid,
      dayOfWeek: z.coerce.number().int().min(1).max(6),
      periodNumber: z.coerce.number().int().min(1).max(12),
      roomId: optionalUuid,
    })
    .safeParse({
      classId: formData.get("classId"),
      subjectId: formData.get("subjectId"),
      teacherId: formData.get("teacherId") ?? "",
      dayOfWeek: formData.get("dayOfWeek"),
      periodNumber: formData.get("periodNumber"),
      roomId: formData.get("roomId") ?? "",
    });
  if (!parsed.success) return done(failure("errors.validation", { subjectId: ["validation.required"] }));
  const v = parsed.data;
  const { error } = await m.supabase.rpc("save_timetable_lesson", {
    p_class_id: v.classId,
    p_subject_id: v.subjectId,
    // NULL: the subject is in the timetable before its teacher is settled.
    p_teacher_id: v.teacherId as string,
    p_day: v.dayOfWeek,
    p_period: v.periodNumber,
    p_room_id: v.roomId ?? undefined,
  });
  if (error) {
    const text = `${error.message} ${error.details ?? ""}`;
    if (/timetable_class_conflict/.test(text)) return done(failure("errors.timetable_class_conflict"));
    if (/timetable_teacher_conflict/.test(text)) return done(failure("errors.timetable_teacher_conflict"));
    if (/timetable_room_conflict/.test(text)) return done(failure("errors.timetable_room_conflict"));
    if (/no_bell/.test(text)) return done(failure("errors.validation", { periodNumber: ["admin.timetable.noBell"] }));
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
