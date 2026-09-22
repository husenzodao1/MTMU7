"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, failure, formDataToObject, keepValues, parseInput, success, type FormState } from "@/lib/actions/result";
import { mapDbError } from "@/lib/actions/errors";
import { getAccess } from "@/lib/auth/access";
import { postSignInPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import { DRAFT_COOKIE, RESET_COOKIE, readDraft, readResetEmail, writeShortLivedCookie as writeCookie } from "@/features/auth/draft";
import {
  emailSchema,
  otpSchema,
  passwordPairSchema,
  registrationDetailsSchema,
  type RegistrationDraft,
} from "@/features/auth/schemas";


function isRateLimited(error: { status?: number; code?: string } | null) {
  return Boolean(error && (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"));
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "validation.required").max(128), next: z.string().optional() });

export async function signInAction(_state: FormState, formData: FormData): Promise<FormState> {
  // The address is echoed back on every failure; the password never is.
  const kept = keepValues(formData, ["password"]);
  const input = parseInput(signInSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: input.data.email, password: input.data.password });
  if (error) {
    // One message for "no such account" and for "wrong password". Telling the
    // two apart would let anyone test which addresses are registered here
    // (SEC-009); the sign-in card instead always offers the register link.
    return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.invalid_credentials", undefined, kept));
  }

  // Signing in always ends on the dashboard: an unfinished registration or a
  // request still under review is explained by a banner there, not by sending
  // the visitor to another page.
  const access = await getAccess();
  if (access && (!access.isActive || access.status === "blocked")) {
    await supabase.auth.signOut();
    return done(failure("errors.account_inactive", undefined, kept));
  }
  redirect(postSignInPath(input.data.next));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export interface RegistrationOptions {
  roles: Array<{ slug: string; name_tg: string; name_ru: string | null; name_en: string | null }>;
  classes: Array<{ id: string; name: string; grade_level: number }>;
  registrationOpen: boolean;
}

/** Public options for the selected school (roles open for self-registration, current classes). */
export async function loadRegistrationOptions(schoolSlug: string): Promise<RegistrationOptions | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(schoolSlug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_registration_options", { p_school_slug: schoolSlug });
  const parsed = z
    .object({
      registration_open: z.boolean(),
      roles: z.array(z.object({ slug: z.string(), name_tg: z.string(), name_ru: z.string().nullable(), name_en: z.string().nullable() })),
      classes: z.array(z.object({ id: z.string(), name: z.string(), grade_level: z.number() })),
    })
    .safeParse(data);
  if (!parsed.success) return null;
  return { roles: parsed.data.roles, classes: parsed.data.classes, registrationOpen: parsed.data.registration_open };
}

/**
 * Step 1: validate details, keep them in an httpOnly draft cookie and send an
 * email code. The response is identical whether or not the email already has
 * an account, so the form cannot be used to enumerate users (SEC-009).
 */
export async function startRegistrationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const kept = keepValues(formData);
  const input = parseInput(registrationDetailsSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);
  const draft = input.data;

  const options = await loadRegistrationOptions(draft.schoolSlug);
  if (!options) return done(failure("errors.invalid_school", { schoolSlug: ["errors.invalid_school"] }, kept));
  if (!draft.invitationCode) {
    if (!options.registrationOpen) return done(failure("errors.registration_closed", undefined, kept));
    if (!options.roles.some((r) => r.slug === draft.roleSlug)) return done(failure("errors.invalid_role", { roleSlug: ["errors.invalid_role"] }, kept));
    if (draft.classId && !options.classes.some((c) => c.id === draft.classId)) {
      return done(failure("errors.invalid_class", { classId: ["errors.invalid_class"] }, kept));
    }
  }

  await writeCookie(DRAFT_COOKIE, JSON.stringify(draft));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: draft.email, options: { shouldCreateUser: true } });
  if (isRateLimited(error)) return done(failure("errors.rate_limited"));
  // Other delivery errors are not revealed; the user can request a new code.
  redirect("/register?step=verify");
}

export async function resendRegistrationCodeAction(): Promise<FormState> {
  const draft = await readDraft();
  if (!draft) redirect("/register");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: draft.email, options: { shouldCreateUser: true } });
  if (isRateLimited(error)) return done(failure("errors.rate_limited"));
  return done(success("auth.register.codeResent"));
}

/** Step 2: verify the email code; existing accounts are simply signed in. */
export async function verifyRegistrationCodeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const draft = await readDraft();
  if (!draft) redirect("/register");
  const input = parseInput(z.object({ token: otpSchema }), formDataToObject(formData));
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: draft.email, token: input.data.token, type: "email" });
  if (error) return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.invalid_code", { token: ["errors.invalid_code"] }));

  const access = await getAccess();
  if (access) {
    (await cookies()).delete(DRAFT_COOKIE);
    redirect("/dashboard");
  }
  redirect("/register?step=password");
}

async function submitRegistration(draft: RegistrationDraft): Promise<FormState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_registration", {
    p_school_slug: draft.schoolSlug,
    p_first_name: draft.firstName,
    p_last_name: draft.lastName,
    p_middle_name: draft.middleName,
    p_role_slug: draft.roleSlug,
    p_class_id: draft.classId,
    p_details: {
      ...(draft.phone ? { phone: draft.phone } : {}),
      ...(draft.employeeNumber ? { employee_number: draft.employeeNumber } : {}),
    },
    p_invitation_code: draft.invitationCode,
  });
  if (error) {
    if (error.message === "already_registered") redirect("/dashboard");
    return done(mapDbError(error));
  }
  (await cookies()).delete(DRAFT_COOKIE);
  const status = (data as { status?: string } | null)?.status;
  // Either way the dashboard opens; a request awaiting approval says so there.
  redirect(status === "active" ? "/dashboard?welcome=1" : "/dashboard");
}

/** Step 3: set the password and create the account row atomically in the database. */
export async function completeRegistrationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const draft = await readDraft();
  if (!draft) redirect("/register");
  const input = parseInput(passwordPairSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/register?step=verify");

  const { error } = await supabase.auth.updateUser({ password: input.data.password });
  if (error) return done(failure(isRateLimited(error) ? "errors.rate_limited" : "errors.unexpected"));

  return (await submitRegistration(draft)) ?? done(failure("errors.unexpected"));
}

/** For signed-in users whose account row was never created (interrupted registration). */
export async function completeProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  if (!claims?.claims?.sub || !email) redirect("/login");

  const raw = { ...formDataToObject(formData), email };
  const kept = keepValues(formData, ["password", "confirmPassword"]);
  const details = parseInput(registrationDetailsSchema, raw, kept);
  if (!details.ok) return done(details.result);

  // This visitor already has a session, so they may already have a password.
  // Setting one is optional here; an empty pair simply keeps the current one.
  const fields = raw as Record<string, unknown>;
  const wantsNewPassword = Boolean(fields.password) || Boolean(fields.confirmPassword);
  if (wantsNewPassword) {
    const passwords = parseInput(passwordPairSchema, raw, kept);
    if (!passwords.ok) return done(passwords.result);
    const { error } = await supabase.auth.updateUser({ password: passwords.data.password });
    if (error) {
      if (isRateLimited(error)) return done(failure("errors.rate_limited", undefined, kept));
      // Supabase refuses a password identical to the current one; say so.
      if (/different from the old password|same_password/i.test(`${error.code ?? ""} ${error.message}`)) {
        return done(failure("errors.validation", { password: ["validation.passwordSame"] }, kept));
      }
      return done(failure("errors.unexpected", undefined, kept));
    }
  }
  return (await submitRegistration(details.data)) ?? done(failure("errors.unexpected"));
}

export async function restartRegistrationAction(): Promise<void> {
  (await cookies()).delete(DRAFT_COOKIE);
  redirect("/register");
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
