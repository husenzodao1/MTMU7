import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { adminShellNav, loadShellData } from "@/components/shell/shell-data";
import { OfficialStrip } from "@/components/site/official-header";
import { requireAdminArea } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: { template: `%s · ${t("title")}`, default: t("title") }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdminArea();
  const [shell, nav] = await Promise.all([loadShellData(access), adminShellNav(access)]);

  return (
    <AppShell
      variant="admin"
      school={shell.school}
      user={shell.user}
      groups={nav.groups}
      unreadNotifications={shell.unreadNotifications}
      unreadMessages={shell.unreadMessages}
      locale={shell.locale}
      switchHref={nav.switchHref}
      strip={<OfficialStrip />}
    >
      {children}
    </AppShell>
  );
}
