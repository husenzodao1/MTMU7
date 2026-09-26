import { AppShell } from "@/components/shell/app-shell";
import { loadShellData, portalShellNav } from "@/components/shell/shell-data";
import { OfficialStrip, SiteFooter } from "@/components/site/official-header";
import { getTranslations } from "next-intl/server";
import { getPortalSession } from "@/lib/auth/guards";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();

  // Registration not finished: there is no school, no role and no navigation to
  // build, so the page renders in the public frame and says what is missing.
  if (session.stage !== "member" || !session.access) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <OfficialStrip />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 focus:outline-none sm:py-12">
          {children}
        </main>
        <SiteFooter signedIn />
      </div>
    );
  }

  const access = session.access;
  const [shell, nav] = await Promise.all([loadShellData(access), portalShellNav(access)]);

  // One-click entry to the sections this person actually has, taken from the
  // navigation already built for them rather than a second hard-coded list.
  //
  // A NavItem's `label` is a translation key, not a label — the sidebar calls
  // t() on it as it renders. The footer takes finished strings, so the keys are
  // resolved here; passing them through printed "nav.dashboard" to every
  // signed-in person on every page.
  const t = await getTranslations();
  const quickLinks = nav.groups
    .flatMap((group) => group.items)
    .map((item) => ({ href: item.href, label: t(item.labelKey) }))
    .slice(0, 10);

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
      strip={<OfficialStrip />}
      footer={<SiteFooter schoolName={shell.school?.name ?? null} quickLinks={quickLinks} signedIn />}
    >
      {children}
    </AppShell>
  );
}
