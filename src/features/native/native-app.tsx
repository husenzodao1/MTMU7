"use client";

import { useEffect } from "react";
import { appPlugin, isInApp, messagingPlugin } from "@/features/native/bridge";
import { registerWorker } from "@/features/push/client";
import { pathForAppLink } from "@/lib/native/app";

/**
 * What only the app needs from every page: somewhere to go when a link opens
 * the app — a Google sign-in coming back from the browser, a link to the site
 * — and when a notification is tapped. Renders nothing, and in a browser does
 * nothing at all.
 */
export function NativeApp() {
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
