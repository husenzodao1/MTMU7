import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, Library, MessageSquare, Newspaper, Bell, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SiteFooter, OfficialStrip } from "@/components/site/official-header";

const previewLinks = [
  { href: "/schedule", icon: CalendarDays, key: "schedule" },
  { href: "/grades", icon: ClipboardCheck, key: "grades" },
  { href: "/attendance", icon: BookOpen, key: "attendance" },
  { href: "/homework", icon: FileText, key: "homework" },
  { href: "/library", icon: Library, key: "library" },
  { href: "/news", icon: Newspaper, key: "news" },
  { href: "/announcements", icon: Bell, key: "announcements" },
  { href: "/messages", icon: MessageSquare, key: "messages" },
] as const;

export default async function DevelopmentPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const t = await getTranslations("portal.dashboard");
  const nav = await getTranslations("nav");
  const preview = await getTranslations("site.devPreview");

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <OfficialStrip />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <div className="rounded-lg border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm text-warning-700" role="status">
          {preview("notice")}
        </div>
        <header className="mt-8 border-b border-line pb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">{nav("dashboard")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t("greeting", { name: "Demo user" })}</h1>
          <p className="mt-2 max-w-2xl text-base text-ink-secondary">{t("welcome")}</p>
        </header>

        <section className="mt-8" aria-labelledby="preview-navigation">
          <h2 id="preview-navigation" className="text-lg font-semibold text-ink">{preview("portalNavigation")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {previewLinks.map(({ href, icon: Icon, key }) => (
              <Link key={href} href={href} className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-4 hover:border-brand-600 hover:bg-brand-50">
                <span className="flex size-9 items-center justify-center rounded-md bg-brand-100 text-brand-text"><Icon className="size-5" aria-hidden /></span>
                <span className="font-medium text-ink group-hover:text-brand-text-strong">{nav(key)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3" aria-label={preview("states")}>
          <PreviewPanel title={t("student.today")} description={t("student.noLessons")} />
          <PreviewPanel title={t("student.homework")} description={t("parent.noChildren")} />
          <PreviewPanel title={t("student.attendance")} description={t("student.noLessons")} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PreviewPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">{description}</p>
    </section>
  );
}
