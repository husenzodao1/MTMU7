import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { getPlatformIdentity } from "@/lib/site/identity";
import { pickText, type Locale } from "@/lib/i18n/text";

/**
 * Government / ministry identity strip. Emblem and authority name are shown
 * only when supplied by the platform owner; nothing is generated.
 */
export async function OfficialStrip() {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const authority = pickText(identity.authorityName, locale);
  const t = await getTranslations("site");

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {identity.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- official emblem supplied by the owner; rendered unmodified
            <img src={identity.emblemUrl} alt={t("emblemAlt")} className="h-7 w-auto shrink-0" />
          ) : null}
          {authority ? <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-secondary sm:text-sm sm:normal-case sm:tracking-normal">{authority}</p> : null}
        </div>
        <LocaleSwitcher />
      </div>
    </div>
  );
}

export async function SiteFooter({ schoolName }: { schoolName?: string | null }) {
  const locale = (await getLocale()) as Locale;
  const identity = await getPlatformIdentity();
  const t = await getTranslations("site.footer");
  const attribution = pickText(identity.footerAttribution, locale);
  const copyright = pickText(identity.copyright, locale);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-ink-secondary sm:grid-cols-3">
        <div>
          <p className="font-semibold text-ink">{schoolName ?? t("platform")}</p>
          <p className="mt-1">{copyright || `© ${year}`}</p>
        </div>
        <nav aria-label={t("links")}>
          <ul className="space-y-1.5">
            <li><Link className="hover:text-ink hover:underline" href="/schools">{t("schools")}</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/login">{t("signIn")}</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/register">{t("register")}</Link></li>
          </ul>
        </nav>
        <div>
          {attribution ? (
            <>
              <p className="font-medium text-ink">{t("developedBy")}</p>
              <p className="mt-1">{attribution}</p>
            </>
          ) : null}
          {identity.supportEmail ? (
            <p className="mt-2">
              {t("support")}:{" "}
              <a className="text-brand-700 hover:underline" href={`mailto:${identity.supportEmail}`}>
                {identity.supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
