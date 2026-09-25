import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, ClipboardCheck, FileText, GraduationCap, Languages, Newspaper, ShieldCheck, Users } from "lucide-react";
import { EventHighlights, NewsHighlights } from "@/features/site/highlights";
import { getPublicEvents, getPublicNews } from "@/features/site/public-content";
import { buttonClasses } from "@/components/ui/button";
import { pickText, type Locale } from "@/lib/i18n/text";
import { getPlatformIdentity, getPublicSchoolBySlug, resolveHomeSchoolSlug } from "@/lib/site/identity";
import { safeImageUrl } from "@/lib/site/auth-school";

/** Shown when the school has not supplied a photograph of its own. */
const FALLBACK_BACKGROUND = "/images/school-bg.webp";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await resolveHomeSchoolSlug();
  const school = slug ? await getPublicSchoolBySlug(slug) : null;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site.public");
  const title = identity.isApproved && school?.shortName ? school.shortName : t("schoolSite");
  return { title, alternates: { canonical: "/" }, openGraph: { title, type: "website" } };
}

/**
 * The front door.
 *
 * One photograph of the school, held well back and blurred, with panels of
 * frosted glass over it: what the portal is for, what it does, who built it,
 * and one button that starts.
 *
 * Nothing here waits for an approval. A visitor arriving before the ministry
 * has signed off the official wording used to meet a row of boxes saying that
 * text and images were pending, which tells them nothing and looks broken. The
 * official name and photograph are still gated — those are claims the school
 * makes about itself — but what fills the page meanwhile is the platform's own
 * description of itself, which is true whoever is reading.
 */
export default async function HomePage() {
  const t = await getTranslations("site.public");
  const home = await getTranslations("site.home");
  const slug = await resolveHomeSchoolSlug();
  const school = slug ? await getPublicSchoolBySlug(slug) : null;

  const [identity, localeValue] = await Promise.all([getPlatformIdentity(), getLocale()]);
  const locale = localeValue as Locale;
  const attribution = pickText(identity.footerAttribution, locale);
  const approved = identity.isApproved;
  const schoolName = approved && school ? pickText(school.officialName, locale) || school.fullName : "";
  const background = (approved && school ? safeImageUrl(school.photoUrl) : null) ?? FALLBACK_BACKGROUND;

  const [news, events] = school
    ? await Promise.all([getPublicNews(school.id, 4), getPublicEvents(school.id, 3)])
    : [[], []];

  // Where "start" leads: straight to the sign-in card of this school, or to the
  // list when the platform carries several — which is the same first question
  // either way.
  const startHref = school ? "/login" : "/schools";

  const reasons = [
    { icon: ClipboardCheck, key: "journal" },
    { icon: Users, key: "parents" },
    { icon: ShieldCheck, key: "official" },
  ] as const;

  const features = [
    { icon: GraduationCap, key: "grades" },
    { icon: CalendarDays, key: "timetable" },
    { icon: Newspaper, key: "news" },
    { icon: FileText, key: "documents" },
    { icon: Languages, key: "languages" },
    { icon: Users, key: "people" },
  ] as const;

  return (
    <div className="relative isolate">
      {/* The school itself, far enough back that every panel over it keeps its
          own contrast. Fixed, so the glass slides over a still photograph. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-30 bg-cover bg-center"
        style={{ backgroundImage: `url("${background}")`, filter: "blur(18px) saturate(115%)", transform: "scale(1.08)" }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 bg-canvas/72" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,transparent_10%,var(--color-canvas)_90%)]"
      />

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-14 sm:pb-24 sm:pt-20">
        <div className="glass-panel glass-enter px-6 py-12 text-center sm:px-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">{t("schoolSite")}</p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-6xl">
            {schoolName || home("title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-8 text-ink-secondary sm:text-lg">
            {home("lead")}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href={startHref} className={`glass-cta ${buttonClasses("primary", "lg")}`}>
              {home("start")}
              <ArrowRight aria-hidden />
            </Link>
            {school ? (
              <Link href={`/s/${school.slug}`} className={buttonClasses("secondary", "lg")}>
                {t("openSchool")}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="why" className="mx-auto max-w-5xl px-4 pb-16 sm:pb-24">
        <h2 id="why" className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.2em] text-ink-muted">
          {home("whyTitle")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {reasons.map(({ icon: Icon, key }) => (
            <li key={key} className="glass-panel glass-rise glass-tilt p-6">
              <Icon className="size-7 text-brand-text" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-ink">{home(`why.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{home(`why.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="features" className="mx-auto max-w-5xl px-4 pb-16 sm:pb-24">
        <h2 id="features" className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.2em] text-ink-muted">
          {home("featuresTitle")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="glass-panel glass-rise glass-tilt flex items-start gap-3 p-5">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
              <div>
                <h3 className="font-medium text-ink">{home(`features.${key}.title`)}</h3>
                <p className="mt-1 text-sm leading-6 text-ink-secondary">{home(`features.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about" className="mx-auto max-w-5xl px-4 pb-16 sm:pb-24">
        <div className="glass-panel glass-rise px-6 py-10 sm:px-12 sm:py-14">
          <h2 id="about" className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-muted">
            {home("aboutTitle")}
          </h2>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-ink-secondary">{home("aboutBody")}</p>
          {attribution ? (
            <p className="mt-6 border-t border-line/60 pt-5 text-sm text-ink-muted">
              {t("developedBy")} <span className="text-ink-secondary">{attribution}</span>
            </p>
          ) : null}
        </div>
      </section>

      {school && (news.length > 0 || events.length > 0) ? (
        <div className="bg-canvas/85">
          <NewsHighlights articles={news} schoolSlug={school.slug} />
          <EventHighlights events={events} schoolSlug={school.slug} />
        </div>
      ) : null}

      <section className="mx-auto max-w-5xl px-4 pb-20 sm:pb-28">
        <div className="glass-panel glass-rise px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-semibold text-ink sm:text-3xl">{home("startTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-7 text-ink-secondary">{home("startBody")}</p>
          <Link href={startHref} className={`glass-cta mt-7 ${buttonClasses("primary", "lg")}`}>
            {home("start")}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
