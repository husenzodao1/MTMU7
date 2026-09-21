import "server-only";
import { notFound, redirect } from "next/navigation";
import { canAny, canEnterAdmin, getAccess, getAuthUserId, hasModule, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Where a signed-in visitor stands relative to a usable account. Someone whose
 * registration is unfinished still reaches the dashboard, which explains what
 * is missing instead of bouncing them between pages.
 */
export type PortalStage = "member" | "profile_missing" | "pending" | "rejected";

export interface PortalSession {
  stage: PortalStage;
  access: Access | null;
  userId: string;
}

export async function getPortalSession(): Promise<PortalSession> {
  const access = await getAccess();
  if (access) {
    if (!access.isActive || access.status === "blocked") redirect("/login?reason=inactive");
    if (access.status === "pending") return { stage: "pending", access, userId: access.userId };
    if (access.status === "rejected") return { stage: "rejected", access, userId: access.userId };
    return { stage: "member", access, userId: access.userId };
  }
  const authUserId = await getAuthUserId();
  if (!authUserId) redirect("/login");
  return { stage: "profile_missing", access: null, userId: authUserId };
}

/**
 * Page guard: returns the active user's access or redirects.
 * - anonymous → /login
 * - signed in without a usable account → /dashboard, which says what is missing
 * - blocked or deactivated → /login?reason=inactive
 */
export async function requireAccess(): Promise<Access> {
  const session = await getPortalSession();
  if (session.stage !== "member" || !session.access) redirect("/dashboard");
  return session.access;
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
