import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";

export async function isModuleEnabled(moduleSlug: string): Promise<boolean> {
  const user = await getUserWithRole();
  if (!user) return false;

  const admin = createAdminClient();

  const { data: mod } = await admin
    .from("modules" as never)
    .select("id" as never)
    .eq("slug" as never, moduleSlug)
    .single();

  if (!mod) return false;

  const { data: sm } = await admin
    .from("school_modules" as never)
    .select("is_enabled" as never)
    .eq("module_id" as never, (mod as Record<string, unknown>).id as never)
    .eq("school_id" as never, user.schoolId)
    .single();

  return (sm as Record<string, unknown> | null)?.is_enabled === true;
}

export async function isModuleAccessible(moduleSlug: string): Promise<boolean> {
  const user = await getUserWithRole();
  if (!user) return false;

  const admin = createAdminClient();

  const { data: mod } = await admin
    .from("modules" as never)
    .select("id" as never)
    .eq("slug" as never, moduleSlug)
    .single();

  if (!mod) return false;
  const moduleId = (mod as Record<string, unknown>).id as string;

  const { data: sm } = await admin
    .from("school_modules" as never)
    .select("is_enabled" as never)
    .eq("module_id" as never, moduleId as never)
    .eq("school_id" as never, user.schoolId)
    .single();

  if ((sm as Record<string, unknown> | null)?.is_enabled !== true) return false;

  const { data: userRoles } = await admin
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRoles as Array<Record<string, unknown>>) ?? []).map(
    (r) => r.role_id as string
  );
  if (roleIds.length === 0) return false;

  const { data: access } = await admin
    .from("module_role_access" as never)
    .select("id" as never)
    .eq("module_id" as never, moduleId as never)
    .in("role_id" as never, roleIds)
    .eq("is_visible" as never, true)
    .limit(1);

  return ((access as unknown[] | null)?.length ?? 0) > 0;
}

export async function canPerformAction(
  moduleSlug: string,
  permissionSlug: string
): Promise<boolean> {
  const accessible = await isModuleAccessible(moduleSlug);
  if (!accessible) return false;

  const { hasPermission } = await import("@/lib/permissions/check");
  return hasPermission(permissionSlug);
}
