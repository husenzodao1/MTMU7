"use client";

import { useEffect, useState } from "react";

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

/**
 * Where the portal is going, from the moment a link is tapped — before the
 * network has been asked anything.
 *
 * A web page stays where it is until the next one answers; an app moves at
 * once and fills the new screen as it arrives. So a tap on any link to another
 * page of the portal is taken at its word: the shell shows that page's loading
 * screen straight away (route-skeleton.tsx, in the shape of the page to come)
 * and scrolls to the top, and Next.js's own loading screen and then the page
 * take over as they come. A link to the page already open, to a file, a link
 * with a modifier key or into a new tab, is left alone.
 *
 * Returns the path being gone to, or null when nothing is on its way.
 */
export function useInstantNavigation(pathname: string, onStart?: () => void) {
  const [pending, setPending] = useState<string | null>(null);
  // Arrived — or gone somewhere else, by the back button say: the tap is done.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setPending(null);
  }

  useEffect(() => {
    const start = (to: string) => {
      if (to === window.location.pathname || NOT_A_PAGE.test(to)) return;
      if (MESSENGER.test(to) && MESSENGER.test(window.location.pathname)) return;
      setPending(to);
      window.scrollTo({ top: 0, behavior: "instant" });
      onStart?.();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download") || anchor.dataset.instant === "off") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      start(url.pathname);
    };
    const onNavigate = (event: Event) => {
      const to = (event as CustomEvent<string>).detail;
      if (typeof to === "string") start(new URL(to, window.location.href).pathname);
    };
    // Capture: seen before any handler below can stop the click.
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAVIGATE_EVENT, onNavigate);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAVIGATE_EVENT, onNavigate);
    };
  }, [onStart]);

  useEffect(() => {
    if (!pending) return;
    const giveUp = window.setTimeout(() => setPending(null), GIVE_UP_MS);
    return () => window.clearTimeout(giveUp);
  }, [pending]);

  return pending;
}
