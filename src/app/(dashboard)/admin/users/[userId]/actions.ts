"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export async function assignRoleAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("user_roles" as never)
    .insert({
      user_id: parsed.data.userId,
      role_id: parsed.data.roleId,
      school_id: admin.schoolId,
      assigned_by: admin.id,
    } as never);

  if (error) {
    if (error.code === "23505") return { error: "alreadyAssigned", success: false };
    return { error: "saveFailed", success: false };
  }

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { error: null, success: true };
}

export async function removeRoleAction(userId: string, roleId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("user_roles" as never)
    .delete()
    .eq("user_id" as never, userId)
    .eq("role_id" as never, roleId);

  revalidatePath(`/admin/users/${userId}`);
}
