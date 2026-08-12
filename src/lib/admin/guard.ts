import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
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
