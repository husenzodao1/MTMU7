import { createServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/auth";

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
}

export async function getUser(): Promise<UserProfile | null> {
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
  };
}
