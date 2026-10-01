"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { done, failure, formDataToObject, parseInput, success, type ActionResult, type FormState } from "@/lib/actions/result";
import { markWelcome } from "@/lib/auth/welcome";
import { postSignInPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Two-step sign-in with an authenticator app (TOTP), through Supabase Auth's
 * own MFA: the secret lives in Supabase, never in the portal's tables, and a
 * session that has passed it carries aal2 in its JWT — which is what the
 * database checks (migration 00070).
 */

const code = z.string().trim().regex(/^\d{6}$/, "validation.code_six_digits");

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function verifiedTotp(supabase: Supabase) {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp?.find((factor) => factor.status === "verified") ?? null;
}

/** After the password: the six digits from the authenticator app. */
export async function verifySecondStepAction(_state: FormState, formData: FormData): Promise<FormState> {
  const input = parseInput(z.object({ token: code, next: z.string().optional() }), formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const supabase = await createClient();
  const factor = await verifiedTotp(supabase);
  if (!factor) redirect("/login");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: input.data.token });
  if (error) return done(failure("auth.twoFactor.wrong", { token: ["auth.twoFactor.wrong"] }));
  await markWelcome();
  redirect(postSignInPath(input.data.next));
}

/** Gives up on the second step: signs out, back to the start. */
export async function abandonSecondStepAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface Enrolment {
  factorId: string;
  /** An SVG data URL of the QR code. */
  qr: string;
  /** The same secret, for typing in by hand. */
  secret: string;
}

/**
 * Starts turning the second step on: a new secret, shown as a QR code. Any
 * half-finished attempt from before is cleared first — Supabase keeps
 * unverified factors, and an abandoned one would block the next.
 */
export async function startTwoFactorAction(): Promise<ActionResult<Enrolment>> {
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  if (list?.totp?.some((factor) => factor.status === "verified")) return failure("portal.settings.twoFactor.alreadyOn");
  for (const factor of list?.all ?? []) {
    if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `МТМУ №7 · ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data || data.type !== "totp") return failure("errors.unexpected");
  return success(undefined, { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
}

/** Finishes turning it on: the first code from the app proves it was set up. */
export async function confirmTwoFactorAction(factorId: string, token: string): Promise<ActionResult> {
  const parsed = z.object({ factorId: z.string().uuid(), token: code }).safeParse({ factorId, token });
  if (!parsed.success) return failure("auth.twoFactor.wrong");
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.token });
  if (error) return failure("auth.twoFactor.wrong");
  return success("portal.settings.twoFactor.enabled");
}

/**
 * Turns it off. Asks for a current code even though the session already
 * passed the step: turning off a lock should take the key, not just an open
 * door somebody walked away from.
 */
export async function disableTwoFactorAction(token: string): Promise<ActionResult> {
  if (!code.safeParse(token).success) return failure("auth.twoFactor.wrong");
  const supabase = await createClient();
  const factor = await verifiedTotp(supabase);
  if (!factor) return success("portal.settings.twoFactor.disabled");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: token.trim() });
  if (error) return failure("auth.twoFactor.wrong");
  const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (removeError) return failure("errors.unexpected");
  return success("portal.settings.twoFactor.disabled");
}
