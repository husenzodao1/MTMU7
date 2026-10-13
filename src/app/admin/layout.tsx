import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { adminShellNav, loadShellData } from "@/components/shell/shell-data";
import { SiteFooter } from "@/components/site/official-header";
import { renderedAt } from "@/lib/rendered-at";
import { WelcomeTransition } from "@/features/auth/welcome-transition";
import { requireAdminArea } from "@/lib/auth/guards";
import { isWelcome } from "@/lib/auth/welcome";
import { createClient } from "@/lib/supabase/server";

/**
 * The school year names and turns itself over (00086). pg_cron does it every
 * night; the office's first page after the date says so does it too, so a
 * database without pg_cron still moves on. When nothing is due this is one
 * quick read.
 */
async function keepTheYearCurrent(): Promise<void> {
  try {
    await (await createClient()).rpc("ensure_school_year");
  } catch {
    // The pages read whatever year there is; this must never stop them.
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: { template: `%s · ${t("title")}`, default: t("title") }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await requireAdminArea();
  const [shell, nav, welcome] = await Promise.all([loadShellData(access), adminShellNav(access), isWelcome(), keepTheYearCurrent()]);

  return (
    <>
      {welcome ? <WelcomeTransition firstName={access.firstName} /> : null}
      <AppShell
        variant="admin"
        school={shell.school}
        user={shell.user}
        groups={nav.groups}
        unreadNotifications={shell.unreadNotifications}
        unreadMessages={shell.unreadMessages}
        socials={shell.socials}
        locale={shell.locale}
        switchHref={nav.switchHref}
        footer={<SiteFooter />}
        renderedAt={renderedAt()}
      >
        {children}
      </AppShell>
    </>
  );
}
