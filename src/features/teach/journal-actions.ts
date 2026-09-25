"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type ActionResult, type FormState } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

/**
 * Keeping the journal the way it is kept on paper.
 *
 * The teacher rules a column with a date they choose, writes a mark or a letter
 * in the same small square, and writes the lesson's topic on the facing page.
 * Nothing here guesses a date from a timetable: the register is the teacher's
 * record of what happened, not the portal's record of what was scheduled.
 */

export interface SaveOutcome {
  saved: number;
  cleared: number;
  errors: Array<{ student: string; date: string; code: string }>;
}

const cellSchema = z.object({
  student: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: uuid,
  value: z.string().max(16),
});

export async function saveJournalCellsAction(
  classSubjectId: string,
  academicTermId: string,
  cells: unknown
): Promise<ActionResult<SaveOutcome>> {
  const ids = z.object({ classSubjectId: uuid, academicTermId: uuid }).safeParse({ classSubjectId, academicTermId });
  if (!ids.success) return failure("errors.invalid");
  // A page of a register is a few hundred squares; four thousand is a whole
  // term for a large class and is where the database stops too.
  const parsed = z.array(cellSchema).max(4000).safeParse(cells);
  if (!parsed.success) return failure("errors.invalid");
  if (parsed.data.length === 0) return success(undefined, { saved: 0, cleared: 0, errors: [] });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_journal_cells", {
    p_class_subject_id: ids.data.classSubjectId,
    p_academic_term_id: ids.data.academicTermId,
    p_cells: parsed.data,
  });
  if (error) return mapDbError(error);

  revalidatePath(`/teach/gradebook/${ids.data.classSubjectId}`);
  revalidatePath("/grades");
  revalidatePath("/attendance");
  return success("common.saved", data as unknown as SaveOutcome);
}

const columnSchema = z.object({
  classSubjectId: uuid,
  academicTermId: uuid,
  kind: z.enum(["lesson", "term"]),
  date: z.string().optional().transform((v) => v || undefined),
  assessmentTypeId: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  label: z.string().trim().max(60).optional().transform((v) => v || undefined),
});

export async function ruleJournalColumnAction(_state: FormState, formData: FormData): Promise<FormState> {
  const input = parseInput(columnSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("rule_journal_column", {
    p_class_subject_id: v.classSubjectId,
    p_academic_term_id: v.academicTermId,
    p_kind: v.kind,
    p_date: v.date,
    p_assessment_type_id: v.assessmentTypeId,
    p_label: v.label,
  });
  if (error) return done(mapDbError(error));

  revalidatePath(`/teach/gradebook/${v.classSubjectId}`);
  return done(success("common.saved"));
}

const topicSchema = z.object({
  classSubjectId: uuid,
  academicTermId: uuid,
  lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date"),
  topic: z.string().trim().min(1, "validation.required").max(500),
  homework: z.string().trim().max(1000).optional().transform((v) => v || null),
});

/** The facing page: what the lesson was about, and what was set for home. */
export async function saveLessonTopicAction(_state: FormState, formData: FormData): Promise<FormState> {
  const input = parseInput(topicSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_topics").upsert(
    {
      class_subject_id: v.classSubjectId,
      academic_term_id: v.academicTermId,
      lesson_date: v.lessonDate,
      topic: v.topic,
      homework: v.homework,
      // The trigger fills school_id from the subject; period stays unset, which
      // the unique key treats as "the lesson that day".
      school_id: "00000000-0000-0000-0000-000000000000",
    },
    { onConflict: "class_subject_id,lesson_date,period_number" }
  );
  if (error) return done(mapDbError(error));

  revalidatePath(`/teach/gradebook/${v.classSubjectId}`);
  revalidatePath("/homework");
  return done(success("common.saved"));
}
