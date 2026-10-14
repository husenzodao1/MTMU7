"use server";

import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/uuid";

/**
 * A teacher's note to a pupil's parents, through the Telegram bot: every chat
 * that follows the pupil gets it (send_parent_note, 00088). The database
 * decides who may write; this only checks the shape.
 */
export async function sendParentNoteAction(_state: FormState<{ chats: number }>, formData: FormData): Promise<FormState<{ chats: number }>> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ studentId: uuid, text: z.string().trim().min(2, "validation.too_small").max(2000, "validation.too_big") })
    .safeParse({ studentId: formData.get("studentId"), text: formData.get("text") });
  if (!parsed.success) return done(failure("errors.validation", { text: ["validation.too_small"] }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_parent_note", { p_student: parsed.data.studentId, p_text: parsed.data.text });
  if (error) return done(mapDbError(error));
  const chats = Number(data ?? 0);
  return done(success(chats > 0 ? "teach.pupil.noteSent" : "teach.pupil.noteNobody", { chats }));
}
