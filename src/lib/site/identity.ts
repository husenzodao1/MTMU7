import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env.server";
import { isSupabaseConfigured } from "@/lib/env";
import { localizedFrom, type LocalizedText } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export interface PlatformIdentity {
  platformName: LocalizedText;
  authorityName: LocalizedText;
  emblemUrl: string | null;
  footerAttribution: LocalizedText;
  copyright: LocalizedText;
  supportEmail: string | null;
  supportPhone: string | null;
  isApproved: boolean;
}

const EMPTY_TEXT: LocalizedText = { tg: null, ru: null, en: null };

/** Owner-supplied platform identity (ministry name, emblem, footer). Never invented. */
export const getPlatformIdentity = cache(async (): Promise<PlatformIdentity> => {
  const fallback: PlatformIdentity = {
    platformName: EMPTY_TEXT,
    authorityName: EMPTY_TEXT,
    emblemUrl: null,
    footerAttribution: EMPTY_TEXT,
    copyright: EMPTY_TEXT,
    supportEmail: null,
    supportPhone: null,
    isApproved: false,
  };
  if (!isSupabaseConfigured) return fallback;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("platform_identity")
      .select(
        "platform_name_tg, platform_name_ru, platform_name_en, authority_name_tg, authority_name_ru, authority_name_en, emblem_url, footer_attribution_tg, footer_attribution_ru, footer_attribution_en, copyright_tg, copyright_ru, copyright_en, support_email, support_phone, is_approved"
      )
      .maybeSingle();
    if (!data) return fallback;
    const row = data as Record<string, unknown>;
    return {
      platformName: localizedFrom(row, "platform_name"),
      authorityName: localizedFrom(row, "authority_name"),
      emblemUrl: data.emblem_url,
      footerAttribution: localizedFrom(row, "footer_attribution"),
      copyright: localizedFrom(row, "copyright"),
      supportEmail: data.support_email,
      supportPhone: data.support_phone,
      isApproved: data.is_approved,
    };
  } catch {
    return fallback;
  }
});

export interface PublicSchool {
  id: string;
  slug: string;
  shortName: string;
  fullName: string;
  officialName: LocalizedText;
  description: LocalizedText;
  logoUrl: string | null;
  photoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  directorName: string | null;
  workingHours: LocalizedText;
  socialLinks: Record<string, string>;
}

export const getPublicSchoolBySlug = cache(async (slug: string): Promise<PublicSchool | null> => {
  if (!isSupabaseConfigured || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("schools")
      .select(
        "id, slug, short_name, full_name, official_name_tg, official_name_ru, official_name_en, description_tg, description_ru, description_en, logo_url, photo_url, address, phone, email, website, director_name, working_hours_tg, working_hours_ru, working_hours_en, social_links, status"
      )
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const links = typeof data.social_links === "object" && data.social_links && !Array.isArray(data.social_links) ? data.social_links : {};
    return {
      id: data.id,
      slug: data.slug,
      shortName: data.short_name,
      fullName: data.full_name,
      officialName: localizedFrom(row, "official_name"),
      description: localizedFrom(row, "description"),
      logoUrl: data.logo_url,
      photoUrl: data.photo_url,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      directorName: data.director_name,
      workingHours: localizedFrom(row, "working_hours"),
      socialLinks: Object.fromEntries(
        Object.entries(links as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^https:\/\//.test(entry[1]))
      ),
    };
  } catch {
    return null;
  }
});

/**
 * Public-site tenant for "/": a school mapped to the request host, otherwise
 * DEFAULT_SCHOOL_SLUG, otherwise null (the school directory is shown).
 * The browser never chooses a school_id; it only selects a public slug.
 */
export const resolveHomeSchoolSlug = cache(async (): Promise<string | null> => {
  if (!isSupabaseConfigured) return serverEnv.DEFAULT_SCHOOL_SLUG ?? null;
  const host = (await headers()).get("host")?.split(":")[0]?.toLowerCase() ?? null;
  try {
    const supabase = await createClient();
    if (host) {
      const { data } = await supabase.rpc("resolve_public_school", { p_host: host });
      if (data) {
        const { data: school } = await supabase.from("schools").select("slug").eq("id", data).maybeSingle();
        if (school?.slug) return school.slug;
      }
    }
  } catch {
    // fall through to configured default
  }
  return serverEnv.DEFAULT_SCHOOL_SLUG ?? null;
});
