import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function isModuleEnabled(moduleSlug: string): Promise<boolean> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("school_modules" as never)
    .select("is_enabled, modules!inner(slug)" as never)
    .eq("modules.slug" as never, moduleSlug)
    .single();

  return (data as Record<string, unknown> | null)?.is_enabled === true;
}

export async function isModuleAccessible(moduleSlug: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const enabled = await isModuleEnabled(moduleSlug);
  if (!enabled) return false;

  const admin = createAdminClient();

  const { data: userRoles } = await admin
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRoles as Array<Record<string, unknown>>) ?? []).map(
    (r) => r.role_id as string
  );
  if (roleIds.length === 0) return false;

  const { data: moduleData } = await admin
    .from("modules" as never)
    .select("id" as never)
    .eq("slug" as never, moduleSlug)
    .single();

  const mod = moduleData as Record<string, unknown> | null;
  if (!mod) return false;

  const { data: access } = await admin
    .from("module_role_access" as never)
    .select("id" as never)
    .eq("module_id" as never, mod.id as never)
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
