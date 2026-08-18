"use server";

import { requireSuperAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export async function changeUserRoleAction(userId: string, newRoleId: string) {
  uuidSchema.parse(userId);
  uuidSchema.parse(newRoleId);
  const admin = await requireSuperAdmin();
  if (admin.id === userId) throw new Error("Cannot change own role");
  const supabase = await createServerClient();

  const { data: roleData } = await supabase
    .from("roles" as never)
    .select("id, slug, level, name_tg" as never)
    .eq("id" as never, newRoleId)
    .eq("school_id" as never, admin.schoolId)
    .single();
  const role = roleData as Record<string, unknown> | null;
  if (!role) throw new Error("Invalid role");

  const { data: oldRoles } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(name_tg)" as never)
    .eq("user_id" as never, userId);
  const oldRoleNames = ((oldRoles ?? []) as Array<Record<string, unknown>>)
    .map((r) => ((r.roles as Record<string, unknown>).name_tg as string))
    .join(", ");

  await supabase.from("user_roles" as never).delete().eq("user_id" as never, userId);
  await supabase.from("user_roles" as never).insert({
    user_id: userId, role_id: newRoleId, school_id: admin.schoolId, assigned_by: admin.id,
  } as never);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "role_changed",
    old_value: oldRoleNames, new_value: role.name_tg as string, performed_by: admin.id,
  } as never);
  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "user_roles", entity_id: userId,
    old_values: { roles: oldRoleNames }, new_values: { role: role.name_tg },
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function blockUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  if (admin.id === userId) throw new Error("Cannot block self");
  const supabase = await createServerClient();

  const { data: targetUser } = await supabase
    .from("users" as never).select("status" as never).eq("id" as never, userId).single();
  const target = targetUser as Record<string, unknown> | null;
  const oldStatus = (target?.status as string) ?? "active";

  await supabase.from("users" as never)
    .update({ status: "blocked", is_active: false } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "blocked",
    old_value: oldStatus, new_value: "blocked", performed_by: admin.id,
  } as never);
  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "users", entity_id: userId,
    old_values: { status: oldStatus }, new_values: { status: "blocked" },
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function unblockUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  await supabase.from("users" as never)
    .update({ status: "active", is_active: true } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "unblocked",
    old_value: "blocked", new_value: "active", performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function graduateUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: enrollments } = await supabase
    .from("student_enrollments" as never)
    .select("id" as never).eq("student_id" as never, userId);
  const enrollmentCount = (enrollments ?? []).length;
  const currentYear = new Date().getFullYear();

  await supabase.from("users" as never).update({
    status: "graduated", graduation_year: currentYear,
    graduation_date: new Date().toISOString().split("T")[0],
    years_in_school: enrollmentCount > 0 ? enrollmentCount : null,
  } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "graduated",
    old_value: "active", new_value: "graduated", performed_by: admin.id,
    notes: `Graduation year: ${currentYear}`,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function transferClassAction(userId: string, newClassId: string) {
  uuidSchema.parse(userId);
  uuidSchema.parse(newClassId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldAssignment } = await supabase
    .from("class_students" as never)
    .select("classes:class_id(name)" as never)
    .eq("student_id" as never, userId).single();
  const old = oldAssignment as Record<string, unknown> | null;
  const oldClassName = old ? ((old.classes as Record<string, unknown>).name as string) : null;

  await supabase.from("class_students" as never).delete().eq("student_id" as never, userId);
  await supabase.from("class_students" as never).insert({
    class_id: newClassId, student_id: userId, school_id: admin.schoolId,
  } as never);

  const { data: newClass } = await supabase
    .from("classes" as never).select("name, academic_year_id" as never)
    .eq("id" as never, newClassId).single();
  const newCls = newClass as Record<string, unknown> | null;

  if (newCls) {
    await supabase.from("student_enrollments" as never).upsert({
      school_id: admin.schoolId, student_id: userId, class_id: newClassId,
      academic_year_id: newCls.academic_year_id as string, enrolled_by: admin.id,
    } as never, { onConflict: "student_id,academic_year_id" });
  }

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "class_changed",
    old_value: oldClassName, new_value: newCls ? (newCls.name as string) : null,
    performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
}

export async function changeAcademicYearEnrollmentAction(
  userId: string, academicYearId: string, classId: string
) {
  uuidSchema.parse(userId);
  uuidSchema.parse(academicYearId);
  uuidSchema.parse(classId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  await supabase.from("student_enrollments" as never).upsert({
    school_id: admin.schoolId, student_id: userId, class_id: classId,
    academic_year_id: academicYearId, enrolled_by: admin.id,
  } as never, { onConflict: "student_id,academic_year_id" });

  const { data: cls } = await supabase
    .from("classes" as never).select("name" as never).eq("id" as never, classId).single();
  const clsRow = cls as Record<string, unknown> | null;
  const { data: yr } = await supabase
    .from("academic_years" as never).select("name" as never).eq("id" as never, academicYearId).single();
  const yrRow = yr as Record<string, unknown> | null;

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "class_changed",
    new_value: `${clsRow?.name ?? ""} (${yrRow?.name ?? ""})`, performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
}

export async function assignHomeroomTeacherAction(classId: string, teacherId: string) {
  uuidSchema.parse(classId);
  uuidSchema.parse(teacherId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldClass } = await supabase
    .from("classes" as never).select("homeroom_teacher_id, name" as never)
    .eq("id" as never, classId).single();
  const oldCls = oldClass as Record<string, unknown> | null;

  await supabase.from("classes" as never)
    .update({ homeroom_teacher_id: teacherId } as never)
    .eq("id" as never, classId);

  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "classes", entity_id: classId,
    old_values: { homeroom_teacher_id: oldCls?.homeroom_teacher_id ?? null },
    new_values: { homeroom_teacher_id: teacherId },
  } as never);

  revalidatePath(`/admin/users/${teacherId}`);
}

export async function editUserDataAction(
  userId: string, data: { firstName?: string; lastName?: string; middleName?: string }
) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldUser } = await supabase
    .from("users" as never)
    .select("first_name, last_name, middle_name" as never)
    .eq("id" as never, userId).single();
  const old = oldUser as Record<string, unknown> | null;

  const updates: Record<string, unknown> = {};
  if (data.firstName !== undefined) updates.first_name = data.firstName;
  if (data.lastName !== undefined) updates.last_name = data.lastName;
  if (data.middleName !== undefined) updates.middle_name = data.middleName || null;

  if (Object.keys(updates).length === 0) return;

  await supabase.from("users" as never).update(updates as never).eq("id" as never, userId);

  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "users", entity_id: userId,
    old_values: { first_name: old?.first_name, last_name: old?.last_name, middle_name: old?.middle_name },
    new_values: updates,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
