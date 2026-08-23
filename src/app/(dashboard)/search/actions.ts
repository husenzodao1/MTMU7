"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, first_name, last_name, avatar_url" as never)
    .neq("id" as never, user.id)
    .eq("is_active" as never, true)
    .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%` as never)
    .limit(30);

  if (error) {
    console.error("Search error:", error);
    return [];
  }
  if (!users || (users as unknown[]).length === 0) return [];

  const userIds = (users as Array<Record<string, unknown>>).map((u) => u.id as string);

  const admin = createAdminClient();
  const { data: rolesData } = await admin
    .from("user_roles" as never)
    .select("user_id, roles:role_id(name_tg, slug)" as never)
    .in("user_id" as never, userIds);

  const rolesMap = new Map<string, { name_tg: string; slug: string }>();
  for (const row of (rolesData as Array<Record<string, unknown>>) ?? []) {
    const userId = row.user_id as string;
    if (!rolesMap.has(userId)) {
      const role = row.roles as Record<string, unknown> | null;
      if (role) {
        rolesMap.set(userId, {
          name_tg: (role.name_tg as string) ?? "",
          slug: (role.slug as string) ?? "",
        });
      }
    }
  }

  return (users as Array<Record<string, unknown>>).map((u) => {
    const role = rolesMap.get(u.id as string);
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: role?.name_tg ?? "",
      roleSlug: role?.slug ?? "",
      className: null,
    };
  }).filter((u) => {
    if (!roleFilter || roleFilter === "all") return true;
    return u.roleSlug === roleFilter;
  });
}

