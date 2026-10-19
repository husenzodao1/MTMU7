"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { appPlugin, googleAccountPlugin, isInApp, messagingPlugin } from "@/features/native/bridge";
import { report, watchErrors } from "@/features/native/diagnostics";
import { registerWorker } from "@/features/push/client";
import { pathForAppLink } from "@/lib/native/app";
import { backAction, EXIT_MS } from "@/lib/native/back";

/**
 * The first Android build that saves files into Downloads (build 13). An
 * older one is offered the update only when a download is tapped in it —
 * the one thing it cannot do. Nothing is said about updates when the app
 * opens: the site is the app, so every change reaches every build anyway.
 */
const FILES_BUILD = 13;

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
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const t = useTranslations("common.appUpdate");
  const tCommon = useTranslations("common");
  const [outdated, setOutdated] = useState(false);
  const [oldBuild, setOldBuild] = useState(false);
  // "Press again to leave", on the first page, for a moment.
  const [exitHint, setExitHint] = useState(false);
  const exitArmedAt = useRef(0);
  useEffect(() => {
    if (!exitHint) return;
    const hide = window.setTimeout(() => setExitHint(false), EXIT_MS);
    return () => window.clearTimeout(hide);
  }, [exitHint]);

  /**
   * Android's back button, as in any app rather than as in a browser
   * (lib/native/back.ts): what is open closes, then one step back at a time,
   * and on the first page a second press within
   * two seconds steps the app aside to the home screen — as the home button
   * does, so it is back at once when opened again.
   */
  const onBack = useRef((app: { minimizeApp?: () => Promise<void> }, canGoBack: boolean) => {
    const overlay = document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]');
    const action = backAction({
      path: location.pathname,
      overlayOpen: Boolean(overlay),
      canGoBack,
      armedAt: exitArmedAt.current,
      now: Date.now(),
    });
    switch (action.kind) {
      case "close":
        (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        return;
      case "hint":
        exitArmedAt.current = Date.now();
        setExitHint(true);
        return;
      case "leave":
        exitArmedAt.current = 0;
        setExitHint(false);
        void app.minimizeApp?.();
        return;
      case "back":
        history.back();
        return;
      case "replace":
        routerRef.current.replace(action.path);
    }
  });

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
      if (Number.isFinite(build) && build > 0 && build < FILES_BUILD && capacitor?.getPlatform?.() === "android") setOldBuild(true);
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
    // Signing out dims the page until the next one is here (app-shell.tsx).
    document.documentElement.removeAttribute("data-leaving");
    if (firstPage.current) firstPage.current = false;
    else report("page");
  }, [pathname]);

  // Every page, browser or app: the service worker keeps the portal's own
  // files on the device, so the next visit starts at once.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    idle(() => void registerWorker());
    // Which version of the site this page is, told to the service worker, so
    // it answers the page only with data of the same version (public/sw.js).
    const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const hello = () => worker?.controller?.postMessage({ type: "hello", build: document.documentElement.dataset.build ?? "" });
    hello();
    worker?.addEventListener("controllerchange", hello);
    return () => worker?.removeEventListener("controllerchange", hello);
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
        // Android's back button, as in any app rather than as in a browser.
        keep(await app.addListener("backButton", ({ canGoBack }) => onBack.current(app, canGoBack)));
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

  // An app too old to save files: a download link tapped in it brings the
  // update back, rather than doing nothing at all.
  useEffect(() => {
    if (!oldBuild) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[download]");
      if (!link) return;
      event.preventDefault();
      setOutdated(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [oldBuild]);

  const hint = exitHint ? (
    <div role="status" className="app-exit-hint print:hidden">
      {tCommon("appExit")}
    </div>
  ) : null;
  if (!outdated) return hint;
  return (
    <>
      {hint}
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
        {/* To the phone's browser, which downloads and installs an APK: the app's
            own web view drops a download, and builds before 13 have nothing to
            take one. Capacitor sends any address it does not serve itself — the
            same host over http — to the browser, and the site turns it to https. */}
        <a href={`http://${typeof location === "undefined" ? "" : location.host}/download/android`} className="shrink-0 rounded-md bg-brand-solid px-3 py-1.5 text-xs font-semibold text-brand-on-solid">
          {t("action")}
        </a>
        <button
          type="button"
          onClick={() => setOutdated(false)}
          className="-me-1 shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-muted"
          aria-label={t("later")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </>
  );
}
