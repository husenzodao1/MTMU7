"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { uploadAvatarAction } from "@/lib/supabase/storage";
import { z } from "zod";

export interface FullProfile {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  avatarUrl: string | null;
  schoolName: string;
  roles: Array<{ slug: string; nameTg: string; nameRu: string | null }>;
  className: string | null;
  subjects: Array<{ nameTg: string; nameRu: string | null }>;
}

export async function getFullProfile(): Promise<FullProfile | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select(
      "public_id, first_name, last_name, middle_name, email, phone, date_of_birth, gender, avatar_url, schools!inner(name_tg)" as never
    )
    .eq("id" as never, user.id)
    .single();

  if (!data) return null;

  const row = data as Record<string, unknown>;
  const school = row.schools as Record<string, unknown>;

  let className: string | null = null;
  const { data: studentClass } = await supabase
    .from("class_students" as never)
    .select("classes:class_id(name)" as never)
    .eq("student_id" as never, user.id)
    .eq("is_active" as never, true)
    .limit(1)
    .single();
  if (studentClass) {
    const sc = studentClass as Record<string, unknown>;
    const cls = sc.classes as Record<string, unknown> | null;
    className = (cls?.name as string) ?? null;
  }

  let subjects: Array<{ nameTg: string; nameRu: string | null }> = [];
  const { data: teacherSubjects } = await supabase
    .from("teacher_subjects" as never)
    .select("subjects:subject_id(name_tg, name_ru)" as never)
    .eq("teacher_id" as never, user.id);
  if (teacherSubjects) {
    subjects = (teacherSubjects as Array<Record<string, unknown>>).map((ts) => {
      const s = ts.subjects as Record<string, unknown>;
      return { nameTg: s.name_tg as string, nameRu: (s.name_ru as string) ?? null };
    });
  }

  return {
    id: user.id,
    publicId: row.public_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    middleName: row.middle_name as string | null,
    email: row.email as string,
    phone: row.phone as string | null,
    dateOfBirth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    avatarUrl: row.avatar_url as string | null,
    schoolName: school.name_tg as string,
    roles: user.roles.map((r) => ({ slug: r.slug, nameTg: r.nameTg, nameRu: r.nameRu })),
    className,
    subjects,
  };
}

export interface PublicProfile {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  roles: Array<{ slug: string; nameTg: string; nameRu: string | null }>;
  className: string | null;
  subjects: Array<{ nameTg: string; nameRu: string | null }>;
  friendStatus: "none" | "pending_sent" | "pending_received" | "accepted";
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const user = await getUserWithRole();
  if (!user) return null;
  if (userId === user.id) return null;

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, avatar_url" as never)
    .eq("id" as never, userId)
    .eq("is_active" as never, true)
    .single();

  if (!data) return null;
  const row = data as Record<string, unknown>;

  const { data: rolesData } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(slug, name_tg, name_ru)" as never)
    .eq("user_id" as never, userId);

  const roles = ((rolesData ?? []) as Array<Record<string, unknown>>).map((ur) => {
    const r = ur.roles as Record<string, unknown>;
    return { slug: r.slug as string, nameTg: r.name_tg as string, nameRu: (r.name_ru as string) ?? null };
  });

  let className: string | null = null;
  const { data: studentClass } = await supabase
    .from("class_students" as never)
    .select("classes:class_id(name)" as never)
    .eq("student_id" as never, userId)
    .eq("is_active" as never, true)
    .limit(1)
    .single();
  if (studentClass) {
    const sc = studentClass as Record<string, unknown>;
    const cls = sc.classes as Record<string, unknown> | null;
    className = (cls?.name as string) ?? null;
  }

  let subjects: Array<{ nameTg: string; nameRu: string | null }> = [];
  const { data: teacherSubjects } = await supabase
    .from("teacher_subjects" as never)
    .select("subjects:subject_id(name_tg, name_ru)" as never)
    .eq("teacher_id" as never, userId);
  if (teacherSubjects) {
    subjects = (teacherSubjects as Array<Record<string, unknown>>).map((ts) => {
      const s = ts.subjects as Record<string, unknown>;
      return { nameTg: s.name_tg as string, nameRu: (s.name_ru as string) ?? null };
    });
  }

  let friendStatus: PublicProfile["friendStatus"] = "none";
  const { data: sentReq } = await supabase
    .from("friend_requests" as never)
    .select("status" as never)
    .eq("sender_id" as never, user.id)
    .eq("receiver_id" as never, userId)
    .in("status" as never, ["pending", "accepted"])
    .limit(1)
    .single();
  if (sentReq) {
    const s = (sentReq as Record<string, unknown>).status as string;
    friendStatus = s === "accepted" ? "accepted" : "pending_sent";
  } else {
    const { data: recvReq } = await supabase
      .from("friend_requests" as never)
      .select("status" as never)
      .eq("sender_id" as never, userId)
      .eq("receiver_id" as never, user.id)
      .in("status" as never, ["pending", "accepted"])
      .limit(1)
      .single();
    if (recvReq) {
      const s = (recvReq as Record<string, unknown>).status as string;
      friendStatus = s === "accepted" ? "accepted" : "pending_received";
    }
  }

  return {
    id: row.id as string,
    publicId: row.public_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    middleName: row.middle_name as string | null,
    avatarUrl: row.avatar_url as string | null,
    roles,
    className,
    subjects,
    friendStatus,
  };
}

const updateProfileSchema = z.object({
  phone: z.string().max(50).optional().or(z.literal("")),
  middle_name: z.string().max(100).optional().or(z.literal("")),
});

export async function updateProfile(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "Unauthorized" };

  const parsed = updateProfileSchema.safeParse({
    phone: formData.get("phone"),
    middle_name: formData.get("middle_name"),
  });

  if (!parsed.success) return { error: "Validation failed" };

  const supabase = await createServerClient();

  let avatarUrl: string | undefined;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const avatarFormData = new FormData();
    avatarFormData.set("avatar", avatarFile);
    const uploadResult = await uploadAvatarAction(avatarFormData);
    if (uploadResult.url) avatarUrl = uploadResult.url;
  }

  const updateData: Record<string, unknown> = {
    phone: parsed.data.phone || null,
    middle_name: parsed.data.middle_name || null,
  };
  if (avatarUrl) updateData.avatar_url = avatarUrl;

  const { error } = await supabase
    .from("users" as never)
    .update(updateData as never)
    .eq("id" as never, user.id);

  if (error) return { error: error.message };
  return { success: true };
}
