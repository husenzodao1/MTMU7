"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, keepValues, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess, isPlatformAdmin } from "@/lib/auth/access";
import { isPermission } from "@/lib/auth/permissions";
import { localInputToIso } from "@/lib/i18n/zoned";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/features/content/queries";
import { ROLE_SLUGS } from "@/features/content/constants";
import type { Json } from "@/lib/db/database.types";

const optionalText = (max: number) => z.string().trim().max(max, "validation.too_big").optional().transform((v) => v || null);

/**
 * A social account as an administrator would write it — a full link, an @name,
 * or for WhatsApp a phone number — normalised to the https link the database
 * stores. Anything unrecognisable becomes null rather than a broken link.
 */
function socialUrl(kind: "telegram" | "instagram" | "whatsapp", raw: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value.length <= 200 ? value : null;
  if (/^http:\/\//i.test(value)) return `https://${value.slice(7)}`;
  if (kind === "whatsapp") {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
  }
  const handle = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{3,60}$/.test(handle)) return null;
  return kind === "telegram" ? `https://t.me/${handle}` : `https://instagram.com/${handle}`;
}

// ---------------------------------------------------------------------------
// Notification broadcasts
// ---------------------------------------------------------------------------
export async function saveBroadcastAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "notifications.send")) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      title: z.string().trim().min(3, "validation.too_small").max(200, "validation.too_big"),
      body: optionalText(1000),
      linkUrl: z.string().trim().max(500).regex(/^(\/[^/].*)?$/, "validation.internalLink").optional().transform((v) => v || null),
      audienceType: z.enum(["school", "staff", "students", "parents", "roles", "classes"]),
      when: z.enum(["now", "schedule"]),
      scheduledAt: z.string().optional(),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const roles = formData.getAll("audienceRoles").filter((r): r is string => typeof r === "string" && (ROLE_SLUGS as readonly string[]).includes(r));
  const classIds = formData.getAll("audienceClassIds").filter((c): c is string => typeof c === "string" && uuid.safeParse(c).success);
  if (v.audienceType === "roles" && roles.length === 0) return done(failure("errors.validation", { audienceRoles: ["validation.chooseOne"] }));
  if (v.audienceType === "classes" && classIds.length === 0) return done(failure("errors.validation", { audienceClassIds: ["validation.chooseOne"] }));
  const scheduledAt = v.when === "schedule" ? localInputToIso(v.scheduledAt, access.school.timezone) : null;
  if (v.when === "schedule" && (!scheduledAt || scheduledAt <= new Date().toISOString())) {
    return done(failure("errors.validation", { scheduledAt: ["validation.futureDate"] }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_broadcasts")
    .insert({
      school_id: access.school.id,
      title: v.title,
      body: v.body,
      link_url: v.linkUrl,
      audience_type: v.audienceType,
      audience_roles: v.audienceType === "roles" ? roles : [],
      audience_class_ids: v.audienceType === "classes" ? classIds : [],
      status: v.when === "schedule" ? "scheduled" : "draft",
      scheduled_at: scheduledAt,
    })
    .select("id")
    .single();
  if (error || !data) return done(mapDbError(error));

  if (v.when === "now") {
    const { error: sendError } = await supabase.rpc("send_notification_broadcast", { p_broadcast_id: data.id });
    if (sendError) return done(mapDbError(sendError));
  }
  revalidatePath("/admin/notifications");
  return done(success(v.when === "now" ? "admin.broadcasts.sent" : "admin.broadcasts.scheduled"));
}

export async function cancelBroadcastAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("notification_broadcasts").update({ status: "cancelled" }, { count: "exact" }).eq("id", id.data).in("status", ["draft", "scheduled"]);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.conflict"));
  revalidatePath("/admin/notifications");
  return done(success("admin.broadcasts.cancelled"));
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
export async function resolveReportAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ id: uuid, action: z.enum(["dismiss", "delete_message"]), note: z.string().trim().max(1000).optional() })
    .safeParse({ id: formData.get("id"), action: formData.get("decision"), note: formData.get("note") ?? undefined });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderation_resolve_report", { p_report_id: parsed.data.id, p_action: parsed.data.action, p_note: parsed.data.note || undefined });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/moderation", "layout");
  return done(success(parsed.data.action === "dismiss" ? "admin.moderation.dismissed" : "admin.moderation.removed"));
}

// ---------------------------------------------------------------------------
// School profile and settings
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  shortName: z.string().trim().min(2, "validation.too_small").max(100, "validation.too_big"),
  fullName: z.string().trim().min(2, "validation.too_small").max(300, "validation.too_big"),
  officialNameTg: optionalText(300),
  officialNameRu: optionalText(300),
  officialNameEn: optionalText(300),
  descriptionTg: optionalText(5000),
  descriptionRu: optionalText(5000),
  descriptionEn: optionalText(5000),
  address: optionalText(500),
  phone: z.string().trim().max(50).regex(/^[+0-9 ()-]*$/, "validation.phone").optional().transform((v) => v || null),
  email: z.string().trim().max(255).email("validation.email").optional().or(z.literal("")).transform((v) => v || null),
  website: z.string().trim().max(300).regex(/^(https:\/\/\S+)?$/, "validation.url").optional().transform((v) => v || null),
  directorName: optionalText(200),
  workingHoursTg: optionalText(300),
  workingHoursRu: optionalText(300),
  workingHoursEn: optionalText(300),
  timezone: z.string().regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, "validation.invalid_value"),
  defaultLocale: z.enum(["tg", "ru", "en"]),
});

export async function updateSchoolProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "schools.update")) return done(failure("errors.forbidden"));
  const input = parseInput(profileSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const school = access.school.id;

  const images: { logo_url?: string | null; photo_url?: string | null } = {};
  for (const [field, column] of [["logo", "logo_url"], ["photo", "photo_url"]] as const) {
    const path = String(formData.get(`${field}Path`) ?? "");
    if (path) {
      const check = checkFile("image", { name: String(formData.get(`${field}Name`) ?? ""), type: String(formData.get(`${field}Type`) ?? ""), size: Number(formData.get(`${field}Size`) ?? 0) });
      if (!isValidStoragePath(path, school, "identity") || !check.ok) return done(failure("errors.invalid_file_path"));
      images[column] = publicMediaUrl(path);
    } else if (formData.get(`${field}Remove`) === "on") {
      images[column] = null;
    }
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("schools")
    .update(
      {
        short_name: v.shortName,
        full_name: v.fullName,
        official_name_tg: v.officialNameTg,
        official_name_ru: v.officialNameRu,
        official_name_en: v.officialNameEn,
        description_tg: v.descriptionTg,
        description_ru: v.descriptionRu,
        description_en: v.descriptionEn,
        address: v.address,
        phone: v.phone,
        email: v.email,
        website: v.website,
        director_name: v.directorName,
        working_hours_tg: v.workingHoursTg,
        working_hours_ru: v.workingHoursRu,
        working_hours_en: v.workingHoursEn,
        timezone: v.timezone,
        default_locale: v.defaultLocale,
        ...images,
      },
      { count: "exact" }
    )
    .eq("id", school);
  if (error) return done(/invalid time zone/i.test(error.message) ? failure("errors.validation", { timezone: ["validation.invalid_value"] }) : mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/", "layout");
  return done(success("common.saved"));
}

export async function updateSchoolSettingsAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "settings.update")) return done(failure("errors.forbidden"));
  const window = Number(formData.get("attendanceCorrectionDays"));
  if (!Number.isInteger(window) || window < 0 || window > 60) return done(failure("errors.validation", { attendanceCorrectionDays: ["validation.invalid_value"] }));
  const registrationRoles = formData.getAll("registrationRoles").filter((r): r is string => typeof r === "string" && ["student", "teacher", "parent", "staff", "librarian"].includes(r));

  const supabase = await createClient();
  const { data: school } = await supabase.from("schools").select("settings").eq("id", access.school.id).maybeSingle();
  const current = (school?.settings && typeof school.settings === "object" && !Array.isArray(school.settings) ? school.settings : {}) as Record<string, Json>;
  const settings: Record<string, Json> = {
    ...current,
    registration_open: formData.get("registrationOpen") === "on",
    registration_roles: registrationRoles,
    messaging_student_to_student: formData.get("studentToStudent") === "on",
    messaging_students_create_groups: formData.get("studentsCreateGroups") === "on",
    attendance_correction_days: window,
  };
  const { error, count } = await supabase.from("schools").update({ settings }, { count: "exact" }).eq("id", access.school.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/settings");
  return done(success("common.saved"));
}

// ---------------------------------------------------------------------------
// Roles, permissions and modules
// ---------------------------------------------------------------------------
export async function saveRoleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "roles.manage")) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
      slug: z.string().trim().toLowerCase().min(3, "validation.too_small").max(40).regex(/^[a-z][a-z0-9_]*$/, "validation.code").optional(),
      nameTg: z.string().trim().min(2, "validation.too_small").max(100),
      nameRu: optionalText(100),
      nameEn: optionalText(100),
      description: optionalText(500),
      level: z.coerce.number().int().min(2).max(9).default(5),
      isActive: z.string().optional().transform((v) => v === "on"),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const row = { name_tg: v.nameTg, name_ru: v.nameRu, name_en: v.nameEn, description: v.description };
  if (v.id) {
    const { data: role } = await supabase.from("roles").select("is_system").eq("id", v.id).maybeSingle();
    const { error } = await supabase.from("roles").update(role?.is_system ? row : { ...row, level: v.level, is_active: v.isActive }).eq("id", v.id);
    if (error) return done(mapDbError(error));
  } else {
    if (!v.slug || (ROLE_SLUGS as readonly string[]).includes(v.slug)) return done(failure("errors.validation", { slug: ["validation.duplicateName"] }));
    const { error } = await supabase.from("roles").insert({ ...row, slug: v.slug, level: v.level, school_id: access.school.id, is_system: false, is_active: true });
    if (error) return done(error.code === "23505" ? failure("errors.validation", { slug: ["validation.duplicateName"] }) : mapDbError(error));
  }
  revalidatePath("/admin/roles", "layout");
  return done(success(v.id ? "common.saved" : "common.created"));
}

export async function setRolePermissionsAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const roleId = uuid.safeParse(formData.get("roleId"));
  if (!roleId.success) return done(failure("errors.invalid"));
  const slugs = [...new Set(formData.getAll("permission").filter((p): p is string => typeof p === "string" && isPermission(p)))];
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role_permissions", { p_role_id: roleId.data, p_permission_slugs: slugs });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/roles", "layout");
  return done(success("admin.roles.permissionsSaved"));
}

export async function setModuleEnabledAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "modules.manage")) return done(failure("errors.forbidden"));
  const parsed = z.object({ moduleId: uuid, enabled: z.enum(["true", "false"]) }).safeParse({ moduleId: formData.get("moduleId"), enabled: formData.get("enabled") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const enabled = parsed.data.enabled === "true";
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("school_modules")
    .update({ is_enabled: enabled, enabled_at: enabled ? new Date().toISOString() : null, disabled_at: enabled ? null : new Date().toISOString() }, { count: "exact" })
    .eq("school_id", access.school.id)
    .eq("module_id", parsed.data.moduleId);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/", "layout");
  return done(success(enabled ? "admin.modules.enabledToast" : "admin.modules.disabledToast"));
}

// ---------------------------------------------------------------------------
// Platform administration (platform administrators only; RLS enforces it)
// ---------------------------------------------------------------------------
async function platformSession() {
  const access = await getAccess();
  if (!access || !isPlatformAdmin(access)) return null;
  return { access, supabase: await createClient() };
}

export async function updatePlatformIdentityAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      platformNameTg: optionalText(200), platformNameRu: optionalText(200), platformNameEn: optionalText(200),
      authorityNameTg: optionalText(300), authorityNameRu: optionalText(300), authorityNameEn: optionalText(300),
      footerAttributionTg: optionalText(500), footerAttributionRu: optionalText(500), footerAttributionEn: optionalText(500),
      copyrightTg: optionalText(300), copyrightRu: optionalText(300), copyrightEn: optionalText(300),
      supportEmail: z.string().trim().max(255).email("validation.email").optional().or(z.literal("")).transform((v) => v || null),
      supportPhone: z.string().trim().max(50).regex(/^[+0-9 ()-]*$/, "validation.phone").optional().transform((v) => v || null),
      emblemUrl: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, "validation.url").optional().transform((v) => v || null),
      isApproved: z.string().optional().transform((v) => v === "on"),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const { data: row } = await s.supabase.from("platform_identity").select("id").limit(1).maybeSingle();
  if (!row) return done(failure("errors.not_found"));
  const { error } = await s.supabase
    .from("platform_identity")
    .update({
      platform_name_tg: v.platformNameTg, platform_name_ru: v.platformNameRu, platform_name_en: v.platformNameEn,
      authority_name_tg: v.authorityNameTg, authority_name_ru: v.authorityNameRu, authority_name_en: v.authorityNameEn,
      footer_attribution_tg: v.footerAttributionTg, footer_attribution_ru: v.footerAttributionRu, footer_attribution_en: v.footerAttributionEn,
      copyright_tg: v.copyrightTg, copyright_ru: v.copyrightRu, copyright_en: v.copyrightEn,
      support_email: v.supportEmail, support_phone: v.supportPhone, emblem_url: v.emblemUrl, is_approved: v.isApproved,
    })
    .eq("id", row.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/", "layout");
  return done(success("common.saved"));
}

export async function createSchoolAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const kept = keepValues(formData);
  const input = parseInput(
    z.object({
      slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "validation.slug"),
      shortName: z.string().trim().min(2).max(100),
      fullName: z.string().trim().min(2).max(300),
      code: optionalText(40),
      idPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "validation.idPrefix"),
      regionId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      districtId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      adminEmail: z.string().trim().toLowerCase().email("validation.email").max(255).optional().or(z.literal("")).transform((v) => v || null),
      address: optionalText(500),
      photoUrl: optionalText(500),
      logoUrl: optionalText(500),
      telegram: optionalText(200),
      instagram: optionalText(200),
      whatsapp: optionalText(200),
    }),
    formDataToObject(formData),
    kept
  );
  if (!input.ok) return done(input.result);
  const v = input.data;

  const links: Record<string, string> = {};
  for (const kind of ["telegram", "instagram", "whatsapp"] as const) {
    const url = socialUrl(kind, v[kind]);
    if (url) links[kind] = url;
  }

  // The database function is the boundary: it re-checks every rule, provisions
  // the school's roles through the insert trigger, and is the only path that
  // may write a nominated administrator address.
  const { error } = await s.supabase.rpc("create_school", {
    p_short_name: v.shortName,
    p_full_name: v.fullName,
    p_slug: v.slug,
    p_id_prefix: v.idPrefix,
    p_admin_email: v.adminEmail ?? undefined,
    p_photo_url: v.photoUrl ?? undefined,
    p_logo_url: v.logoUrl ?? undefined,
    p_address: v.address ?? undefined,
    p_social_links: links as unknown as Json,
    p_code: v.code ?? undefined,
    p_region_id: v.regionId ?? undefined,
    p_district_id: v.districtId ?? undefined,
  });
  if (error) {
    const field: Record<string, string> = {
      slug_taken: "slug",
      prefix_taken: "idPrefix",
      admin_email_taken: "adminEmail",
      invalid_email: "adminEmail",
      invalid_slug: "slug",
      invalid_prefix: "idPrefix",
    };
    const target = field[error.message];
    if (target) return done(failure("errors.validation", { [target]: [`validation.${error.message}`] }, kept));
    return done(mapDbError(error));
  }
  revalidatePath("/admin/platform");
  return done(success("admin.platform.schoolCreated"));
}

export async function setSchoolStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const parsed = z.object({ id: uuid, status: z.enum(["active", "inactive", "archived"]) }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return done(failure("errors.invalid"));
  if (parsed.data.id === s.access.school?.id && parsed.data.status !== "active") return done(failure("admin.platform.ownSchool"));
  const { error } = await s.supabase.from("schools").update({ status: parsed.data.status, is_active: parsed.data.status === "active" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/platform");
  return done(success("common.saved"));
}

export async function saveRegionAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      kind: z.enum(["region", "district"]),
      regionId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      code: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9_-]+$/, "validation.code"),
      nameTg: z.string().trim().min(2).max(200),
      nameRu: optionalText(200),
      nameEn: optionalText(200),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const row = { code: v.code, name_tg: v.nameTg, name_ru: v.nameRu, name_en: v.nameEn };
  const { error } = v.kind === "region"
    ? await s.supabase.from("regions").insert(row)
    : v.regionId ? await s.supabase.from("districts").insert({ ...row, region_id: v.regionId }) : { error: { code: "22023", message: "region required" } };
  if (error) return done(error.code === "23505" ? failure("errors.validation", { code: ["validation.duplicateName"] }) : error.code === "22023" ? failure("errors.validation", { regionId: ["validation.required"] }) : mapDbError(error));
  revalidatePath("/admin/platform");
  return done(success("common.created"));
}

export async function grantScopeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const input = parseInput(
    z.object({
      userId: uuid,
      scopeType: z.enum(["platform", "region", "district", "school"]),
      scopeRole: z.enum(["super_admin", "ministry_admin", "regional_admin", "district_admin", "school_auditor"]),
      regionId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      districtId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      schoolId: uuid.optional().or(z.literal("")).transform((v) => v || null),
    }),
    formDataToObject(formData)
  );
  if (!input.ok) return done(input.result);
  const v = input.data;
  const { error } = await s.supabase.from("admin_scopes").insert({
    user_id: v.userId,
    scope_type: v.scopeType,
    scope_role: v.scopeRole,
    region_id: v.scopeType === "region" ? v.regionId : null,
    district_id: v.scopeType === "district" ? v.districtId : null,
    school_id: v.scopeType === "school" ? v.schoolId : null,
    granted_by: s.access.userId,
  });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/platform");
  return done(success("admin.platform.scopeGranted"));
}

export async function revokeScopeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const s = await platformSession();
  if (!s) return done(failure("errors.forbidden"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const { error, count } = await s.supabase.from("admin_scopes").delete({ count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/platform");
  return done(success("admin.platform.scopeRevoked"));
}
