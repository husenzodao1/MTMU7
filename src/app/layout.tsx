import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies, headers } from "next/headers";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Cormorant_Unicase, Noto_Sans, Noto_Serif, Pacifico } from "next/font/google";
import { SupportFab } from "@/components/site/support-fab";
import { AppLaunch } from "@/features/native/app-launch";
import { NativeApp } from "@/features/native/native-app";
import { isAppUserAgent } from "@/lib/native/app";
import { ToastProvider } from "@/components/ui/toast";
import { publicEnv } from "@/lib/env";
import { DEFAULT_THEME, isTheme, THEME_COOKIE } from "@/lib/theme";
import "@/styles/globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  display: "swap",
  variable: "--font-noto-sans",
});

/**
 * For the few lines that are meant to be looked at rather than read through:
 * the front page's title, its section headings, the school's name in the
 * footer. Noto Serif carries the whole Tajik alphabet — ғ ҷ қ ӣ ӯ ҳ — which
 * most display faces do not, so the letters that make the language its own do
 * not fall back to a different font mid-word.
 */
const notoSerif = Noto_Serif({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-noto-serif",
});

/**
 * The greeting's face. A brush script is the least institutional thing on the
 * portal, which is the point of the one line addressed to the reader — and
 * Pacifico is one of the few that carries ғ ҷ қ ӣ ӯ ҳ, so "Рӯз ба хайр" does
 * not change font half-way through a word. Not preloaded: it is used on one
 * page, and the browser fetches the few glyphs it needs when that page draws.
 */
const pacifico = Pacifico({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-greeting",
});

/**
 * The school's name on its crest: a unicase, where capitals and small letters
 * share one height, the way a name is cut into a seal. Checked for the whole
 * Tajik alphabet for the same reason as above.
 */
const unicase = Cormorant_Unicase({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-crest",
});

// Zoom is never disabled (WCAG 1.4.4, SEC-016).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#c4861c",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const locale = await getLocale();
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  return {
    // Absolute URLs for social previews; relative metadata stays relative without it.
    metadataBase: base ? new URL(base) : null,
    title: { default: t("platformName"), template: `%s · ${t("platformName")}` },
    description: t("platformDescription"),
    applicationName: t("platformName"),
    formatDetection: { telephone: false },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: t("platformName"),
      title: t("platformName"),
      description: t("platformDescription"),
      locale,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("common");

  // Read before a byte of HTML is sent, so the page arrives already painted in
  // the chosen theme. A theme applied afterwards by a script is a white flash
  // on every navigation for somebody who chose the dark one.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;
  // Inside the phone or desktop app a page opens behind the app's own
  // launch animation (src/features/native/app-launch.tsx).
  const inApp = isAppUserAgent((await headers()).get("user-agent"));

  return (
    <html
      lang={locale}
      // "system" writes nothing at all, which is what leaves the media query
      // in charge.
      data-theme={theme === "system" ? undefined : theme}
      className={`${notoSans.variable} ${notoSerif.variable} ${pacifico.variable} ${unicase.variable}`}
    >
      <body className="min-h-dvh">
        {inApp ? <AppLaunch /> : null}
        <a href="#main" className="skip-link">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            {children}
            <SupportFab />
            <NativeApp />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
