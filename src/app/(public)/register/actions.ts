"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const completeSchema = z.object({
  invitationCode: z.string().min(6).max(10).regex(/^[A-Z0-9]+$/),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
});

export type RegistrationState = {
  step: "email" | "otp" | "complete";
  email: string | null;
  error: string | null;
};

export async function sendOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
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
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("OTP send error:", error.message, error.status);
    return { ...prevState, error: `otpSendFailed: ${error.message}` };
  }

  return { step: "otp", email: parsed.data.email, error: null };
}

export async function verifyOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
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

  return { step: "complete", email, error: null };
}

export async function completeRegistrationAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { step: "email", email: null, error: "sessionExpired" };
  }

  const parsed = completeSchema.safeParse({
    invitationCode: formData.get("invitationCode"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidData" };
  }

  const admin = createAdminClient();

  // Validate invitation code (server-side — school_id and role_id from DB, not client)
  const { data: invitation } = await admin
    .from("invitation_codes" as never)
    .select(
      "id, school_id, role_id, max_uses, used_count, expires_at, is_active" as never
    )
    .eq("code" as never, parsed.data.invitationCode)
    .eq("is_active" as never, true)
    .single();

  const inv = invitation as Record<string, unknown> | null;
  if (!inv) {
    return { ...prevState, error: "invalidInvitationCode" };
  }

  if (Number(inv.used_count) >= Number(inv.max_uses)) {
    return { ...prevState, error: "invitationCodeUsed" };
  }

  if (inv.expires_at && new Date(String(inv.expires_at)) < new Date()) {
    return { ...prevState, error: "invitationCodeExpired" };
  }

  // Set password
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });

  if (pwError) {
    return { ...prevState, error: "passwordSetFailed" };
  }

  // Check if user already has a public.users record
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();

  if (existingUser) {
    return { ...prevState, error: "alreadyRegistered" };
  }

  // Create public.users record with school_id from invitation code
  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: String(inv.school_id),
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
    } as never);

  if (userError) {
    return { ...prevState, error: "registrationFailed" };
  }

  // Assign role from invitation code
  await admin
    .from("user_roles" as never)
    .insert({
      user_id: user.id,
      role_id: String(inv.role_id),
      school_id: String(inv.school_id),
    } as never);

  // Increment used_count
  await admin
    .from("invitation_codes" as never)
    .update({ used_count: Number(inv.used_count) + 1 } as never)
    .eq("id" as never, String(inv.id));

  redirect("/dashboard");
}
