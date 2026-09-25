import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { getPlatformIdentity } from "@/lib/site/identity";
import { getAuthSchool } from "@/lib/site/auth-school";
import { pickText, type Locale } from "@/lib/i18n/text";
import { resolveContacts } from "@/lib/site/contacts";

/** The emblem of the Republic, shipped with the build; the owner may override it. */
const DEFAULT_EMBLEM = "/gov/emblem-tj.svg";

/**
 * Government identity strip: the emblem of the Republic and the ministry it
 * answers to, over a darkened photograph of the national flag. The photograph
 * is decorative and confined to this strip, never the page behind it.
 */
export async function OfficialStrip() {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site");
  const authority = pickText(identity.authorityName, locale) || t("authority");
  const emblem = identity.emblemUrl ?? DEFAULT_EMBLEM;

  return (
    <div className="relative isolate overflow-hidden border-b border-black/20">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center"
      />
      {/* Scrim: the flag keeps its colour on the right, the text side stays dark
          enough for white type to hold well past the AA threshold. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/25" />

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        {/* Emblem and authority share one centre line, so the two read as a
            single official mark rather than two stacked elements. */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- official emblem, rendered unmodified */}
          <img src={emblem} alt={t("emblemAlt")} className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" />
          <p className="min-w-0 truncate text-[11px] font-medium leading-none tracking-tight text-white sm:text-xs sm:leading-none">
            {authority}
          </p>
        </div>

        <LocaleSwitcher tone="onDark" className="shrink-0" />
      </div>
    </div>
  );
}

const SOCIAL_KEYS = ["whatsapp", "telegram", "instagram"] as const;

/**
 * Site footer: one sentence of purpose, then contacts and navigation, over a
 * quietened photograph of the national flag so the page closes the way it
 * opened.
 *
 * Links appear only where the owner has supplied a destination; nothing here is
 * invented. `signedIn` suppresses the sign-in link, which is nonsense on a page
 * that could only be reached with a session. `quickLinks` is for signed-in
 * layouts, which pass the sections that person may open in one click.
 *
 * Who built the platform belongs on the school's own "about" page, not at the
 * bottom of every screen a child opens; see (public)/s/[school]/page.tsx.
 */
export async function SiteFooter({
  schoolName,
  quickLinks,
  signedIn = false,
}: {
  schoolName?: string | null;
  quickLinks?: Array<{ href: string; label: string }>;
  signedIn?: boolean;
}) {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site.footer");
  const copyright = pickText(identity.copyright, locale);
  const year = new Date().getFullYear();

  const school = await getAuthSchool();
  const social = resolveContacts(school?.socialLinks);

  const contact: Array<{ href: string; label: string; external?: boolean }> = [];
  if (school) contact.push({ href: `/s/${school.slug}`, label: t("about") });
  if (identity.supportEmail) contact.push({ href: `mailto:${identity.supportEmail}`, label: t("support"), external: true });
  for (const key of SOCIAL_KEYS) {
    contact.push({ href: social[key], label: t(key), external: true });
  }

  const linkClass = "rounded-sm text-ink-secondary transition-colors hover:text-brand-text hover:underline";

  return (
    <footer className="relative isolate mt-auto overflow-hidden bg-surface">
      {/* A band of the flag closes the page the way the strip opens it. It is a
          band rather than a wash because a photograph behind running text costs
          contrast, and this costs none. */}
      <div aria-hidden className="h-1.5 w-full bg-[url('/gov/flag-strip.webp')] bg-cover bg-center" />
      {/* The same photograph behind the footer, held far enough back that every
          line keeps its own contrast: the surface wash does the work and the
          photograph only warms it. */}
      <div aria-hidden className="absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center opacity-30" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-surface/90 via-surface/94 to-surface" />

      <div className="mx-auto max-w-6xl px-4 py-7 text-sm">
        <p className="text-center font-medium text-ink-secondary sm:text-[0.9375rem]">{t("tagline")}</p>

        {contact.length > 0 ? (
          <nav aria-label={t("links")} className="mt-4">
            <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              {contact.map((item, index) => (
                <li key={item.href} className="flex items-center gap-x-3">
                  {index > 0 ? <span aria-hidden className="text-line-strong">|</span> : null}
                  {item.external ? (
                    <a className={linkClass} href={item.href} rel="noopener noreferrer" target={item.href.startsWith("mailto:") ? undefined : "_blank"}>
                      {item.label}
                    </a>
                  ) : (
                    <Link className={linkClass} href={item.href}>
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <nav aria-label={t("siteLinks")} className="mt-3">
          <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <li>
              <Link className={linkClass} href="/schools">
                {t("schools")}
              </Link>
            </li>
            {signedIn ? null : (
              <>
                <li aria-hidden className="text-line-strong">|</li>
                <li>
                  <Link className={linkClass} href="/login">
                    {t("signIn")}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>

        {quickLinks && quickLinks.length > 0 ? (
          <nav aria-label={t("quickLinks")} className="mt-5 border-t border-line pt-4">
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    className="inline-flex items-center rounded-md border border-line bg-surface/70 px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-text-strong"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-4 text-xs text-ink-muted">
          <span>{schoolName ?? t("platform")}</span>
          <span aria-hidden>·</span>
          <span>{copyright || `© ${year}`}</span>
        </div>
      </div>
    </footer>
  );
}
