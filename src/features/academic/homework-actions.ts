"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { checkFile } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

const submitSchema = z.object({
  assignmentId: uuid,
  content: z.string().trim().max(20000, "validation.too_big").optional().transform((v) => v || null),
  attachmentPath: z.string().max(500).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentSize: z.coerce.number().int().positive().optional(),
  attachmentType: z.string().max(100).optional(),
});

/** Student submits (or resubmits) an answer. RLS and triggers decide status, timing and ownership. */
export async function submitHomeworkAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(submitSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const { assignmentId, content, attachmentPath, attachmentName, attachmentSize, attachmentType } = input.data;

  if (!content && !attachmentPath) return done(failure("errors.validation", { content: ["validation.required"] }));

  if (attachmentPath) {
    const expectedPrefix = `${access.school.id}/${access.userId}/`;
    const fileCheck = checkFile("homework", { name: attachmentName ?? "", type: attachmentType ?? "", size: attachmentSize ?? 0 });
    if (!attachmentPath.startsWith(expectedPrefix) || attachmentPath.includes("..") || !fileCheck.ok) {
      return done(failure("errors.invalid_file_path"));
    }
  }

  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id").eq("user_id", access.userId).maybeSingle();
  if (!student) return done(failure("errors.forbidden"));

  const { data: submission, error } = await supabase
    .from("homework_submissions")
    .upsert(
      { school_id: access.school.id, assignment_id: assignmentId, student_id: student.id, content },
      { onConflict: "assignment_id,student_id" }
    )
    .select("id")
    .single();
  if (error || !submission) return done(mapDbError(error));

  if (attachmentPath) {
    const { error: attachmentError } = await supabase.from("homework_attachments").insert({
      school_id: access.school.id,
      submission_id: submission.id,
      storage_path: attachmentPath,
      file_name: attachmentName!,
      mime_type: attachmentType!,
      size_bytes: attachmentSize!,
    });
    if (attachmentError) return done(mapDbError(attachmentError));
  }

  revalidatePath(`/homework/${assignmentId}`);
  revalidatePath("/homework");
  return done(success("portal.homework.submitted"));
}
