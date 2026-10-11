import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AndroidIcon, AppleIcon, WindowsIcon } from "@/components/site/download-app";
import { downloadUrl, platformOf, type AppPlatform } from "@/lib/native/downloads";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.app");
  return { title: t("title"), description: t("lead"), alternates: { canonical: "/app" } };
}

const ICON = { android: AndroidIcon, ios: AppleIcon, windows: WindowsIcon } as const;

/**
 * The app, for all three: where each comes from and the two or three taps it
 * takes. The visitor's own device first. An iPhone has no App Store listing
 * yet, so its card is the Home Screen, which gives the same icon and window.
 */
export default async function AppPage() {
  const t = await getTranslations("site.app");
  const td = await getTranslations("site.download");
  const mine = platformOf((await headers()).get("user-agent"));
  const order: AppPlatform[] = mine ? [mine, ...(["android", "ios", "windows"] as AppPlatform[]).filter((p) => p !== mine)] : ["android", "ios", "windows"];
  const iosStore = downloadUrl("ios");

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="app-hero relative overflow-hidden rounded-2xl px-6 py-10 text-center sm:px-10 sm:py-14">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, a static file */}
        <img src="/icons/icon-192.png" alt="" width={96} height={96} className="mx-auto size-20 rounded-[1.25rem] ring-1 ring-line" />
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink sm:text-3xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-secondary sm:text-base sm:leading-7">{t("lead")}</p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {order.map((platform) => {
          const Icon = ICON[platform];
          const steps = [1, 2, 3].map((n) => t(`${platform}.step${n}`));
          const direct = platform !== "ios" || iosStore !== null;
          return (
            <article
              key={platform}
              id={platform}
              className={cn("flex scroll-mt-24 flex-col rounded-xl border border-line bg-surface p-5", platform === mine && "border-brand-solid")}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-muted text-ink-secondary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-ink">{td(`platforms.${platform}.name`)}</h2>
                  <p className="text-xs text-ink-muted">{td(`platforms.${platform}.hint`)}</p>
                </div>
              </div>
              <ol className="mt-4 flex-1 space-y-2.5 text-sm leading-relaxed text-ink-secondary">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[0.6875rem] font-semibold text-ink-secondary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {direct ? (
                <a
                  href={`/download/${platform}`}
                  download={platform === "android" ? "MTMU7.apk" : undefined}
                  className={buttonClasses("primary", "lg", "mt-5")}
                >
                  {t("get")}
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">{t("note")}</p>
    </section>
  );
}
