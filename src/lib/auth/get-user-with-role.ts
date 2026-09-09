import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import type { UserWithRole, UserRole } from "@/types/auth";

interface UserRow {
  id: string;
  school_id: string;
  public_id: string;
  email: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  status: string;
}

export const getUserWithRole = cache(async function getUserWithRole(): Promise<UserWithRole | null> {
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from("users" as never)
    .select("*")
    .eq("id" as never, authUser.id)
    .single();

  const profile = data as unknown as UserRow | null;
  if (!profile) return null;

  const { data: userRolesData } = await supabase
    .from("user_roles" as never)
    .select(`
      role_id,
      roles:role_id (
        id,
        slug,
        name_tg,
        name_ru,
        level,
        is_system
      )
    ` as never)
    .eq("user_id" as never, authUser.id);

  const roles: UserRole[] = ((userRolesData ?? []) as Array<Record<string, unknown>>).map((ur) => {
    const r = ur.roles as Record<string, unknown>;
    return {
      id: r.id as string,
      slug: r.slug as string,
      nameTg: r.name_tg as string,
      nameRu: (r.name_ru as string) ?? null,
      level: r.level as number,
      isSystem: r.is_system as boolean,
    };
  });

  return {
    id: profile.id,
    schoolId: profile.school_id,
    publicId: profile.public_id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    middleName: profile.middle_name,
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    isActive: profile.is_active,
    status: profile.status,
    roles,
  };
});
