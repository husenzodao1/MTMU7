"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, keepValues, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";


/**
 * Saves one assessment column (type + date) for a class subject: new scores
 * are inserted, changed ones updated. Enrollment, term locks, approval rules
 * and teacher assignment are enforced by RLS and the grade trigger.
 */
export async function saveGradesAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const header = z
    .object({ classSubjectId: uuid, assessmentTypeId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse({ classSubjectId: formData.get("classSubjectId"), assessmentTypeId: formData.get("assessmentTypeId"), date: formData.get("date") });
  if (!header.success) return done(failure("errors.validation", { assessmentTypeId: ["validation.required"] }));
  const { classSubjectId, assessmentTypeId, date } = header.data;

  const supabase = await createClient();
  const [{ data: type }, { data: subject }] = await Promise.all([
    supabase.from("assessment_types").select("max_score, is_active").eq("id", assessmentTypeId).maybeSingle(),
    supabase.from("class_subjects").select("class_id").eq("id", classSubjectId).maybeSingle(),
  ]);
  if (!type?.is_active || !subject) return done(failure("errors.invalid"));
  const max = Number(type.max_score);
  const classId = subject.class_id;

  const inserts = [];
  const updates: Array<{ id: string; score: number; comment: string | null }> = [];
  const fieldErrors: Record<string, string[]> = {};
  // A column in a paper journal holds a mark or the letter for an absence, so
  // the two are entered together here and stored in their own tables.
  const attendance: Array<{
    school_id: string;
    student_id: string;
    class_id: string;
    class_subject_id: string;
    attendance_date: string;
    status: string;
  }> = [];
  const clearAttendance: string[] = [];
  const ATTENDANCE_STATUSES = new Set(["present", "absent", "late", "excused"]);

  for (const studentId of formData.getAll("student")) {
    if (typeof studentId !== "string" || !uuid.safeParse(studentId).success) return done(failure("errors.invalid"));
    const raw = String(formData.get(`score_${studentId}`) ?? "").trim().replace(",", ".");
    const gradeId = String(formData.get(`grade_${studentId}`) ?? "");
    const original = String(formData.get(`original_${studentId}`) ?? "");
    const comment = String(formData.get(`comment_${studentId}`) ?? "").trim().slice(0, 1000) || null;
    const originalComment = String(formData.get(`originalComment_${studentId}`) ?? "") || null;

    const mark = String(formData.get(`attendance_${studentId}`) ?? "").trim();
    if (mark && ATTENDANCE_STATUSES.has(mark)) {
      attendance.push({
        school_id: access.school.id,
        student_id: studentId,
        class_id: classId,
        class_subject_id: classSubjectId,
        attendance_date: date,
        status: mark,
      });
    } else if (mark === "clear") {
      clearAttendance.push(studentId);
    }

    if (!raw) continue;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > max || Math.round(score * 100) !== score * 100) {
      fieldErrors[`score_${studentId}`] = ["validation.score"];
      continue;
    }
    if (gradeId && uuid.safeParse(gradeId).success) {
      if (Number(original) !== score || originalComment !== comment) updates.push({ id: gradeId, score, comment });
    } else {
      inserts.push({
        school_id: access.school.id,
        student_id: studentId,
        class_subject_id: classSubjectId,
        assessment_type_id: assessmentTypeId,
        score,
        max_score: max,
        grade_date: date,
        comment,
      });
    }
  }
  if (Object.keys(fieldErrors).length > 0) return done(failure("errors.validation", fieldErrors));
  if (inserts.length === 0 && updates.length === 0 && attendance.length === 0 && clearAttendance.length === 0) {
    return done(failure("teach.gradebook.nothingToSave"));
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("grades").insert(inserts);
    if (error) return done(mapDbError(error));
  }
  for (const update of updates) {
    const { error } = await supabase
      .from("grades")
      .update({ score: update.score, comment: update.comment })
      .eq("id", update.id)
      .eq("class_subject_id", classSubjectId);
    if (error) return done(mapDbError(error));
  }

  if (attendance.length > 0) {
    const { error } = await supabase
      .from("attendance_records")
      .upsert(attendance, { onConflict: "student_id,attendance_date,class_subject_id,period_number" });
    if (error) return done(mapDbError(error));
  }
  if (clearAttendance.length > 0) {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("class_subject_id", classSubjectId)
      .eq("attendance_date", date)
      .in("student_id", clearAttendance);
    if (error) return done(mapDbError(error));
  }

  revalidatePath(`/teach/gradebook/${classSubjectId}`);
  return done(success("teach.gradebook.saved"));
}

/**
 * Rules a column before anything is written in it, so a teacher can prepare the
 * week ahead or put a heading — "Чоряки I" — where a date does not belong.
 * Row-level security decides whether this person teaches the subject; the
 * database also checks the date against the term it is filed under.
 */
export async function ruleJournalColumnAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));

  const kept = keepValues(formData);
  const parsed = z
    .object({
      classSubjectId: uuid,
      academicTermId: uuid,
      assessmentTypeId: uuid,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date"),
      label: z.string().trim().max(60).optional().transform((v) => v || null),
    })
    .safeParse({
      classSubjectId: formData.get("classSubjectId"),
      academicTermId: formData.get("academicTermId"),
      assessmentTypeId: formData.get("assessmentTypeId"),
      date: formData.get("date"),
      label: formData.get("label"),
    });
  if (!parsed.success) return done(failure("errors.validation", { date: ["validation.required"] }, kept));

  const supabase = await createClient();
  const { error } = await supabase.from("journal_columns").insert({
    school_id: access.school.id,
    class_subject_id: parsed.data.classSubjectId,
    academic_term_id: parsed.data.academicTermId,
    column_date: parsed.data.date,
    assessment_type_id: parsed.data.assessmentTypeId,
    label: parsed.data.label,
  });
  if (error) {
    if (error.code === "23505") return done(failure("errors.validation", { date: ["validation.duplicateName"] }, kept));
    if (error.message === "date_outside_term") return done(failure("errors.validation", { date: ["validation.dateOrder"] }, kept));
    return done(mapDbError(error));
  }

  revalidatePath(`/teach/gradebook/${parsed.data.classSubjectId}`);
  return done(success("teach.gradebook.columnAdded"));
}
