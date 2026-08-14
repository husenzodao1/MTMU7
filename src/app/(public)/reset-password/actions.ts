"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  password: z.string().min(8).max(128),
});

export type ResetState = {
  step: "email" | "sent" | "new-password";
  error: string | null;
};

export async function sendResetAction(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { step: "email", error: "invalidEmail" };
  }

  const supabase = await createServerClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent("/reset-password?step=update")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    console.error("Reset password error:", error.message, error.status);
    return { step: "email", error: "resetSendFailed" };
  }

  return { step: "sent", error: null };
}

export async function updatePasswordAction(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { step: "new-password", error: "invalidPassword" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { step: "new-password", error: "passwordUpdateFailed" };
  }

  redirect("/login?message=passwordReset");
}
