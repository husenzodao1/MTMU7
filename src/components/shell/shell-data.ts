import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { hasModule, can, displayName, type Access } from "@/lib/auth/access";
import { pickText, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import { adminNavigation, portalNavigation, showAdminLink, type NavGroup, type NavItem } from "@/components/shell/navigation";
import { myHomeroomClasses } from "@/features/accounts/queries";
import type { ShellSchool, ShellUser } from "@/components/shell/app-shell";

export interface ShellData {
  locale: Locale;
  school: ShellSchool;
  user: ShellUser;
  unreadNotifications: number;
  unreadMessages: number;
}

export async function loadShellData(access: Access): Promise<ShellData> {
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const [notifications, messages] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", access.userId).eq("is_read", false),
    hasModule(access, "messages") && can(access, "messages.use")
      ? supabase.rpc("get_unread_message_count")
      : Promise.resolve({ data: 0, error: null }),
  ]);

  const primaryRole = access.roles[0];
  return {
    locale,
    school: {
      name: access.school?.shortName ?? "",
      fullName: access.school?.fullName ?? "",
      logoUrl: access.school?.logoUrl ?? null,
    },
    user: {
      id: access.userId,
      name: displayName(access),
      avatarUrl: access.avatarUrl,
      roleLabel: primaryRole ? pickText(primaryRole.name, locale) : "",
    },
    unreadNotifications: notifications.count ?? 0,
    unreadMessages: Number(messages.data ?? 0),
  };
}

export async function portalShellNav(access: Access): Promise<{ groups: NavGroup[]; mobileBar: NavItem[]; switchHref: { href: string; label: string } | null }> {
  const t = await getTranslations("nav");
  const items = portalNavigation(access);
  // A homeroom teacher runs their class from the portal: it goes right after
  // the teaching page, for them and for nobody else.
  if (items.some((i) => i.key === "teach") && (await myHomeroomClasses(access)).length > 0) {
    const at = items.findIndex((i) => i.key === "teach") + 1;
    items.splice(at, 0, { key: "myClass", href: "/my-class", icon: "students", labelKey: "nav.myClass" });
  }
  const pick = (key: string) => items.find((i) => i.key === key);
  const mobileBar = [
    pick("dashboard"),
    pick("teach") ?? pick("schedule"),
    pick("homework") ?? pick("library"),
    pick("messages") ?? pick("news"),
  ].filter((i): i is NavItem => Boolean(i));

  return {
    groups: [{ key: "main", labelKey: "", items }],
    mobileBar,
    switchHref: showAdminLink(access) ? { href: "/admin", label: t("adminCenter") } : null,
  };
}

export async function adminShellNav(access: Access) {
  const t = await getTranslations("nav");
  return {
    groups: adminNavigation(access),
    switchHref: { href: "/dashboard", label: t("backToPortal") },
  };
}
