import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AndroidIcon, AppleIcon, WindowsIcon } from "@/components/site/download-app";
import { downloadUrl, platformOf, type AppPlatform } from "@/lib/native/downloads";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.app");
  return { title: t("title"), description: t("lead"), alternates: { canonical: "/app" } };
}

const ICON = { android: AndroidIcon, ios: AppleIcon, windows: WindowsIcon } as const;
const TINT: Record<AppPlatform, string> = {
  android: "bg-[#3ddc84]/15 text-[#16a34a]",
  ios: "bg-ink/10 text-ink",
  windows: "bg-[#0078d4]/12 text-[#0078d4]",
};

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
      <div className="app-hero relative overflow-hidden rounded-[2rem] px-6 py-10 text-center text-white sm:px-10 sm:py-14">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, a static file */}
        <img src="/icons/icon-192.png" alt="" width={96} height={96} className="mx-auto size-24 rounded-[1.6rem] shadow-2xl ring-1 ring-white/20" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/80">{t("lead")}</p>
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
              className={cn("flex scroll-mt-24 flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs", platform === mine && "ring-2 ring-brand-500")}
            >
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex size-12 items-center justify-center rounded-2xl", TINT[platform])}>
                  <Icon className="size-6" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-ink">{td(`platforms.${platform}.name`)}</h2>
                  <p className="text-xs text-ink-muted">{td(`platforms.${platform}.hint`)}</p>
                </div>
              </div>
              <ol className="mt-4 flex-1 space-y-2.5 text-sm leading-relaxed text-ink-secondary">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[0.6875rem] font-semibold text-brand-text-strong">
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
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-brand-solid px-5 text-sm font-semibold text-brand-on-solid transition-colors hover:bg-brand-solid-hover"
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
