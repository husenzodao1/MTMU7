"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { warmPage } from "@/components/shell/warm-pages";
import { SLOW_EVENT } from "@/features/native/offline-cover";

/** Sent by whatever moves on later than its tap (book-link.tsx): `detail` is the path it is going to. */
export const NAVIGATE_EVENT = "mtmu7:navigate";

/**
 * Paths a link reaches without becoming another page: files and exports that
 * download, route handlers that sign in or out, the API.
 */
const NOT_A_PAGE = /^\/(api|auth|files|download)(\/|$)|\/export$|^\/admin\/import\/template\/|^\/admin\/parents\/codes|^\/report-cards|\.[a-z0-9]{2,5}$/i;

/** Within the messenger the messenger moves itself, at the tap (messages-frame.tsx). */
const MESSENGER = /^\/messages(\/|$)/;

/** A tap that led nowhere (a page that never came) is let go of after this long. */
const GIVE_UP_MS = 25_000;
/** A page still on its way after this long is a slow line, and the foot of the screen says so. */
const SLOW_MS = 6000;
/**
 * A tap the app's memory could not answer at once (the app has just been
 * opened, say) is answered by the page installed on the device instead,
 * after this long: the whole page from the service worker, with no network.
 * Opening a whole page costs a phone a second or two of starting the portal
 * again, so with a line the network is given a fair moment first — on a
 * slow one the page on the device still wins; with none it is at once.
 */
const FROM_DEVICE_MS = 1200;
const FROM_DEVICE_OFFLINE_MS = 150;

export function pageLink(target: EventTarget | null): URL | null {
  const anchor = (target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download") || anchor.dataset.instant === "off") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || NOT_A_PAGE.test(url.pathname)) return null;
  return url;
}

/**
 * Where the portal is going, from the moment a link is tapped — before the
 * network has been asked anything.
 *
 * The page in front stays where it is, as an app's screen does, with a thin
 * line running along the top until the next one is there; most pages are
 * already kept on the device (warm-pages.ts) and come at once. A finger
 * coming down on a link starts fetching its page before the finger has
 * lifted. A link to the page already open, to a file, a link with a modifier
 * key or into a new tab, is left alone.
 *
 * Returns the path being gone to, or null when nothing is on its way.
 */
export function useInstantNavigation(pathname: string, onStart?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  // The address being gone to, with its query, for the page installed on the device.
  const target = useRef<string | null>(null);
  // Arrived — or gone somewhere else, by the back button say: the tap is done.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setPending(null);
  }

  useEffect(() => {
    const start = (to: string, full = to) => {
      if (to === window.location.pathname || NOT_A_PAGE.test(to)) return;
      if (MESSENGER.test(to) && MESSENGER.test(window.location.pathname)) return;
      target.current = full;
      setPending(to);
      onStart?.();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = pageLink(event.target);
      if (url) start(url.pathname, `${url.pathname}${url.search}`);
    };
    // The finger is down: the page is asked for now, not when it lifts.
    const onPress = (event: Event) => {
      const url = pageLink(event.target);
      if (url && url.pathname !== window.location.pathname) warmPage(router, `${url.pathname}${url.search}`);
    };
    const onNavigate = (event: Event) => {
      const to = (event as CustomEvent<string>).detail;
      if (typeof to === "string") {
        const url = new URL(to, window.location.href);
        start(url.pathname, `${url.pathname}${url.search}`);
      }
    };
    // Capture: seen before any handler below can stop the click.
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPress, { capture: true, passive: true });
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener(NAVIGATE_EVENT, onNavigate);
    };
  }, [onStart, router]);

  useEffect(() => {
    if (!pending) return;
    const slow = window.setTimeout(() => window.dispatchEvent(new CustomEvent(SLOW_EVENT, { detail: true })), SLOW_MS);
    const giveUp = window.setTimeout(() => setPending(null), GIVE_UP_MS);
    const fromDevice = window.setTimeout(() => {
      const to = target.current;
      if (!to || window.location.pathname === pending) return;
      void installedOnDevice(to).then((kept) => {
        if (kept && window.location.pathname !== pending) window.location.assign(to);
      });
    }, navigator.onLine === false ? FROM_DEVICE_OFFLINE_MS : FROM_DEVICE_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(giveUp);
      window.clearTimeout(fromDevice);
      window.dispatchEvent(new CustomEvent(SLOW_EVENT, { detail: false }));
    };
  }, [pending]);

  return pending;
}

/** Whether the service worker holds this page whole (public/sw.js, pages-v1). */
async function installedOnDevice(path: string): Promise<boolean> {
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller) return false;
  try {
    const cache = await caches.open("pages-v1");
    return Boolean(await cache.match(new URL(path, window.location.origin).href, { ignoreVary: true }));
  } catch {
    return false;
  }
}
