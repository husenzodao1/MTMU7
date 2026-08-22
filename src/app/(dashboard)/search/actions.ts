"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";

export interface SearchResult {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
  roleSlug: string;
  className: string | null;
}

export async function searchUsers(query: string, roleFilter?: string): Promise<SearchResult[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  if (!query || query.length < 2) return [];

  const sanitized = query.replace(/[%_\\]/g, "");
  if (!sanitized) return [];

  const supabase = await createServerClient();

  const { data: users, error } = await supabase
    .from("users" as never)
    .select(`
      id, first_name, last_name, avatar_url,
      user_roles(
        roles:role_id(name_tg, slug)
      )
    ` as never)
    .neq("id" as never, user.id)
    .eq("is_active" as never, true)
    .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%` as never)
    .limit(30);

  if (!users || error) return [];

  return ((users as Array<Record<string, unknown>>)).map((u) => {
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
      roleSlug: (primaryRole?.slug as string) ?? "",
      className: null,
    };
  }).filter((u) => {
    if (!roleFilter || roleFilter === "all") return true;
    return u.roleSlug === roleFilter;
  });
}
