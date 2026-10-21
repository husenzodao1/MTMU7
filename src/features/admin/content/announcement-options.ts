import "server-only";
import { getClassOptions, getSchoolRoles } from "@/features/admin/queries";
import { pickName, type Locale } from "@/lib/i18n/text";

export async function getAudienceOptions(schoolId: string, locale: Locale) {
  const [roles, classes] = await Promise.all([getSchoolRoles(schoolId), getClassOptions(schoolId)]);
  return {
    roles: roles.filter((r) => r.is_active).map((r) => ({ value: r.slug, label: pickName(r, locale) })),
    classes: classes.map(({ value, label }) => ({ value, label })),
  };
}
