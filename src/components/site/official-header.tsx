import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { getPlatformIdentity } from "@/lib/site/identity";
import { pickText, type Locale } from "@/lib/i18n/text";

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
      <div aria-hidden className="official-flag absolute inset-0 -z-20 bg-[url('/gov/flag-strip.webp')] bg-cover bg-center" />
      {/* Scrim: the flag shows through softly, most on the right; the text side
          stays dark enough, with the type's own shadow, for white to hold. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/30 to-black/10" />

      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- official emblem, rendered unmodified */}
          <img src={emblem} alt={t("emblemAlt")} className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" />
          <p className="line-clamp-2 min-w-0 text-pretty text-[11px] font-medium leading-tight tracking-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.55)] sm:text-xs">
            {authority}
          </p>
        </div>
        <LocaleSwitcher tone="onDark" className="shrink-0" />
      </div>
    </div>
  );
}

/**
 * The foot of the site: one line, "© 2026 Портали мактаб", small and quiet,
 * centred under the page. Nothing else — the menu holds the sections and the
 * school's networks. The phone and Windows apps have no foot at all
 * (globals.css hides it under html[data-app]): an app ends where its content
 * does.
 */
export async function SiteFooter() {
  const t = await getTranslations("site.footer");
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer print:hidden">
      <p className="footer-line">
        <span className="tabular">© {year}</span> {t("portal")}
      </p>
    </footer>
  );
}
