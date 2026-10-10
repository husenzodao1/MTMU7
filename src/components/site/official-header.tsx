import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DownloadApp } from "@/components/site/download-app";
import { getDownloadMenu } from "@/components/site/download-labels";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { SOCIAL_ICON } from "@/components/site/social-icons";
import { getPlatformIdentity } from "@/lib/site/identity";
import { getAuthSchool } from "@/lib/site/auth-school";
import { pickText, type Locale } from "@/lib/i18n/text";
import { resolveContacts } from "@/lib/site/contacts";

/** The emblem of the Republic, shipped with the build; the owner may override it. */
const DEFAULT_EMBLEM = "/gov/emblem-tj.svg";

/**
 * Government identity strip: the emblem of the Republic and the ministry it
 * answers to, over a darkened photograph of the national flag. Only the front
 * page carries it now; the portal's own header shows the emblem instead.
 */
export async function OfficialStrip() {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site");
  const authority = pickText(identity.authorityName, locale) || t("authority");
  const emblem = identity.emblemUrl ?? DEFAULT_EMBLEM;

  return (
    // Not overflow-hidden: the language panel opens downwards out of this
    // strip, and clipping the strip clipped the panel.
    <div className="official-strip sticky top-0 isolate z-40 border-b border-black/20 safe-top print:static">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center" />
      {/* Scrim: the flag keeps its colour on the right, the text side stays dark
          enough for white type to hold well past the AA threshold. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/25" />

      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- official emblem, rendered unmodified */}
          <img src={emblem} alt={t("emblemAlt")} className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" />
          <p className="line-clamp-2 min-w-0 text-pretty text-[11px] font-medium leading-tight tracking-tight text-white sm:text-xs">
            {authority}
          </p>
        </div>
        <LocaleSwitcher tone="onDark" className="shrink-0" />
      </div>
    </div>
  );
}

const SOCIAL_KEYS = ["telegram", "instagram", "whatsapp", "x"] as const;

/** The soft bar between two items of a footer row. */
function Bar() {
  return (
    <li aria-hidden className="footer-bar">
      |
    </li>
  );
}

/**
 * The foot of every page, small and light, in rows that read across: the
 * national flag and the school's name (or what the portal is), then the
 * links — the schools, the app, support, the accounts — each set off by a
 * soft bar, then the signed-in person's own sections, then the small print.
 *
 * Links appear only where the owner has supplied a destination; nothing here is
 * invented. `hideSignIn` drops the sign-in link where it makes no sense: on a
 * page reached with a session, and on the sign-in pages themselves.
 */
export async function SiteFooter({
  schoolName,
  quickLinks,
  hideSignIn = false,
}: {
  schoolName?: string | null;
  quickLinks?: Array<{ href: string; label: string }>;
  hideSignIn?: boolean;
}) {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site.footer");
  const copyright = pickText(identity.copyright, locale);
  const year = new Date().getFullYear();
  const download = await getDownloadMenu();

  const school = await getAuthSchool();
  const social = resolveContacts(school?.socialLinks);

  return (
    <footer className="site-footer mt-auto print:hidden">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <p className="flex items-center justify-center gap-2 text-center text-[11px] text-ink-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element -- the national flag, a small static SVG */}
          <img src="/gov/flag-tj.svg" alt={t("flag")} width={24} height={12} className="footer-flag" />
          <span className="min-w-0 text-pretty">{schoolName || t("tagline")}</span>
        </p>

        <nav aria-label={t("siteLinks")} className="mt-2">
          <ul className="footer-row">
            <li>
              <Link className="footer-link" href="/schools">
                {t("schools")}
              </Link>
            </li>
            {download.offer ? (
              <>
                <Bar />
                <li>
                  <DownloadApp labels={download.labels} recommended={download.recommended} variant="footer" />
                </li>
              </>
            ) : null}
            {identity.supportEmail ? (
              <>
                <Bar />
                <li>
                  <a className="footer-link" href={`mailto:${identity.supportEmail}`}>
                    {t("support")}
                  </a>
                </li>
              </>
            ) : null}
            {hideSignIn ? null : (
              <>
                <Bar />
                <li>
                  <Link className="footer-link" href="/login">
                    {t("signIn")}
                  </Link>
                </li>
              </>
            )}
            <Bar />
            {SOCIAL_KEYS.map((key) => {
              const Icon = SOCIAL_ICON[key];
              return (
                <li key={key}>
                  <a href={social[key]} rel="noopener noreferrer" target="_blank" aria-label={t(key)} title={t(key)} className="footer-social">
                    <Icon className="size-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {quickLinks && quickLinks.length > 0 ? (
          <nav aria-label={t("quickLinks")} className="mt-1.5">
            <ul className="footer-row">
              {quickLinks.flatMap((item, index) => [
                index > 0 ? <Bar key={`bar-${item.href}`} /> : null,
                <li key={item.href}>
                  <Link className="footer-link" href={item.href}>
                    {item.label}
                  </Link>
                </li>,
              ])}
            </ul>
          </nav>
        ) : null}

        <p className="mt-2 text-center text-[10px] text-ink-muted">
          {t("platform")} · {copyright || `© ${year}`}
        </p>
      </div>
    </footer>
  );
}
