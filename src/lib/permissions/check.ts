import { createServerClient } from "@/lib/supabase/server";

export async function hasPermission(permissionSlug: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase.rpc("current_user_has_permission" as never, {
    p_permission_slug: permissionSlug,
  } as never);

  return data === true;
}

export async function getUserPermissions(): Promise<string[]> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("user_roles" as never)
    .select(`
      roles:role_id (
        role_permissions (
          permissions:permission_id (
            slug
          )
        )
      )
    ` as never)
    .eq("user_id" as never, user.id);

  if (!data) return [];

  const slugs = new Set<string>();
  for (const ur of data as Array<Record<string, unknown>>) {
    const role = ur.roles as Record<string, unknown>;
    const rps = role.role_permissions as Array<Record<string, unknown>>;
    for (const rp of rps ?? []) {
      const perm = rp.permissions as Record<string, unknown>;
      slugs.add(perm.slug as string);
    }
  }

  return Array.from(slugs);
}
