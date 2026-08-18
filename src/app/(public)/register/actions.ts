"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatarAction } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { z } from "zod";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

const emailSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  registrationMode: z.enum(["open", "invitation"]).optional(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const invitationCompleteSchema = z.object({
  invitationCode: z.string().min(6).max(10).regex(/^[A-Z0-9]+$/),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
});

const openCompleteSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  enrollmentYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type RegistrationState = {
  step: "email" | "otp" | "complete";
  mode: "open" | "invitation";
  email: string | null;
  roleId: string | null;
  classId: string | null;
  error: string | null;
};

export async function sendOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    roleId: formData.get("roleId") || undefined,
    classId: formData.get("classId") || undefined,
    registrationMode: formData.get("registrationMode") || undefined,
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidEmail" };
  }

  const mode = parsed.data.registrationMode ?? "open";

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    console.error("OTP send error:", error.message, error.status);
    if (error.status === 429) {
      return { ...prevState, error: "rateLimitExceeded" };
    }
    return { ...prevState, error: "otpSendFailed" };
  }

  return {
    step: "otp",
    mode: mode as "open" | "invitation",
    email: parsed.data.email,
    roleId: parsed.data.roleId ?? null,
    classId: parsed.data.classId ?? null,
    error: null,
  };
}

export async function verifyOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const email = prevState.email;
  if (!email) {
    return { ...prevState, step: "email", error: "sessionExpired" };
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

  return { ...prevState, step: "complete", error: null };
}

export async function completeRegistrationAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  if (prevState.mode === "invitation") {
    return completeInvitationRegistration(prevState, formData);
  }
  return completeOpenRegistration(prevState, formData);
}

async function completeInvitationRegistration(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "email", error: "sessionExpired" };
  }

  const parsed = invitationCompleteSchema.safeParse({
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

  const { data: invitation } = await admin
    .from("invitation_codes" as never)
    .select("id, school_id, role_id, max_uses, used_count, expires_at, is_active" as never)
    .eq("code" as never, parsed.data.invitationCode)
    .eq("is_active" as never, true)
    .single();

  const inv = invitation as Record<string, unknown> | null;
  if (!inv) return { ...prevState, error: "invalidInvitationCode" };
  if (Number(inv.used_count) >= Number(inv.max_uses)) return { ...prevState, error: "invitationCodeUsed" };
  if (inv.expires_at && new Date(String(inv.expires_at)) < new Date()) return { ...prevState, error: "invitationCodeExpired" };

  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });
  if (pwError) return { ...prevState, error: "passwordSetFailed" };

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: String(inv.school_id),
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      status: "active",
    } as never);
  if (userError) return { ...prevState, error: "registrationFailed" };

  await admin
    .from("user_roles" as never)
    .insert({
      user_id: user.id,
      role_id: String(inv.role_id),
      school_id: String(inv.school_id),
    } as never);

  await admin
    .from("invitation_codes" as never)
    .update({ used_count: Number(inv.used_count) + 1 } as never)
    .eq("id" as never, String(inv.id));

  redirect("/dashboard");
}

async function completeOpenRegistration(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "email", error: "sessionExpired" };
  }

  const parsed = openCompleteSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
    enrollmentYear: formData.get("enrollmentYear") || undefined,
  });

  if (!parsed.success) return { ...prevState, error: "invalidData" };
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ...prevState, error: "passwordMismatch" };
  }

  const roleId = prevState.roleId;
  if (!roleId) return { ...prevState, step: "email", error: "invalidData" };

  const admin = createAdminClient();

  // Validate role exists and is NOT admin-level
  const { data: roleData } = await admin
    .from("roles" as never)
    .select("id, level, slug" as never)
    .eq("id" as never, roleId)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .single();

  const role = roleData as Record<string, unknown> | null;
  if (!role || Number(role.level) <= 1) {
    return { ...prevState, error: "invalidData" };
  }

  // Check for existing registration request or user
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const { data: existingRequest } = await admin
    .from("registration_requests" as never)
    .select("id, status" as never)
    .eq("auth_user_id" as never, user.id)
    .in("status" as never, ["pending"])
    .single();
  if (existingRequest) return { ...prevState, error: "alreadyPending" };

  // Set password
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });
  if (pwError) return { ...prevState, error: "passwordSetFailed" };

  // Handle avatar upload
  let avatarUrl: string | null = null;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const avatarFormData = new FormData();
    avatarFormData.set("avatar", avatarFile);
    const uploadResult = await uploadAvatarAction(avatarFormData);
    if (uploadResult.url) avatarUrl = uploadResult.url;
  }

  // Build additional data
  const additionalData: Record<string, unknown> = {};
  const subjectIds = formData.getAll("subjectIds");
  if (subjectIds.length > 0) {
    additionalData.subjectIds = subjectIds;
  }

  // Create registration request
  const { error: reqError } = await admin
    .from("registration_requests" as never)
    .insert({
      school_id: DEFAULT_SCHOOL_ID,
      auth_user_id: user.id,
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      requested_role_id: roleId,
      requested_class_id: prevState.classId,
      enrollment_year: parsed.data.enrollmentYear ?? null,
      additional_data: additionalData,
      status: "pending",
    } as never);
  if (reqError) return { ...prevState, error: "registrationFailed" };

  // Create pending user record
  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: DEFAULT_SCHOOL_ID,
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      status: "pending",
      is_active: false,
    } as never);
  if (userError) {
    // Clean up the registration request
    await admin
      .from("registration_requests" as never)
      .delete()
      .eq("auth_user_id" as never, user.id);
    return { ...prevState, error: "registrationFailed" };
  }

  redirect("/pending");
}
