"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const approveSchema = z.object({
  requestId: z.string().uuid(),
  roleId: z.string().uuid(),
  classId: z.string().uuid().optional(),
});

const rejectSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function approveUserAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = approveSchema.safeParse({
    requestId: formData.get("requestId"),
    roleId: formData.get("roleId"),
    classId: formData.get("classId") || undefined,
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();

  // Get the registration request
  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("*" as never)
    .eq("id" as never, parsed.data.requestId)
    .eq("school_id" as never, admin.schoolId)
    .eq("status" as never, "pending")
    .single();

  const req = request as Record<string, unknown> | null;
  if (!req) return { error: "invalidData", success: false };

  // Validate role is not admin-level
  const { data: roleData } = await supabase
    .from("roles" as never)
    .select("level" as never)
    .eq("id" as never, parsed.data.roleId)
    .single();

  const role = roleData as Record<string, unknown> | null;
  if (!role || Number(role.level) <= 1) {
    return { error: "invalidData", success: false };
  }

  const userId = req.auth_user_id as string;

  // Update user status to active
  await supabase
    .from("users" as never)
    .update({ status: "active", is_active: true } as never)
    .eq("id" as never, userId);

  // Assign role
  await supabase
    .from("user_roles" as never)
    .insert({
      user_id: userId,
      role_id: parsed.data.roleId,
      school_id: admin.schoolId,
      assigned_by: admin.id,
    } as never);

  // For students: assign to class
  if (parsed.data.classId) {
    await supabase
      .from("class_students" as never)
      .insert({
        class_id: parsed.data.classId,
        student_id: userId,
        school_id: admin.schoolId,
      } as never);

    // Get the academic year for the class
    const { data: classData } = await supabase
      .from("classes" as never)
      .select("academic_year_id" as never)
      .eq("id" as never, parsed.data.classId)
      .single();

    const cls = classData as Record<string, unknown> | null;
    if (cls) {
      await supabase
        .from("student_enrollments" as never)
        .insert({
          school_id: admin.schoolId,
          student_id: userId,
          class_id: parsed.data.classId,
          academic_year_id: cls.academic_year_id as string,
          enrolled_by: admin.id,
        } as never);
    }
  }

  // Update registration request
  await supabase
    .from("registration_requests" as never)
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.requestId);

  // Log to user_status_history
  await supabase
    .from("user_status_history" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: userId,
      action: "approved",
      old_value: "pending",
      new_value: "active",
      performed_by: admin.id,
    } as never);

  // Log to audit_logs
  await supabase
    .from("audit_logs" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: admin.id,
      user_public_id: admin.publicId,
      action: "update",
      entity_type: "registration_request",
      entity_id: parsed.data.requestId,
      old_values: { status: "pending" },
      new_values: { status: "approved", role_id: parsed.data.roleId },
    } as never);

  revalidatePath("/admin/pending");
  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export async function rejectUserAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = rejectSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();

  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("auth_user_id" as never)
    .eq("id" as never, parsed.data.requestId)
    .eq("school_id" as never, admin.schoolId)
    .eq("status" as never, "pending")
    .single();

  const req = request as Record<string, unknown> | null;
  if (!req) return { error: "invalidData", success: false };

  const userId = req.auth_user_id as string;

  // Update user status
  await supabase
    .from("users" as never)
    .update({ status: "rejected" } as never)
    .eq("id" as never, userId);

  // Update registration request
  await supabase
    .from("registration_requests" as never)
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.requestId);

  // Log to user_status_history
  await supabase
    .from("user_status_history" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: userId,
      action: "rejected",
      old_value: "pending",
      new_value: "rejected",
      performed_by: admin.id,
      notes: parsed.data.reason,
    } as never);

  revalidatePath("/admin/pending");
  return { error: null, success: true };
}
