"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const toggleModuleSchema = z.object({
  moduleId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function toggleModuleAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  await requireAdmin();

  const parsed = toggleModuleSchema.safeParse({
    moduleId: formData.get("moduleId"),
    enabled: formData.get("enabled") === "true",
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("school_modules" as never)
    .update({
      is_enabled: parsed.data.enabled,
    } as never)
    .eq("module_id" as never, parsed.data.moduleId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

const toggleRoleVisibilitySchema = z.object({
  moduleId: z.string().uuid(),
  roleId: z.string().uuid(),
  visible: z.boolean(),
});

export async function toggleRoleVisibilityAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  await requireAdmin();

  const parsed = toggleRoleVisibilitySchema.safeParse({
    moduleId: formData.get("moduleId"),
    roleId: formData.get("roleId"),
    visible: formData.get("visible") === "true",
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("module_role_access" as never)
    .update({ is_visible: parsed.data.visible } as never)
    .eq("module_id" as never, parsed.data.moduleId)
    .eq("role_id" as never, parsed.data.roleId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}
