"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { failure, type ActionResult } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/uuid";

const guardianSchema = z.object({
  relationship: z.enum(["father", "mother", "guardian"]),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional().transform((v) => v || null),
  birthYear: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1920 && v <= 2015), "invalid_birth_year"),
  phone: z.string().trim().min(1).max(30),
  workplace: z.string().trim().max(200).optional().transform((v) => v || null),
  guardianId: uuid.optional().nullable(),
  siblingOf: uuid.optional().nullable(),
});

export type GuardianInput = z.input<typeof guardianSchema>;

/** What saving a parent came to: saved, or "is this your brother or sister?" first. */
export type GuardianOutcome =
  | { kind: "saved" }
  | { kind: "match"; guardianId: string; children: Array<{ name: string; className: string | null }> };

export async function saveMyGuardianAction(input: GuardianInput): Promise<ActionResult<GuardianOutcome>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const key = field === "birthYear" ? "errors.invalid_birth_year" : field === "phone" ? "errors.invalid_phone" : field === "relationship" ? "errors.invalid_relationship" : "errors.invalid_name";
    return failure(key);
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_my_guardian", {
    p_relationship: v.relationship,
    p_last_name: v.lastName,
    p_first_name: v.firstName,
    p_middle_name: v.middleName ?? undefined,
    p_birth_year: v.birthYear ?? undefined,
    p_phone: v.phone,
    p_workplace: v.workplace ?? undefined,
    p_guardian_id: v.guardianId ?? undefined,
    p_sibling_of: v.siblingOf ?? undefined,
  });
  if (error) return mapDbError(error);
  const answer = data as { status: string; guardianId: string; children?: Array<{ name: string; className: string | null }> };
  if (answer.status === "match") {
    return { ok: true, data: { kind: "match", guardianId: answer.guardianId, children: answer.children ?? [] } };
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, message: "portal.guardians.saved", data: { kind: "saved" } };
}

export async function removeMyGuardianAction(guardianId: string): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const id = uuid.safeParse(guardianId);
  if (!id.success) return failure("errors.invalid_details");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_my_guardian", { p_guardian_id: id.data });
  if (error) return mapDbError(error);
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, message: "portal.guardians.removed" };
}
