import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { createServerClient } from "@/lib/supabase/server";
import type { UserWithRole } from "@/types/auth";

export async function requireAdmin(): Promise<UserWithRole> {
  const user = await getUserWithRole();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.roles.some((r) => r.slug === "admin");
  if (!isAdmin) {
    redirect("/dashboard?error=forbidden");
  }

  return user;
}

export async function requireSuperAdmin(): Promise<UserWithRole> {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select("is_super_admin" as never)
    .eq("id" as never, user.id)
    .single();

  const row = data as Record<string, unknown> | null;
  if (!row || row.is_super_admin !== true) {
    redirect("/dashboard?error=forbidden");
  }

  return user;
}
