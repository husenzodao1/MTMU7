"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["present", "absent", "late", "excused"] as const;
const uuid = z.string().uuid();

const headerSchema = z.object({
  classId: uuid,
  classSubjectId: uuid.optional().or(z.literal("")).transform((v) => v || null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.coerce.number().int().min(1).max(12).optional().or(z.literal("")).transform((v) => (v === "" || v === undefined ? null : v)),
});

/**
 * Saves a class register in one upsert. Who may mark which lesson, the
 * enrollment on that date, future dates and the correction window are all
 * enforced by RLS and the attendance trigger.
 */
export async function saveAttendanceAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const header = headerSchema.safeParse({
    classId: formData.get("classId"),
    classSubjectId: formData.get("classSubjectId") ?? "",
    date: formData.get("date"),
    period: formData.get("period") ?? "",
  });
  if (!header.success) return done(failure("errors.invalid"));
  const { classId, classSubjectId, date, period } = header.data;
  if (classSubjectId && period === null) return done(failure("errors.invalid_period"));

  const rows = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const studentId of formData.getAll("student")) {
    if (typeof studentId !== "string" || !uuid.safeParse(studentId).success) return done(failure("errors.invalid"));
    const status = formData.get(`status_${studentId}`);
    if (!status) continue;
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) return done(failure("errors.invalid"));
    const lateRaw = String(formData.get(`late_${studentId}`) ?? "").trim();
    const minutes = status === "late" && lateRaw ? Number(lateRaw) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) {
      fieldErrors[`late_${studentId}`] = ["validation.minutesLate"];
      continue;
    }
    const note = String(formData.get(`note_${studentId}`) ?? "").trim().slice(0, 500) || null;
    rows.push({
      school_id: access.school.id,
      student_id: studentId,
      class_id: classId,
      class_subject_id: classSubjectId,
      attendance_date: date,
      period_number: classSubjectId ? period : null,
      status: status as (typeof STATUSES)[number],
      minutes_late: minutes,
      note,
    });
  }
  if (Object.keys(fieldErrors).length > 0) return done(failure("errors.validation", fieldErrors));
  if (rows.length === 0) return done(failure("teach.attendance.nothingToSave"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "student_id,attendance_date,class_subject_id,period_number" });
  if (error) return done(mapDbError(error));

  revalidatePath("/teach", "layout");
  revalidatePath("/dashboard");
  return done(success("teach.attendance.saved"));
}
