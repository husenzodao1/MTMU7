"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { localInputToIso } from "@/lib/i18n/zoned";
import { checkFile } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

const assignmentSchema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  classSubjectId: uuid,
  title: z.string().trim().min(2, "validation.too_small").max(300, "validation.too_big"),
  instructions: z.string().max(20000, "validation.too_big").optional().transform((v) => v?.trim() || null),
  dueAt: z.string().optional(),
  maxScore: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 1000), "validation.score"),
  allowSubmissions: z.string().optional().transform((v) => v === "on"),
  intent: z.enum(["draft", "publish", "archive", "restore"]),
  attachmentPath: z.string().max(500).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentSize: z.coerce.number().int().positive().optional(),
  attachmentType: z.string().max(100).optional(),
});

export async function saveAssignmentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(assignmentSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;

  const dueAt = localInputToIso(v.dueAt, access.school.timezone);
  if (v.dueAt && !dueAt) return done(failure("errors.validation", { dueAt: ["validation.date"] }));
  if (v.intent === "publish" && dueAt && dueAt < new Date().toISOString()) {
    return done(failure("errors.validation", { dueAt: ["validation.dueInPast"] }));
  }

  if (v.attachmentPath) {
    const prefix = `${access.school.id}/${access.userId}/`;
    const check = checkFile("homework", { name: v.attachmentName ?? "", type: v.attachmentType ?? "", size: v.attachmentSize ?? 0 });
    if (!v.attachmentPath.startsWith(prefix) || v.attachmentPath.includes("..") || !check.ok) return done(failure("errors.invalid_file_path"));
  }

  const status = v.intent === "publish" ? "published" : v.intent === "archive" ? "archived" : "draft";
  const payload = {
    title: v.title,
    instructions: v.instructions,
    due_at: dueAt,
    max_score: v.maxScore,
    allow_submissions: v.allowSubmissions,
    status,
  };

  const supabase = await createClient();
  let id = v.id;
  if (id) {
    const { error, count } = await supabase.from("homework_assignments").update(payload, { count: "exact" }).eq("id", id);
    if (error) return done(mapDbError(error));
    if (!count) return done(failure("errors.forbidden"));
  } else {
    const { data, error } = await supabase
      .from("homework_assignments")
      .insert({ ...payload, school_id: access.school.id, class_subject_id: v.classSubjectId })
      .select("id")
      .single();
    if (error || !data) return done(mapDbError(error));
    id = data.id;
  }

  if (v.attachmentPath) {
    const { error } = await supabase.from("homework_attachments").insert({
      school_id: access.school.id,
      assignment_id: id,
      storage_path: v.attachmentPath,
      file_name: v.attachmentName!,
      mime_type: v.attachmentType!,
      size_bytes: v.attachmentSize!,
      uploaded_by: access.userId,
    });
    if (error) return done(mapDbError(error));
  }

  revalidatePath("/teach/homework");
  revalidatePath("/homework");
  redirect(`/teach/homework/${id}?saved=${v.intent}`);
}

export async function removeAssignmentAttachmentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("attachmentId"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("homework_attachments").delete({ count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/teach/homework", "layout");
  return done(success("common.deleted"));
}

const reviewSchema = z.object({
  assignmentId: uuid,
  submissionId: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  studentId: uuid,
  decision: z.enum(["reviewed", "returned", "missing"]),
  score: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "validation.score"),
  feedback: z.string().max(5000, "validation.too_big").optional().transform((v) => v?.trim() || null),
});

/** Teacher review of one student's work: score, feedback, returned for changes, or marked missing. */
export async function reviewSubmissionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(reviewSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();

  if (v.submissionId) {
    const { error, count } = await supabase
      .from("homework_submissions")
      .update({ status: v.decision, score: v.decision === "missing" ? null : v.score, feedback: v.feedback }, { count: "exact" })
      .eq("id", v.submissionId)
      .eq("assignment_id", v.assignmentId);
    if (error) return done(mapDbError(error));
    if (!count) return done(failure("errors.forbidden"));
  } else {
    if (v.decision !== "missing") return done(failure("errors.invalid"));
    const { error } = await supabase.from("homework_submissions").insert({
      school_id: access.school.id,
      assignment_id: v.assignmentId,
      student_id: v.studentId,
      status: "missing",
      feedback: v.feedback,
    });
    if (error) return done(mapDbError(error));
  }
  revalidatePath(`/teach/homework/${v.assignmentId}`);
  return done(success("teach.homework.reviewSaved"));
}
