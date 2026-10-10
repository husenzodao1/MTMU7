"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { appPlugin, googleAccountPlugin, isInApp, messagingPlugin } from "@/features/native/bridge";
import { report, watchErrors } from "@/features/native/diagnostics";
import { registerWorker } from "@/features/push/client";
import { pathForAppLink } from "@/lib/native/app";

/**
 * The first Android build with everything the site now expects from the app:
 * the phone's own keyboard connection (captureInput off, build 9), the
 * permissions plugin (build 10), the new icon and splash (build 11) and the
 * keyboard resizing the page instead of panning it (build 12). An older one
 * is offered the update.
 */
const MIN_APP_BUILD = 12;

/** What Capacitor's bridge puts on window, as far as the diagnostics look. */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  PluginHeaders?: Array<{ name: string }>;
}

/**
 * What only the app needs from every page: somewhere to go when a link opens
 * the app — a Google sign-in coming back from the browser, a link to the site
 * — and when a notification is tapped. Renders nothing, and in a browser does
 * nothing at all.
 */
export function NativeApp() {
  const pathname = usePathname();
  const t = useTranslations("common.appUpdate");
  const [outdated, setOutdated] = useState(false);

  // What the app's page could see as it woke — for reading back when
  // something inside the app does not work (features/native/diagnostics.ts).
  useEffect(() => {
    if (!isInApp()) return;
    const stop = watchErrors();
    void (async () => {
      const capacitor = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
      const google = await googleAccountPlugin();
      const googleReady = google ? await google.available().then((answer) => answer.available, () => "error") : null;
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const info = await appPlugin()
        .then((app) => app?.getInfo())
        .catch(() => undefined);
      const build = Number(info?.build);
      if (Number.isFinite(build) && build > 0 && build < MIN_APP_BUILD && capacitor?.getPlatform?.() === "android") {
        try {
          if (sessionStorage.getItem("app-update-dismissed") !== "1") setOutdated(true);
        } catch {
          setOutdated(true);
        }
      }
      report("boot", {
        app: info?.version ?? null,
        build: info?.build ?? null,
        bridge: Boolean(capacitor),
        native: capacitor?.isNativePlatform?.() ?? false,
        platform: capacitor?.getPlatform?.() ?? null,
        plugins: (capacitor?.PluginHeaders ?? []).map((plugin) => plugin.name).slice(0, 30),
        google: googleReady,
        awakeMs: Math.round(performance.now()),
        htmlMs: navigation ? Math.round(navigation.responseEnd) : null,
        launch: (window as { __appLaunch?: unknown }).__appLaunch ?? null,
      });
    })();
    return stop;
  }, []);

  // Every page after the first, so a sign-in can be followed to where it led.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) firstPage.current = false;
    else report("page");
  }, [pathname]);

  // Every page, browser or app: the service worker keeps the portal's own
  // files on the device, so the next visit starts at once.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    idle(() => void registerWorker());
  }, []);

  useEffect(() => {
    if (!isInApp()) return;
    const listeners: Array<{ remove: () => Promise<void> }> = [];
    let live = true;

    const go = (path: string | null) => {
      if (path && path !== `${location.pathname}${location.search}`) location.assign(path);
    };

    // A listener that arrives after the page has moved on is let go at once.
    const keep = (listener: { remove: () => Promise<void> }) => {
      if (live) listeners.push(listener);
      else void listener.remove();
    };

    void (async () => {
      const [app, messaging] = await Promise.all([appPlugin(), messagingPlugin()]);
      if (app) {
        keep(await app.addListener("appUrlOpen", ({ url }) => go(pathForAppLink(url, location.origin))));
        // Started by tapping a notification while the app was closed: the
        // link arrives as the launch URL rather than as an event. Followed
        // once per launch, not on every page after it.
        const launch = await app.getLaunchUrl().catch(() => undefined);
        if (launch?.url && live) {
          let seen: string | null = null;
          try {
            seen = sessionStorage.getItem("app-launch-url");
            sessionStorage.setItem("app-launch-url", launch.url);
          } catch {
            /* storage refused: follow it anyway */
          }
          if (seen !== launch.url) go(pathForAppLink(launch.url, location.origin));
        }
      }
      if (messaging) {
        keep(
          await messaging.addListener("notificationActionPerformed", ({ notification }) => {
            const data = notification.data as { url?: unknown } | undefined;
            const url = typeof data?.url === "string" ? data.url : null;
            // Only a path on this site: a notification is not a way to send
            // the app anywhere else.
            go(url && url.startsWith("/") && !url.startsWith("//") ? url : null);
          })
        );
      }
    })();

    return () => {
      live = false;
      for (const listener of listeners) void listener.remove();
    };
  }, []);

  if (!outdated) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-overlay animate-fade print:hidden"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-text">
        <Download className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{t("title")}</span>
        <span className="block text-xs text-ink-muted">{t("text")}</span>
      </span>
      <a href="/download/android" download className="shrink-0 rounded-full bg-brand-solid px-3 py-1.5 text-xs font-semibold text-brand-on-solid">
        {t("action")}
      </a>
      <button
        type="button"
        onClick={() => {
          setOutdated(false);
          try {
            sessionStorage.setItem("app-update-dismissed", "1");
          } catch {
            // Shown again next time, which is fine.
          }
        }}
        className="-me-1 shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-muted"
        aria-label={t("later")}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
