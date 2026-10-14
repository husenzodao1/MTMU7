import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getPublicSchoolBySlug, resolveHomeSchoolSlug, type PublicSchool } from "@/lib/site/identity";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The school whose sign-in pages the visitor is looking at: the one they chose,
 * otherwise the one this host serves. Returns null when the platform has no
 * school to show yet.
 */
export const getAuthSchool = cache(async (): Promise<PublicSchool | null> => {
  const chosen = (await cookies()).get("school")?.value;
  if (chosen && SLUG.test(chosen) && chosen.length <= 100) {
    const school = await getPublicSchoolBySlug(chosen);
    if (school) return school;
  }
  const home = await resolveHomeSchoolSlug();
  return home ? await getPublicSchoolBySlug(home) : null;
});

/**
 * A background image URL that is safe to put in a CSS url(). Anything that is
 * not a plain http(s) or root-relative address is dropped, so a stored value
 * can never break out of the declaration.
 */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const value = url.trim();
  if (/[()"'\\s]/.test(value)) return null;
  return /^https?:\/\/[^\s]+$/.test(value) || /^\/[^\s]*$/.test(value) ? value : null;
}
