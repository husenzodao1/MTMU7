import Link from "next/link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { DownloadApp, type DownloadLabels } from "@/components/site/download-app";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { isAppUserAgent } from "@/lib/native/app";
import { APP_PLATFORMS, platformOf } from "@/lib/native/downloads";
import { SOCIAL_ICON } from "@/components/site/social-icons";
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
  // Inside the app there is nothing to download.
  const userAgent = (await headers()).get("user-agent");
  const offerApp = !isAppUserAgent(userAgent);
  const download: DownloadLabels = {
    button: t("download.button"),
    title: t("download.title"),
    subtitle: t("download.subtitle"),
    more: t("download.more"),
    platforms: Object.fromEntries(
      APP_PLATFORMS.map((p) => [p, { name: t(`download.platforms.${p}.name`), hint: t(`download.platforms.${p}.hint`) }])
    ) as DownloadLabels["platforms"],
  };

  return (
    // Not overflow-hidden: the language panel opens downwards out of this
    // strip, and clipping the strip clipped the panel. The flag behind is an
    // inset-0 layer, so it never needed clipping to stay put.
    // Sticky on every page: the authority stays in view however far down the
    // page is read. One fixed height (--strip-h, globals.css) so the portal's
    // own header and sidebar know exactly where it ends.
    <div className="official-strip sticky top-0 isolate z-40 border-b border-black/20 safe-top print:static">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center"
      />
      {/* Scrim: the flag keeps its colour on the right, the text side stays dark
          enough for white type to hold well past the AA threshold. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/45 to-black/25" />

      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4">
        {/* Emblem and authority share one centre line, so the two read as a
            single official mark rather than two stacked elements. */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- official emblem, rendered unmodified */}
          <img src={emblem} alt={t("emblemAlt")} className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" />
          {/* The name of a ministry is not a label to be shortened with an
              ellipsis — it is the authority the school answers to, and half of
              it says nothing. On a narrow screen it takes a second line; the
              row grows, which is what a row is for. */}
          <p className="line-clamp-2 min-w-0 text-pretty text-[11px] font-medium leading-tight tracking-tight text-white sm:text-xs">
            {authority}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {offerApp ? <DownloadApp labels={download} recommended={platformOf(userAgent)} /> : null}
          <LocaleSwitcher tone="onDark" className="shrink-0" />
        </div>
      </div>
    </div>
  );
}

const SOCIAL_KEYS = ["telegram", "instagram", "whatsapp", "x"] as const;

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

  const linkClass = "rounded-sm text-white/70 transition-colors hover:text-white hover:underline";

  return (
    /*
     * The page closes darker than it began.
     *
     * The flag was a pale wash behind a white footer, which read as a stain
     * rather than a flag. Here it is the ground: the photograph at full
     * strength under a deep scrim, so the red and green are plainly there
     * while every line of type sits on something near black. The footer keeps
     * these colours in either theme — it is the one band of the page that is
     * always dark, the way the strip at the top always is.
     */
    <footer className="relative isolate z-10 mt-auto overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center" />
      <div
        aria-hidden
        /* Darkest at the very top, where the footer meets the page: a bare
           edge of photograph there read as a seam rather than a background.
           The flag comes through in the middle, where there is room for it,
           and the foot goes dark again under the small print. */
        className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/82 to-[#0b1020]/97"
      />
      {/* One hairline of the flag's own colours, as a rule rather than a photograph. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-[#cc0000] via-[#ffffff] to-[#006600] opacity-70"
      />

      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- official emblem, rendered unmodified */}
          <img src={identity.emblemUrl ?? DEFAULT_EMBLEM} alt="" aria-hidden className="h-10 w-10 object-contain opacity-95" />
          {schoolName ? (
            <p className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">{schoolName}</p>
          ) : null}
          <p className="max-w-xl text-pretty font-display text-[0.9375rem] leading-relaxed text-white/80 sm:text-base">
            {t("tagline")}
          </p>
          {/* The accounts, as marks. Four names spelled out competed with the
              school's own; four glyphs at one weight do not. */}
          <ul className="mt-1 flex items-center justify-center gap-2">
            {SOCIAL_KEYS.map((key) => {
              const Icon = SOCIAL_ICON[key];
              return (
                <li key={key}>
                  <a
                    href={social[key]}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label={t(key)}
                    title={t(key)}
                    className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:border-white/40 hover:bg-white/15 hover:text-white"
                  >
                    <Icon className="size-[18px]" />
                  </a>
                </li>
              );
            })}
          </ul>
          <span aria-hidden className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>

        {contact.length > 0 ? (
          <nav aria-label={t("links")} className="mt-6">
            <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              {contact.map((item, index) => (
                <li key={item.href} className="flex items-center gap-x-3">
                  {index > 0 ? <span aria-hidden className="text-white/25">|</span> : null}
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
                <li aria-hidden className="text-white/25">|</li>
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
          <nav aria-label={t("quickLinks")} className="mt-6 border-t border-white/15 pt-5">
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/75 transition-colors hover:border-white/35 hover:bg-white/15 hover:text-white"
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-white/15 pt-5 text-xs text-white/55">
          <span>{t("platform")}</span>
          <span aria-hidden>·</span>
          <span>{copyright || `© ${year}`}</span>
        </div>
      </div>
    </footer>
  );
}
