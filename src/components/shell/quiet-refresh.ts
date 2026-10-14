"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** How often the page in front is brought up to date by itself. */
export const QUIET_REFRESH_MS = 4000;
/** After arriving on a page, or the app coming back to the screen: the first look this soon. */
const FIRST_MS = 900;
/** A touch, a key or a scroll this recent: the person is busy with the page, and it waits for them. */
const BUSY_MS = 1500;
/** Busy, or a refresh still on its way: looked at again this soon. */
const AGAIN_MS = 1000;
/** The service worker's answer to "the next data is to be fresh" is waited for this long. */
const ASK_MS = 1000;

/** Live by itself already, through realtime: the messenger. */
const LIVE = /^\/(messages|support\/chat)(\/|$)/;

/** What someone is typing into, or choosing in. */
const EDITING =
  "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]:not([contenteditable=false])";
/** Something open over the page: a dialog, a menu, the pull at the top (the menu drawer is always there, hidden when shut). */
const OPEN_OVER =
  '[role="dialog"][data-state="open"], [aria-modal="true"]:not([aria-hidden="true"]), [role="menu"][data-state="open"], [role="listbox"][data-state="open"], .ptr[data-state]';

/** The page's own address, as the service worker names it (public/sw.js, pagePath). */
function pagePath(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("_rsc");
  const search = params.toString();
  return `${window.location.pathname}${search ? `?${search}` : ""}`;
}

/**
 * Tells the service worker that the page's next data is to come from the
 * network, not from what the device kept (public/sw.js, fresh-data); true
 * when it may go now — after refreshes that found no line it rests a while,
 * unless `force` (a pull). With no service worker the refresh goes to the
 * network as it is.
 */
export async function askFresh(force = false): Promise<boolean> {
  const worker = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
  if (!worker) return true;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    // A service worker from before this one does not answer: a pull goes all
    // the same (its kept data is gone already); a quiet refresh waits for the new one.
    const timer = window.setTimeout(() => resolve(force), ASK_MS);
    channel.port1.onmessage = (event: MessageEvent<{ go?: boolean }>) => {
      window.clearTimeout(timer);
      resolve(Boolean(event.data?.go));
    };
    worker.postMessage({ type: "fresh-data", path: pagePath(), build: document.documentElement.dataset.build ?? "", force }, [channel.port2]);
  });
}

/** Typing, choosing, a dialog or menu open, a finger on the page a moment ago, signing in or out. */
function busy(touchedAt: number): boolean {
  if (Date.now() - touchedAt < BUSY_MS) return true;
  const root = document.documentElement;
  if (root.hasAttribute("data-leaving") || root.hasAttribute("data-signin-veil")) return true;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.matches(EDITING)) return true;
  return document.querySelector(OPEN_OVER) !== null;
}

/**
 * The page in front brought up to date by itself every few seconds, the way
 * an app's screen is: what is new appears in it with no pull, no turning
 * mark and no reload — the page stays exactly where it is (router.refresh).
 * The page opens from the device first (public/sw.js), so the first look
 * comes a moment after arriving, and again whenever the app comes back to
 * the screen.
 *
 * Never while its person is in the middle of something — typing, a dialog or
 * a menu open, a finger on the page, a page on its way — nor with the app in
 * the background or no line at all, nor in the messenger, which is live by
 * itself. A slow line is never waited on: the refresh before the last one's
 * answer simply waits its turn.
 */
export function useQuietRefresh(pathname: string, navigating: boolean) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const now = useRef({ refreshing: false, navigating: false });
  useEffect(() => {
    now.current.refreshing = refreshing;
  }, [refreshing]);
  useEffect(() => {
    now.current.navigating = navigating;
  }, [navigating]);

  useEffect(() => {
    if (LIVE.test(pathname)) return;
    let stopped = false;
    let timer = 0;
    let touchedAt = 0;
    const touched = () => {
      touchedAt = Date.now();
    };
    const next = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = window.setTimeout(() => void look(), ms);
    };
    const look = async () => {
      if (stopped) return;
      if (!navigator.onLine) return; // The line coming back looks again ("online").
      if (now.current.refreshing || now.current.navigating || busy(touchedAt)) {
        next(AGAIN_MS);
        return;
      }
      const go = await askFresh();
      if (stopped) return;
      if (go && !busy(touchedAt)) startRefresh(() => router.refresh());
      next(QUIET_REFRESH_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") next(FIRST_MS);
      else window.clearTimeout(timer);
    };
    const onOnline = () => next(FIRST_MS);
    const touches = ["pointerdown", "keydown", "wheel", "touchmove", "scroll"] as const;
    next(FIRST_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    for (const type of touches) document.addEventListener(type, touched, { passive: true, capture: true });
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      for (const type of touches) document.removeEventListener(type, touched, { capture: true });
    };
  }, [pathname, router]);
}
