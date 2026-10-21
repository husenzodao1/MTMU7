import "server-only";
import { getTranslations } from "next-intl/server";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import type { GrantableRole } from "@/features/admin/people/new-person-form";

/**
 * The areas a post opens, named the way the admin menu names them.
 *
 * A permission list is thirty slugs long and tells an administrator nothing;
 * what they want to know before handing somebody a post is "can they change the
 * timetable, and can they import the register". So the permissions are folded
 * into the handful of areas the school actually thinks in.
 */
const AREAS: Array<{ label: string; permissions: readonly string[] }> = [
  { label: "admin.nav.timetable", permissions: ["timetable.manage"] },
  { label: "admin.nav.students", permissions: ["students.create", "students.update", "students.import"] },
  { label: "admin.nav.staff", permissions: ["staff.create", "staff.update"] },
  { label: "admin.nav.classes", permissions: ["classes.create", "classes.update", "enrollments.manage"] },
  { label: "admin.nav.gradebook", permissions: ["grades.approve", "grades.update", "assessments.manage"] },
  { label: "admin.nav.attendance", permissions: ["attendance.update"] },
  { label: "admin.nav.news", permissions: ["news.publish", "news.update"] },
  { label: "admin.nav.announcements", permissions: ["announcements.publish", "announcements.create"] },
  { label: "admin.nav.users", permissions: ["users.view", "users.update", "users.approve"] },
  { label: "admin.nav.reports", permissions: ["reports.view"] },
  { label: "admin.nav.settings", permissions: ["settings.update"] },
];

/**
 * The posts this administrator may hand out, each with the areas it opens.
 *
 * Empty when they may not change what post anybody holds — the form then shows
 * no chooser at all, and the role follows from the post title they type, the
 * same way it does in the workbook.
 */
export async function getGrantableRoles(locale: Locale): Promise<GrantableRole[]> {
  const supabase = await createClient();
  const [{ data: roles }, t] = await Promise.all([supabase.rpc("grantable_roles"), getTranslations()]);
  if (!roles || roles.length === 0) return [];

  const withAreas = await Promise.all(
    roles
      .filter((role): role is typeof role & { id: string } => Boolean(role.id))
      .map(async (role) => {
        const { data: slugs } = await supabase.rpc("role_permission_slugs", { p_role_id: role.id });
        const held = new Set((slugs as string[] | null) ?? []);
        return {
          id: role.id,
          name: pickName({ name_tg: role.name_tg, name_ru: role.name_ru, name_en: role.name_en }, locale),
          summary: AREAS.filter((area) => area.permissions.some((permission) => held.has(permission))).map((area) => t(area.label)),
        };
      })
  );
  return withAreas;
}
