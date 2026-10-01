import "server-only";
import { getTranslations } from "next-intl/server";
import { getPublicSchoolBySlug } from "@/lib/site/identity";

/**
 * School name for public page titles. Falls back to the neutral interface
 * label — never to an invented name, and never to the raw URL slug.
 * getPublicSchoolBySlug is request-cached, so this adds no query.
 */
export async function publicSchoolTitle(slug: string): Promise<string> {
  const [school, t] = await Promise.all([getPublicSchoolBySlug(slug), getTranslations("site.public")]);
  return school?.shortName || t("schoolSite");
}
