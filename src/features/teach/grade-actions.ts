"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

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
  const { data: type } = await supabase.from("assessment_types").select("max_score, is_active").eq("id", assessmentTypeId).maybeSingle();
  if (!type?.is_active) return done(failure("errors.invalid"));
  const max = Number(type.max_score);

  const inserts = [];
  const updates: Array<{ id: string; score: number; comment: string | null }> = [];
  const fieldErrors: Record<string, string[]> = {};

  for (const studentId of formData.getAll("student")) {
    if (typeof studentId !== "string" || !uuid.safeParse(studentId).success) return done(failure("errors.invalid"));
    const raw = String(formData.get(`score_${studentId}`) ?? "").trim().replace(",", ".");
    const gradeId = String(formData.get(`grade_${studentId}`) ?? "");
    const original = String(formData.get(`original_${studentId}`) ?? "");
    const comment = String(formData.get(`comment_${studentId}`) ?? "").trim().slice(0, 1000) || null;
    const originalComment = String(formData.get(`originalComment_${studentId}`) ?? "") || null;
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
  if (inserts.length === 0 && updates.length === 0) return done(failure("teach.gradebook.nothingToSave"));

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

  revalidatePath(`/teach/gradebook/${classSubjectId}`);
  return done(success("teach.gradebook.saved"));
}
