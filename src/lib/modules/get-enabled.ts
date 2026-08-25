import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";

export async function getEnabledModulesForUser(): Promise<string[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const admin = createAdminClient();

  const { data: userRolesData } = await admin
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRolesData ?? []) as Array<Record<string, unknown>>).map(
    (row) => row.role_id as string
  );

  if (roleIds.length === 0) return [];

  const { data: accessData } = await admin
    .from("module_role_access" as never)
    .select("module_id" as never)
    .in("role_id" as never, roleIds)
    .eq("is_visible" as never, true);

  const visibleModuleIds = [
    ...new Set(
      ((accessData ?? []) as Array<Record<string, unknown>>).map(
        (r) => r.module_id as string
      )
    ),
  ];
  if (visibleModuleIds.length === 0) return [];

  const { data: enabledData } = await admin
    .from("school_modules" as never)
    .select("module_id" as never)
    .eq("is_enabled" as never, true)
    .eq("school_id" as never, user.schoolId)
    .in("module_id" as never, visibleModuleIds);

  const enabledIds = new Set(
    ((enabledData ?? []) as Array<Record<string, unknown>>).map(
      (r) => r.module_id as string
    )
  );
  if (enabledIds.size === 0) return [];

  const { data: modulesData } = await admin
    .from("modules" as never)
    .select("id, slug" as never)
    .in("id" as never, Array.from(enabledIds));

  return ((modulesData ?? []) as Array<Record<string, unknown>>).map(
    (m) => m.slug as string
  );
}

/**
 * All module slugs enabled for the school, regardless of role visibility.
 * Useful for admin surfaces (e.g. module management) that need the full
 * enabled set rather than the per-user filtered view.
 */
export async function getEnabledModuleSlugs(): Promise<string[]> {
  const admin = createAdminClient();

  const { data: enabledData } = await admin
    .from("school_modules" as never)
    .select("module_id" as never)
    .eq("is_enabled" as never, true);

  if (!enabledData || (enabledData as unknown[]).length === 0) return [];

  const moduleIds = (enabledData as Array<Record<string, unknown>>).map(
    (r) => r.module_id as string
  );

  const { data: modulesData } = await admin
    .from("modules" as never)
    .select("slug" as never)
    .in("id" as never, moduleIds);

  return ((modulesData ?? []) as Array<Record<string, unknown>>).map(
    (m) => m.slug as string
  );
}
