import "server-only";
import { notFound, redirect } from "next/navigation";
import { canAny, canEnterAdmin, getAccess, getAuthUserId, hasModule, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Page guard: returns the active user's access or redirects.
 * - anonymous → /login
 * - signed in without an account row → /register (finish registration)
 * - pending / rejected → /pending
 * - blocked or deactivated → /login?reason=inactive
 */
export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) {
    const authUserId = await getAuthUserId();
    redirect(authUserId ? "/register?step=profile" : "/login");
  }
  if (access.status === "pending" || access.status === "rejected") redirect("/pending");
  if (!access.isActive || access.status === "blocked") redirect("/login?reason=inactive");
  return access;
}

/** Page guard: at least one of the permissions, otherwise the access-denied page. */
export async function requirePermission(...permissions: Permission[]): Promise<Access> {
  const access = await requireAccess();
  if (!canAny(access, permissions)) redirect("/access-denied");
  return access;
}

export async function requireAdminArea(): Promise<Access> {
  const access = await requireAccess();
  if (!canEnterAdmin(access)) redirect("/access-denied");
  return access;
}

/**
 * Module guard: a disabled module behaves as if the route did not exist
 * (spec §40: disabled modules reject direct access).
 */
export async function requireModule(slug: string): Promise<Access> {
  const access = await requireAccess();
  if (!hasModule(access, slug)) notFound();
  return access;
}
