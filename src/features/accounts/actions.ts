"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/uuid";
import { sendCredentialsToParents, type SentCredentials } from "@/features/accounts/send-credentials";
import { ACCOUNT_KINDS, CLASS_POSITIONS, RELATIONSHIPS, type IssuedLogin } from "@/features/accounts/types";

/**
 * The account block's writes. Every rule about who may do what lives in the
 * database functions these call (migration 00072); what is checked here is
 * only the shape of what the form sent, so a malformed request is turned away
 * before it costs a round trip.
 */

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optionalUuid = z.string().optional().transform((v) => (v && uuid.safeParse(v).success ? v : undefined));

const inputSchema = z.object({
  kind: z.enum(ACCOUNT_KINDS),
  last_name: z.string().trim().max(100),
  first_name: z.string().trim().max(100),
  middle_name: text(100),
  nickname: text(30),
  date_of_birth: text(10),
  gender: z.enum(["male", "female", ""]).optional(),
  phone: text(30),
  email: text(254),
  student: z
    .object({
      class_id: z.string().max(36),
      student_number: text(32),
      address: text(500),
      positions: z.array(z.enum(CLASS_POSITIONS)).max(CLASS_POSITIONS.length),
      guardians: z
        .array(
          z.object({
            id: optionalUuid,
            last_name: text(100),
            first_name: text(100),
            middle_name: text(100),
            phone: text(30),
            relationship: z.enum(RELATIONSHIPS),
          })
        )
        .max(6),
    })
    .optional(),
  staff: z
    .object({
      employee_number: text(32),
      position: text(200),
      qualification: text(2000),
      hire_date: text(10),
      homeroom_class_id: z.string().max(36).optional(),
    })
    .optional(),
  parent: z.object({ children: z.array(uuid).max(20), relationship: z.enum(RELATIONSHIPS) }).optional(),
});

/** The database's error codes, as the form's i18n keys, on the field they concern. */
function fieldErrors(errors: Array<{ field: string; code: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { field, code } of errors) {
    out[field] = [...(out[field] ?? []), `accounts.errors.${code}`];
  }
  return out;
}

function revalidate() {
  revalidatePath("/admin/accounts", "layout");
  revalidatePath("/my-class", "layout");
}

export async function saveAccountAction(userId: string | null, input: unknown): Promise<ActionResult<IssuedLogin>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (userId !== null && !uuid.safeParse(userId).success) return failure("errors.invalid");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure("errors.invalid");

  const supabase = await createClient();
  // A number already on somebody else's account is named on its field, as
  // a taken address is (the database refuses it anyway: 00077).
  if (parsed.data.phone) {
    const { data: taken } = await supabase.rpc("phone_in_use", { p_phone: parsed.data.phone, p_except: userId ?? undefined });
    if (taken) return failure("errors.validation", { phone: ["accounts.errors.phone_taken"] });
  }
  const { data, error } = await supabase.rpc("save_account", {
    // A new account has no id yet; the function takes NULL for "create".
    p_user_id: userId as string,
    p_data: parsed.data,
  });
  if (error) {
    if (/kind_locked/.test(error.message)) return failure("accounts.errors.kind_locked");
    if (/phone_taken/.test(error.message)) return failure("errors.validation", { phone: ["accounts.errors.phone_taken"] });
    return mapDbError(error);
  }
  const outcome = data as unknown as {
    valid: boolean;
    errors: Array<{ field: string; code: string }>;
    userId?: string;
    login?: string;
    password?: string | null;
    created?: boolean;
  };
  if (!outcome.valid) return failure("errors.validation", fieldErrors(outcome.errors));

  revalidate();
  return success(outcome.created ? "accounts.created" : "accounts.saved", {
    userId: outcome.userId!,
    login: outcome.login!,
    password: outcome.password ?? null,
    created: Boolean(outcome.created),
  });
}

export async function resetPasswordAction(userId: string): Promise<ActionResult<IssuedLogin>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!uuid.safeParse(userId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_account_password", { p_user_id: userId });
  if (error) return mapDbError(error);
  const issued = data as unknown as { login: string; password: string };
  revalidate();
  return success("accounts.passwordReset", { userId, login: issued.login, password: issued.password, created: false });
}

export async function resetTwoFactorAction(userId: string): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  if (!uuid.safeParse(userId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_account_mfa", { p_user_id: userId });
  if (error) return mapDbError(error);
  revalidate();
  return success("accounts.twoFactorReset");
}

const credentialSchema = z.array(z.object({ login: z.string().trim().min(1).max(40), password: z.string().min(8).max(64) })).min(1).max(2000);

/** Sends just-issued logins of young pupils to their parents' Telegram. */
export async function sendCredentialsAction(entries: unknown): Promise<ActionResult<SentCredentials>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const parsed = credentialSchema.safeParse(entries);
  if (!parsed.success) return failure("errors.invalid");
  const sent = await sendCredentialsToParents(parsed.data);
  return success(sent.messages > 0 ? "accounts.telegramSent" : "accounts.telegramNobody", sent);
}

export interface PupilOption {
  id: string;
  /** The pupil's record, which a parent is linked to. */
  studentId: string | null;
  name: string;
  className: string | null;
}

/** Pupils by name, for linking a parent to their children. */
export async function searchPupilsAction(query: string): Promise<ActionResult<PupilOption[]>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const term = z.string().trim().min(2).max(60).safeParse(query);
  if (!term.success) return success(undefined, []);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_directory", { p_category: "students", p_query: term.data, p_limit: 12, p_offset: 0 });
  if (error) return mapDbError(error);
  const rows = ((data as unknown as { rows?: Array<{ id: string; first_name: string; last_name: string; class_name: string | null }> })?.rows ?? []);
  if (rows.length === 0) return success(undefined, []);
  // The directory is keyed by account; a parent is linked to the pupil record.
  const { data: students } = await supabase.from("students").select("id, user_id").in("user_id", rows.map((r) => r.id));
  const byUser = new Map((students ?? []).map((s) => [s.user_id, s.id]));
  return success(
    undefined,
    rows.map((r) => ({ id: r.id, studentId: byUser.get(r.id) ?? null, name: `${r.last_name} ${r.first_name}`.trim(), className: r.class_name }))
  );
}
