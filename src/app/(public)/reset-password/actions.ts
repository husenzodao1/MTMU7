"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const passwordSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export type ResetState = {
  step: "email" | "otp" | "new-password";
  email: string | null;
  error: string | null;
};

export async function sendResetOtpAction(
  prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidEmail" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error("Reset OTP send error:", error.message, error.status);
    if (error.status === 429) {
      return { ...prevState, error: "rateLimitExceeded" };
    }
    if (error.message?.includes("Signups not allowed for otp")) {
      return { ...prevState, error: "resetSendFailed" };
    }
    return { ...prevState, error: "resetSendFailed" };
  }

  return { step: "otp", email: parsed.data.email, error: null };
}

export async function verifyResetOtpAction(
  prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = prevState.email;
  if (!email) {
    return { step: "email", email: null, error: "sessionExpired" };
  }

  const parsed = otpSchema.safeParse({
    email,
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidOtp" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error) {
    return { ...prevState, error: "otpVerifyFailed" };
  }

  return { step: "new-password", email, error: null };
}

export async function updatePasswordAction(
  prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidPassword" };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ...prevState, error: "passwordMismatch" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ...prevState, error: "passwordUpdateFailed" };
  }

  await supabase.auth.signOut();
  redirect("/login?message=passwordReset");
}
