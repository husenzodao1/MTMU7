import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, FileText, LogIn, Newspaper } from "lucide-react";
import { EventHighlights, NewsHighlights } from "@/features/site/highlights";
import { getPublicEvents, getPublicNews } from "@/features/site/public-content";
import { buttonClasses } from "@/components/ui/button";
import { pickText, type Locale } from "@/lib/i18n/text";
import { getPlatformIdentity, getPublicSchoolBySlug, resolveHomeSchoolSlug } from "@/lib/site/identity";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await resolveHomeSchoolSlug();
  const school = slug ? await getPublicSchoolBySlug(slug) : null;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site.public");
  // Before the owner approves the official identity, the page stays on the
  // neutral interface label rather than showing an unapproved school name.
  const title = identity.isApproved && school?.shortName ? school.shortName : t("schoolSite");
  return { title, alternates: { canonical: "/" }, openGraph: { title, type: "website" } };
}

export default async function HomePage() {
  const t = await getTranslations("site.public");
  const slug = await resolveHomeSchoolSlug();
  const school = slug ? await getPublicSchoolBySlug(slug) : null;

  if (!school) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="max-w-2xl border-s-4 border-brand-600 ps-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">{t("schoolSite")}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">{t("directoryTitle")}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink-secondary">{t("directoryDescription")}</p>
          <Link className={`mt-7 ${buttonClasses("primary")}`} href="/schools">
            {t("openSchool")}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  const [identity, localeValue, news, events] = await Promise.all([
    getPlatformIdentity(),
    getLocale(),
    getPublicNews(school.id, 4),
    getPublicEvents(school.id, 3),
  ]);
  const locale = localeValue as Locale;
  const showOfficialIdentity = identity.isApproved;
  const schoolName = showOfficialIdentity ? pickText(school.officialName, locale) : "";
  const schoolDescription = showOfficialIdentity ? pickText(school.description, locale) : "";

  const sections = [
    { href: `/s/${school.slug}/news`, icon: Newspaper, label: t("news") },
    { href: `/s/${school.slug}/events`, icon: CalendarDays, label: t("events") },
    { href: `/s/${school.slug}/documents`, icon: FileText, label: t("documents") },
    { href: "/login", icon: LogIn, label: t("portalEntry") },
  ];

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="border-s-4 border-brand-600 ps-5 sm:ps-7">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">{t("schoolSite")}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
              {schoolName || t("ownerTextPending")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-secondary">
              {schoolDescription || t("schoolDescription")}
            </p>
            {!showOfficialIdentity ? <p className="mt-4 text-sm text-ink-secondary">{t("officialPending")}</p> : null}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className={buttonClasses("primary")} href={`/s/${school.slug}`}>
                {t("openSchool")}
                <ArrowRight aria-hidden />
              </Link>
              <Link className={buttonClasses("secondary")} href="/login">
                <LogIn aria-hidden />
                {t("portalEntry")}
              </Link>
            </div>
          </div>
          <div className="flex min-h-64 items-center justify-center overflow-hidden border border-line bg-canvas px-6 py-12 text-center text-sm text-ink-secondary">
            {showOfficialIdentity && school.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-supplied school image URL
              <img src={school.photoUrl} alt={school.fullName} className="h-full max-h-80 w-full object-cover" />
            ) : (
              t("ownerImagePending")
            )}
          </div>
        </div>
      </section>

      <NewsHighlights articles={news} schoolSlug={school.slug} />
      <EventHighlights events={events} schoolSlug={school.slug} />

      <section aria-labelledby="site-sections" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h2 id="site-sections" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t("sections")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sections.map(({ href, icon: Icon, label }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 border border-line bg-canvas p-4 font-medium text-ink hover:border-brand-600 hover:text-brand-text">
                  <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          {school.address || school.phone || school.email ? (
            <address className="mt-8 grid gap-1 border-t border-line pt-6 text-sm not-italic text-ink-secondary sm:grid-cols-3">
              {school.address ? <span>{school.address}</span> : null}
              {school.phone ? <a className="hover:text-brand-text hover:underline" href={`tel:${school.phone}`}>{school.phone}</a> : null}
              {school.email ? <a className="hover:text-brand-text hover:underline" href={`mailto:${school.email}`}>{school.email}</a> : null}
            </address>
          ) : null}
        </div>
      </section>
    </>
  );
}
