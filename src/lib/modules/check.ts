import { createServerClient } from "@/lib/supabase/server";

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

  const { data: access } = await supabase
    .from("module_role_access" as never)
    .select(`
      is_visible,
      modules!inner(slug),
      roles!inner(
        id,
        user_roles!inner(user_id)
      )
    ` as never)
    .eq("modules.slug" as never, moduleSlug)
    .eq("roles.user_roles.user_id" as never, user.id)
    .eq("is_visible" as never, true);

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
