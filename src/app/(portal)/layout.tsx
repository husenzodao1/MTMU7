import { AppShell } from "@/components/shell/app-shell";
import { loadShellData, portalShellNav } from "@/components/shell/shell-data";
import { requireAccess } from "@/lib/auth/guards";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAccess();
  const [shell, nav] = await Promise.all([loadShellData(access), portalShellNav(access)]);

  return (
    <AppShell
      variant="portal"
      school={shell.school}
      user={shell.user}
      groups={nav.groups}
      mobileBar={nav.mobileBar}
      unreadNotifications={shell.unreadNotifications}
      unreadMessages={shell.unreadMessages}
      locale={shell.locale}
      switchHref={nav.switchHref}
    >
      {children}
    </AppShell>
  );
}
