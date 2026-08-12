import { createServerClient } from "@/lib/supabase/server";

/**
 * Resolves the module slugs the current authenticated user should see in
 * navigation: modules that are (a) enabled for the school and (b) visible
 * to at least one of the user's roles.
 *
 * Implemented as a small sequence of simple queries rather than one deep
 * nested join — the Supabase JS client's PostgREST embed syntax does not
 * reliably support multi-level dotted filters across sibling tables
 * (module_role_access <-> school_modules) that don't share a direct FK.
 */
export async function getEnabledModulesForUser(): Promise<string[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // 1. Role IDs assigned to the current user.
  const { data: userRolesData } = await supabase
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRolesData ?? []) as Array<Record<string, unknown>>).map(
    (row) => row.role_id as string
  );

  if (roleIds.length === 0) return [];

  // 2. Modules visible to any of those roles.
  const { data: accessData } = await supabase
    .from("module_role_access" as never)
    .select("modules!inner(id, slug)" as never)
    .in("role_id" as never, roleIds)
    .eq("is_visible" as never, true);

  const visibleModules = new Map<string, string>();
  for (const row of (accessData ?? []) as Array<Record<string, unknown>>) {
    const mod = row.modules as Record<string, unknown> | null;
    if (mod?.id && mod?.slug) {
      visibleModules.set(mod.id as string, mod.slug as string);
    }
  }

  if (visibleModules.size === 0) return [];

  // 3. Of those visible modules, keep the ones enabled for the school.
  const { data: enabledData } = await supabase
    .from("school_modules" as never)
    .select("module_id" as never)
    .eq("is_enabled" as never, true)
    .in("module_id" as never, Array.from(visibleModules.keys()));

  const slugs = new Set<string>();
  for (const row of (enabledData ?? []) as Array<Record<string, unknown>>) {
    const moduleId = row.module_id as string;
    const slug = visibleModules.get(moduleId);
    if (slug) slugs.add(slug);
  }

  return Array.from(slugs);
}

/**
 * All module slugs enabled for the school, regardless of role visibility.
 * Useful for admin surfaces (e.g. module management) that need the full
 * enabled set rather than the per-user filtered view.
 */
export async function getEnabledModuleSlugs(): Promise<string[]> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("school_modules" as never)
    .select("modules!inner(slug), is_enabled" as never)
    .eq("is_enabled" as never, true);

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => {
    const mod = row.modules as Record<string, unknown>;
    return mod.slug as string;
  });
}
