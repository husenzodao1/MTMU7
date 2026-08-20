"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatarAction } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { z } from "zod";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

const emailSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  roleId: z.string().uuid(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const passwordSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export type RegistrationState = {
  step: "info" | "otp" | "password" | "details";
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  roleId: string | null;
  roleSlug: string | null;
  error: string | null;
};

export async function sendOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
    roleId: formData.get("roleId"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidData" };
  }

  const admin = createAdminClient();

  const { data: roleData } = await admin
    .from("roles" as never)
    .select("id, level, slug" as never)
    .eq("id" as never, parsed.data.roleId)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .single();

  const role = roleData as Record<string, unknown> | null;
  if (!role || Number(role.level) <= 3) {
    return { ...prevState, error: "invalidData" };
  }

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("email" as never, parsed.data.email)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.status === 429) {
      return { ...prevState, error: "rateLimitExceeded" };
    }
    return { ...prevState, error: "otpSendFailed" };
  }

  return {
    step: "otp",
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    middleName: parsed.data.middleName ?? null,
    roleId: parsed.data.roleId,
    roleSlug: role.slug as string,
    error: null,
  };
}

export async function verifyOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const email = prevState.email;
  if (!email) {
    return { ...prevState, step: "info", error: "sessionExpired" };
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

  return { ...prevState, step: "password", error: null };
}

export async function setPasswordAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { ...prevState, error: "invalidPassword" };
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ...prevState, error: "passwordMismatch" };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "info", error: "sessionExpired" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });

  if (error) return { ...prevState, error: "passwordSetFailed" };

  const roleSlug = prevState.roleSlug;
  if (roleSlug === "student" || roleSlug === "teacher") {
    return { ...prevState, step: "details", error: null };
  }

  return completeRegistration(prevState, user.id, new FormData());
}

export async function completeDetailsAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "info", error: "sessionExpired" };
  }

  return completeRegistration(prevState, user.id, formData);
}

async function completeRegistration(
  prevState: RegistrationState,
  userId: string,
  formData: FormData
): Promise<RegistrationState> {
  const admin = createAdminClient();

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, userId)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  let avatarUrl: string | null = null;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const avatarFormData = new FormData();
    avatarFormData.set("avatar", avatarFile);
    const uploadResult = await uploadAvatarAction(avatarFormData);
    if (uploadResult.url) avatarUrl = uploadResult.url;
  }

  const additionalData: Record<string, unknown> = {};
  const classId = formData.get("classId") as string | null;
  const enrollmentYear = formData.get("enrollmentYear") as string | null;
  const subjectIds = formData.getAll("subjectIds");
  const education = formData.get("education") as string | null;
  const university = formData.get("university") as string | null;
  const workStartYear = formData.get("workStartYear") as string | null;

  if (subjectIds.length > 0) additionalData.subjectIds = subjectIds;
  if (education) additionalData.education = education;
  if (university) additionalData.university = university;
  if (workStartYear) additionalData.workStartYear = workStartYear;

  const { error: reqError } = await admin
    .from("registration_requests" as never)
    .insert({
      school_id: DEFAULT_SCHOOL_ID,
      auth_user_id: userId,
      email: prevState.email,
      first_name: prevState.firstName,
      last_name: prevState.lastName,
      middle_name: prevState.middleName,
      avatar_url: avatarUrl,
      requested_role_id: prevState.roleId,
      requested_class_id: classId || null,
      enrollment_year: enrollmentYear ? Number(enrollmentYear) : null,
      additional_data: additionalData,
      status: "pending",
    } as never);
  if (reqError) {
    return { ...prevState, error: "registrationFailed" };
  }

  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: userId,
      school_id: DEFAULT_SCHOOL_ID,
      email: prevState.email,
      first_name: prevState.firstName,
      last_name: prevState.lastName,
      middle_name: prevState.middleName,
      avatar_url: avatarUrl,
      status: "pending",
      is_active: false,
    } as never);
  if (userError) {
    await admin
      .from("registration_requests" as never)
      .delete()
      .eq("auth_user_id" as never, userId);
    return { ...prevState, error: "registrationFailed" };
  }

  redirect("/pending");
}
