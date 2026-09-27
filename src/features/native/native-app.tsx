"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { appPlugin, googleAccountPlugin, isInApp, messagingPlugin } from "@/features/native/bridge";
import { report, watchErrors } from "@/features/native/diagnostics";
import { registerWorker } from "@/features/push/client";
import { pathForAppLink } from "@/lib/native/app";

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
      report("boot", {
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

  return null;
}
