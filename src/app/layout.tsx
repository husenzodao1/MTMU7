import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies, headers } from "next/headers";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Bad_Script, JetBrains_Mono, Noto_Sans, Noto_Serif, Unbounded } from "next/font/google";
import { Intro } from "@/features/intro/intro";
import { INTRO_COOKIE, INTRO_SCRIPT, isRobot } from "@/features/intro/intro-script";
import { OfflineCover } from "@/features/native/offline-cover";
import { NativeApp } from "@/features/native/native-app";
import { isWelcome } from "@/lib/auth/welcome";
import { isAppUserAgent } from "@/lib/native/app";
import { ToastProvider } from "@/components/ui/toast";
import { ViewportGuard } from "@/components/ui/viewport-guard";
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
 * the front page's title, page titles, the dashboard's greeting, the opening,
 * the school's name in the footer. Noto Serif carries the whole Tajik alphabet — ғ ҷ қ ӣ ӯ ҳ — which
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
 * The greeting's face: a light, slanted hand, thin as a pen line — the
 * dashboard's "Субҳ ба хайр", the welcome's "Салом" and the first opening's
 * "Хуш омадед". Bad Script is one of the few hands that carries ғ ҷ қ ӣ ӯ ҳ,
 * so a greeting or a name never changes font half-way through a word. Not
 * preloaded: the browser fetches the few glyphs it needs when a greeting draws.
 */
const greeting = Bad_Script({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-greeting",
});

/**
 * The school's short name in the portal's header, "МТМУ №7": a small, wide,
 * geometric face whose figures stand on the line with the capitals (the
 * unicase set the number below them).
 */
const mark = Unbounded({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-mark",
});

/** The typewriter face of the "about the app" table. Loaded only when it opens. */
const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--font-mono-ui",
});

// Zoom is never disabled (WCAG 1.4.4, SEC-016).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom in as much as you like; never out. A phone zooms a page out on its
  // own when anything stands past the right edge, and then it stays shrunk.
  minimumScale: 1,
  viewportFit: "cover",
  // The keyboard shrinks the page rather than covering it, so a chat's
  // composer stays above the keyboard on Android as it does on an iPhone.
  interactiveWidget: "resizes-content",
  // The night canvas, so the browser's and the phone's bars belong to the page.
  themeColor: "#0a0e17",
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
  // The first page opens with the school's mark and a greeting (src/features/intro/):
  // on the site once per browser (a year's cookie), in the app on its first
  // start (the page skips it after that), never for robots — and not on the
  // first page after signing in, which has a short welcome of its own.
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent");
  const opening =
    !(await isWelcome()) &&
    (isAppUserAgent(userAgent) || ((await cookies()).get(INTRO_COOKIE)?.value !== "1" && !isRobot(userAgent)));

  return (
    <html
      lang={locale}
      // "system" writes nothing at all, which is what leaves the media query
      // in charge.
      data-theme={theme === "system" ? undefined : theme}
      // Inside the phone app: taps are answered as in an app (globals.css).
      data-app={isAppUserAgent(userAgent) ? "" : undefined}
      className={`${notoSans.variable} ${notoSerif.variable} ${greeting.variable} ${mark.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh">
        {opening ? (
          <>
            <Intro words={t("welcome.opening")} />
            {/* The per-request nonce the CSP allows (src/proxy.ts). */}
            <script nonce={requestHeaders.get("x-nonce") ?? undefined} dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
          </>
        ) : null}
        <a href="#main" className="skip-link">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            {children}
            <NativeApp />
            <OfflineCover />
            <ViewportGuard />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
