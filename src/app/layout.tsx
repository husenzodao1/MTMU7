import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Noto_Sans, Noto_Serif } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { publicEnv } from "@/lib/env";
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

  return (
    <html lang={locale} className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
