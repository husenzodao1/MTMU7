import "server-only";
import { cache } from "react";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { createClient } from "@/lib/supabase/server";
import { isPermission, type Permission, ADMIN_ENTRY_PERMISSIONS } from "@/lib/auth/permissions";
import type { LocalizedText } from "@/lib/i18n/text";

const nullableString = z.string().nullable().optional().transform((v) => v ?? null);

const accessSchema = z.object({
  user: z
    .object({
      id: uuid,
      school_id: uuid,
      public_id: z.string(),
      email: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      middle_name: nullableString,
      avatar_url: nullableString,
      phone: nullableString,
      status: z.string(),
      is_active: z.boolean(),
      // Defaulted true so a database that has not yet taken migration 00045 does
      // not strand every signed-in person at the confirmation screen.
      email_verified: z.boolean().optional().default(true),
    })
    .nullable(),
  school: z
    .object({
      id: uuid,
      slug: z.string(),
      short_name: z.string(),
      full_name: z.string(),
      official_name_tg: nullableString,
      official_name_ru: nullableString,
      official_name_en: nullableString,
      logo_url: nullableString,
      status: z.string(),
      timezone: z.string(),
      default_locale: z.string(),
    })
    .nullable()
    .optional(),
  roles: z
    .array(
      z.object({
        id: uuid,
        slug: z.string(),
        name_tg: z.string(),
        name_ru: nullableString,
        name_en: nullableString,
        level: z.number(),
        is_system: z.boolean(),
      })
    )
    .optional()
    .default([]),
  permissions: z.array(z.string()).optional().default([]),
  modules: z.array(z.string()).optional().default([]),
  scopes: z
    .array(
      z.object({
        scope_type: z.string(),
        scope_role: z.string(),
        region_id: nullableString,
        district_id: nullableString,
        school_id: nullableString,
      })
    )
    .optional()
    .default([]),
});

export type AccountStatus = "pending" | "approved" | "active" | "blocked" | "graduated" | "rejected";

export interface Access {
  userId: string;
  publicId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  status: AccountStatus;
  isActive: boolean;
  /** Whether the person has shown they can read the address on file. */
  emailVerified: boolean;
  school: {
    id: string;
    slug: string;
    shortName: string;
    fullName: string;
    officialName: LocalizedText;
    logoUrl: string | null;
    status: string;
    timezone: string;
  } | null;
  roles: Array<{ id: string; slug: string; name: LocalizedText; level: number }>;
  permissions: ReadonlySet<Permission>;
  modules: ReadonlySet<string>;
  scopes: Array<{ scopeType: string; scopeRole: string; regionId: string | null; districtId: string | null; schoolId: string | null }>;
}

/**
 * The signed-in user's identity, school, roles, permissions and enabled modules
 * for this request, loaded in one RPC and memoised per request. Returns null
 * for anonymous visitors and for authenticated users without an account row
 * (e.g. a registration that was never completed).
 */
/**
 * Whether the caller has a second step (2FA) owed in this session. Read from
 * the same answer getAccess gets, so it costs nothing extra; the database is
 * what decides (migration 00070), and while the step is owed it tells nothing
 * else.
 */
export const isSecondStepOwed = cache(async (): Promise<boolean> => {
  return (await accessAnswer()).mfaRequired;
});

const accessAnswer = cache(async (): Promise<{ data: unknown; error: { code?: string; message: string } | null; mfaRequired: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_access");
  const mfaRequired = Boolean(data && typeof data === "object" && (data as { mfa_required?: unknown }).mfa_required === true);
  return { data, error: error as { code?: string; message: string } | null, mfaRequired };
});

export const getAccess = cache(async (): Promise<Access | null> => {
  // The database answers this under the caller's own JWT, so it doubles as the
  // session check: no session means no user. Asking the auth server first would
  // double the auth requests for every page view, and its rate limit would then
  // read as "signed out".
  const { data, error, mfaRequired } = await accessAnswer();
  if (mfaRequired) return null;
  if (error) {
    // 401/403 is simply "not signed in"; anything else is a fault worth seeing
    // rather than silently turning into a redirect back to the sign-in page.
    const status = (error as { code?: string }).code ?? "";
    if (!/^(401|403|PGRST301|PGRST302)$/.test(status)) {
      console.error("[getAccess] get_my_access failed", { code: status, message: error.message });
    }
    return null;
  }
  if (!data) return null;

  const parsed = accessSchema.safeParse(data);
  if (!parsed.success || !parsed.data.user) {
    if (!parsed.success) console.error("[getAccess] unexpected shape", parsed.error.issues.slice(0, 4));
    return null;
  }

  const { user, school, roles, permissions, modules, scopes } = parsed.data;
  return {
    userId: user.id,
    publicId: user.public_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    middleName: user.middle_name,
    avatarUrl: user.avatar_url,
    phone: user.phone,
    status: user.status as AccountStatus,
    isActive: user.is_active,
    emailVerified: user.email_verified,
    school: school
      ? {
          id: school.id,
          slug: school.slug,
          shortName: school.short_name,
          fullName: school.full_name,
          officialName: { tg: school.official_name_tg, ru: school.official_name_ru, en: school.official_name_en },
          logoUrl: school.logo_url,
          status: school.status,
          timezone: school.timezone,
        }
      : null,
    roles: roles.map((r) => ({ id: r.id, slug: r.slug, name: { tg: r.name_tg, ru: r.name_ru, en: r.name_en }, level: r.level })),
    permissions: new Set(permissions.filter(isPermission)),
    modules: new Set(modules),
    scopes: scopes.map((s) => ({
      scopeType: s.scope_type,
      scopeRole: s.scope_role,
      regionId: s.region_id,
      districtId: s.district_id,
      schoolId: s.school_id,
    })),
  };
});

/** Has the authenticated user signed in with Supabase at all (account row or not)? */
export const getAuthUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

export function can(access: Access | null, permission: Permission): boolean {
  return Boolean(access?.permissions.has(permission));
}

export function canAny(access: Access | null, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(access, p));
}

export function hasRole(access: Access | null, slug: string): boolean {
  return Boolean(access?.roles.some((r) => r.slug === slug));
}

export function hasModule(access: Access | null, slug: string): boolean {
  return Boolean(access?.modules.has(slug));
}

export function canEnterAdmin(access: Access | null): boolean {
  return canAny(access, ADMIN_ENTRY_PERMISSIONS) || isPlatformAdmin(access);
}

export function isPlatformAdmin(access: Access | null): boolean {
  return Boolean(access?.scopes.some((s) => s.scopeType === "platform" && s.scopeRole === "super_admin"));
}

export function hasAdminScope(access: Access | null): boolean {
  return Boolean(access && access.scopes.length > 0);
}

export function displayName(access: Pick<Access, "firstName" | "lastName">): string {
  return `${access.firstName} ${access.lastName}`.trim();
}
