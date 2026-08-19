"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatarAction } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { z } from "zod";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

const openRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  roleId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  enrollmentYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

const invitationRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  invitationCode: z.string().min(6).max(10).regex(/^[A-Z0-9]+$/),
});

export type RegistrationState = {
  mode: "open" | "invitation";
  error: string | null;
};

export async function registerAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const mode = (formData.get("registrationMode") as string) ?? "open";

  if (mode === "invitation") {
    return registerWithInvitation(prevState, formData);
  }
  return registerOpen(prevState, formData);
}

async function registerOpen(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = openRegistrationSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
    roleId: formData.get("roleId"),
    classId: formData.get("classId") || undefined,
    enrollmentYear: formData.get("enrollmentYear") || undefined,
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidData" };
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ...prevState, error: "passwordMismatch" };
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
  if (!role || Number(role.level) <= 1) {
    return { ...prevState, error: "invalidData" };
  }

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("email" as never, parsed.data.email)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (signUpError || !signUpData.user) {
    if (signUpError?.message?.includes("already been registered")) {
      return { ...prevState, error: "alreadyRegistered" };
    }
    return { ...prevState, error: "registrationFailed" };
  }

  const userId = signUpData.user.id;

  let avatarUrl: string | null = null;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const avatarFormData = new FormData();
    avatarFormData.set("avatar", avatarFile);
    const uploadResult = await uploadAvatarAction(avatarFormData);
    if (uploadResult.url) avatarUrl = uploadResult.url;
  }

  const additionalData: Record<string, unknown> = {};
  const subjectIds = formData.getAll("subjectIds");
  if (subjectIds.length > 0) {
    additionalData.subjectIds = subjectIds;
  }

  const { error: reqError } = await admin
    .from("registration_requests" as never)
    .insert({
      school_id: DEFAULT_SCHOOL_ID,
      auth_user_id: userId,
      email: parsed.data.email,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      requested_role_id: parsed.data.roleId,
      requested_class_id: parsed.data.classId ?? null,
      enrollment_year: parsed.data.enrollmentYear ?? null,
      additional_data: additionalData,
      status: "pending",
    } as never);
  if (reqError) {
    await admin.auth.admin.deleteUser(userId);
    return { ...prevState, error: "registrationFailed" };
  }

  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: userId,
      school_id: DEFAULT_SCHOOL_ID,
      email: parsed.data.email,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      status: "pending",
      is_active: false,
    } as never);
  if (userError) {
    await admin
      .from("registration_requests" as never)
      .delete()
      .eq("auth_user_id" as never, userId);
    await admin.auth.admin.deleteUser(userId);
    return { ...prevState, error: "registrationFailed" };
  }

  redirect("/pending");
}

async function registerWithInvitation(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = invitationRegistrationSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
    invitationCode: formData.get("invitationCode"),
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

  const { data: signUpData, error: signUpError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (signUpError || !signUpData.user) {
    if (signUpError?.message?.includes("already been registered")) {
      return { ...prevState, error: "alreadyRegistered" };
    }
    return { ...prevState, error: "registrationFailed" };
  }

  const userId = signUpData.user.id;

  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: userId,
      school_id: String(inv.school_id),
      email: parsed.data.email,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      status: "active",
    } as never);
  if (userError) {
    await admin.auth.admin.deleteUser(userId);
    return { ...prevState, error: "registrationFailed" };
  }

  await admin
    .from("user_roles" as never)
    .insert({
      user_id: userId,
      role_id: String(inv.role_id),
      school_id: String(inv.school_id),
    } as never);

  await admin
    .from("invitation_codes" as never)
    .update({ used_count: Number(inv.used_count) + 1 } as never)
    .eq("id" as never, String(inv.id));

  redirect("/login?registered=true");
}
