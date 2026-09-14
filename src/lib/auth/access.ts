import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPermission, type Permission, ADMIN_ENTRY_PERMISSIONS } from "@/lib/auth/permissions";
import type { LocalizedText } from "@/lib/i18n/text";

const nullableString = z.string().nullable().optional().transform((v) => v ?? null);

const accessSchema = z.object({
  user: z
    .object({
      id: z.string().uuid(),
      school_id: z.string().uuid(),
      public_id: z.string(),
      email: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      middle_name: nullableString,
      avatar_url: nullableString,
      phone: nullableString,
      status: z.string(),
      is_active: z.boolean(),
    })
    .nullable(),
  school: z
    .object({
      id: z.string().uuid(),
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
        id: z.string().uuid(),
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
export const getAccess = cache(async (): Promise<Access | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("get_my_access");
  if (error || !data) return null;

  const parsed = accessSchema.safeParse(data);
  if (!parsed.success || !parsed.data.user) return null;

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
