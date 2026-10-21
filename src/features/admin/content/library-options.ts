import "server-only";
import { getClassOptions, getSchoolRoles } from "@/features/admin/queries";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function getBookFormOptions(schoolId: string, locale: Locale) {
  const supabase = await createClient();
  const [{ data: categories }, { data: subjects }, roles, classes] = await Promise.all([
    supabase.from("library_categories").select("id, name_tg, name_ru, name_en, is_active").eq("school_id", schoolId).order("sort_order"),
    supabase.from("subjects").select("id, name_tg, name_ru, name_en").eq("school_id", schoolId).eq("is_active", true).order("name_tg"),
    getSchoolRoles(schoolId),
    getClassOptions(schoolId),
  ]);
  return {
    categories: (categories ?? []).filter((c) => c.is_active).map((c) => ({ value: c.id, label: pickName(c, locale) })),
    subjects: (subjects ?? []).map((s) => ({ value: s.id, label: pickName(s, locale) })),
    roles: roles.filter((r) => r.is_active).map((r) => ({ value: r.id, label: pickName(r, locale) })),
    classes: classes.map(({ value, label }) => ({ value, label })),
  };
}
