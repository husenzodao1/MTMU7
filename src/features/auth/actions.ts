"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, failure, formDataToObject, keepValues, parseInput, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { serverEnv } from "@/lib/env.server";
import { postSignInPath, safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import { CONFIRM_COOKIE, RESET_COOKIE, readConfirmEmail, readResetEmail, writeShortLivedCookie as writeCookie } from "@/features/auth/draft";
import { emailSchema, otpSchema, passwordPairSchema } from "@/features/auth/schemas";

type AuthError = { status?: number; code?: string; message?: string } | null;

function isRateLimited(error: AuthError) {
  return Boolean(error && (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"));
}

/**
 * GoTrue's refusal when a project asks for the address to be confirmed before
 * the first sign-in. An imported account starts in exactly that state, so this
 * is not a failed sign-in — it is the step that comes next.
 */
function isUnconfirmed(error: AuthError) {
  return Boolean(error && (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message ?? "")));
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
const signInSchema = z.object({
  // Either the login the school issued (MT10001) or, for whoever prefers it,
  // the address itself. Both are checked against the same password.
  login: z.string().trim().min(1, "validation.required").max(254),
  password: z.string().min(1, "validation.required").max(128),
  next: z.string().optional(),
});

/**
 * The address Supabase will sign this person in by.
 *
 * A login is turned into one inside the database, behind a secret only the
 * server holds, so the mapping cannot be walked from MT10001 upwards by anyone
 * holding the publishable key. The address never reaches the browser: it is
 * used here and then handed straight to GoTrue.
 */
async function resolveSignInEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  login: string
): Promise<string | null> {
  if (login.includes("@")) {
    const parsed = emailSchema.safeParse(login);
    return parsed.success ? parsed.data : null;
  }
  const secret = serverEnv.LOGIN_LOOKUP_SECRET;
  if (!secret) {
    console.error("[signIn] LOGIN_LOOKUP_SECRET is not configured; signing in by login is unavailable");
    return null;
  }
  const { data, error } = await supabase.rpc("login_lookup", { p_login: login, p_secret: secret });
  if (error) {
    console.error("[signIn] login_lookup failed", { code: (error as { code?: string }).code, message: error.message });
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Sends a code to the address on file and hands the visitor to /confirm-email. */
async function startConfirmation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  next: string | undefined
): Promise<never> {
  await writeCookie(CONFIRM_COOKIE, email);
  await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  const target = next ? `/confirm-email?next=${encodeURIComponent(safeRedirectPath(next))}` : "/confirm-email";
  redirect(target);
}

export async function signInAction(_state: FormState, formData: FormData): Promise<FormState> {
  // The login is echoed back on every failure; the password never is.
  const kept = keepValues(formData, ["password"]);
  const input = parseInput(signInSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const email = await resolveSignInEmail(supabase, input.data.login);
  // One message for "no such login" and for "wrong password". Telling the two
  // apart would turn the card into a roll call of who attends this school
  // (SEC-009).
  if (!email) return done(failure("errors.invalid_credentials", undefined, kept));

  const { error } = await supabase.auth.signInWithPassword({ email, password: input.data.password });
  if (error) {
    if (isUnconfirmed(error)) return startConfirmation(supabase, email, input.data.next);
    return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.invalid_credentials", undefined, kept));
  }

  const access = await getAccess();
  if (access && (!access.isActive || access.status === "blocked")) {
    await supabase.auth.signOut();
    return done(failure("errors.account_inactive", undefined, kept));
  }
  // The school wrote the address down; the person still has to show they can
  // read it before the portal opens.
  if (access && !access.emailVerified) return startConfirmation(supabase, email, input.data.next);

  redirect(postSignInPath(input.data.next));
}

// ---------------------------------------------------------------------------
// Confirming the address the school wrote down
// ---------------------------------------------------------------------------

/**
 * Works both with a session and without one. A project that lets an
 * unconfirmed account sign in leaves a session behind; a project that does not
 * leaves only the cookie written at sign-in. Either way the address comes from
 * the server, never from the form, so nobody can point the code somewhere else.
 */
async function addressAwaitingConfirmation(): Promise<string | null> {
  const access = await getAccess();
  if (access && !access.emailVerified) return access.email;
  return readConfirmEmail();
}

export async function sendConfirmationCodeAction(): Promise<FormState> {
  const email = await addressAwaitingConfirmation();
  if (!email) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (isRateLimited(error)) return done(failure("errors.rate_limited"));
  return done(success("auth.confirm.codeResent"));
}

export async function confirmEmailAction(_state: FormState, formData: FormData): Promise<FormState> {
  const email = await addressAwaitingConfirmation();
  if (!email) redirect("/login");
  const input = parseInput(z.object({ token: otpSchema, next: z.string().optional() }), formDataToObject(formData));
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: input.data.token, type: "email" });
  if (error) return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.invalid_code", { token: ["errors.invalid_code"] }));

  (await cookies()).delete(CONFIRM_COOKIE);
  redirect(postSignInPath(input.data.next));
}

// ---------------------------------------------------------------------------
// Password reset (email code, no account enumeration)
// ---------------------------------------------------------------------------
export async function requestPasswordResetAction(_state: FormState, formData: FormData): Promise<FormState> {
  const input = parseInput(z.object({ email: emailSchema }), formDataToObject(formData), keepValues(formData));
  if (!input.ok) return done(input.result);
  await writeCookie(RESET_COOKIE, input.data.email);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: input.data.email, options: { shouldCreateUser: false } });
  if (isRateLimited(error)) return done(failure("errors.rate_limited"));
  redirect("/reset-password?step=verify");
}

export async function verifyPasswordResetAction(_state: FormState, formData: FormData): Promise<FormState> {
  const email = await readResetEmail();
  if (!email) redirect("/reset-password");
  const input = parseInput(z.object({ token: otpSchema }), formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: input.data.token, type: "email" });
  if (error) return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.invalid_code", { token: ["errors.invalid_code"] }));
  redirect("/reset-password?step=password");
}

export async function setNewPasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const input = parseInput(passwordPairSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/reset-password");
  const { error } = await supabase.auth.updateUser({ password: input.data.password });
  if (error) return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.unexpected"));
  (await cookies()).delete(RESET_COOKIE);
  await supabase.auth.signOut();
  redirect("/login?reason=password-updated");
}
