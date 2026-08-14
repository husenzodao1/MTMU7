"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function togglePermissionAction(
  roleId: string,
  permissionId: string,
  assign: boolean
) {
  await requireAdmin();

  const supabase = await createServerClient();

  if (assign) {
    await supabase
      .from("role_permissions" as never)
      .insert({ role_id: roleId, permission_id: permissionId } as never);
  } else {
    await supabase
      .from("role_permissions" as never)
      .delete()
      .eq("role_id" as never, roleId)
      .eq("permission_id" as never, permissionId);
  }

  revalidatePath("/admin/roles");
}
