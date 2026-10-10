import { AppShell } from "@/components/shell/app-shell";
import { loadShellData, portalShellNav } from "@/components/shell/shell-data";
import { SiteFooter } from "@/components/site/official-header";
import { getLocale } from "next-intl/server";
import { WelcomeTransition } from "@/features/auth/welcome-transition";
import { welcomeScript } from "@/features/intro/greetings";
import { getPortalSession } from "@/lib/auth/guards";
import { isWelcome } from "@/lib/auth/welcome";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();

  // Registration not finished: there is no school, no role and no navigation to
  // build, so the page renders in the public frame and says what is missing.
  if (session.stage !== "member" || !session.access) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 focus:outline-none sm:py-12">
          {children}
        </main>
        <SiteFooter hideSignIn />
      </div>
    );
  }

  const access = session.access;
  const [shell, nav, welcome] = await Promise.all([loadShellData(access), portalShellNav(access), isWelcome()]);

  return (
    <>
      {welcome ? <WelcomeTransition firstName={access.firstName} script={welcomeScript(await getLocale())} /> : null}
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
        footer={<SiteFooter schoolName={shell.school?.name ?? null} hideSignIn />}
      >
        {children}
      </AppShell>
    </>
  );
}
