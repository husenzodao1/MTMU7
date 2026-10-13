"use client";

import { useOffline } from "next/offline";
import { useTranslations } from "next-intl";
import { Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Sent when a tapped page has been on its way too long (instant-nav.ts). */
export const SLOW_EVENT = "mtmu7:slow";

/**
 * How long a lost connection has to last before the cover says so. Next.js
 * calls the app offline the moment one request fails — on a slow or shaky
 * line, or while a large file goes up, that happens with the internet there
 * all along — and its own check calls it back online within a second or two.
 * Only an outage that outlasts that is one.
 */
const CONFIRM_MS = 4000;
/** The device says it has no network and the portal cannot be reached either. */
const DEVICE_OFFLINE_MS = 1200;
/** How often the cover looks for the server itself while anything says offline. */
const PROBE_MS = 2500;
/** A look with no answer by now went out and is waiting — the line is there, only slow. Shorter than CONFIRM_MS, so a slow line never shows the cover. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * A note at the foot of the screen when the internet has really gone: a
 * still Wi-Fi sign and plain words — the page under it stays in use, from
 * what is kept on the device. It goes by itself, after a short "connected",
 * when the internet returns.
 *
 * Next.js notices the connection (experimental.useOffline) and keeps whatever
 * was asked for meanwhile, sending it again once the connection is back.
 *
 * A page that is only slow to come gets no cover, just a small note at the
 * foot of the screen that can be put aside; the page keeps loading under it.
 */
export function OfflineCover() {
  const t = useTranslations("common.offline");
  const flagged = useOffline();
  const [deviceOffline, setDeviceOffline] = useState(false);
  const [offline, setOffline] = useState(false);
  const [back, setBack] = useState(false);
  const [slow, setSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Every word from the device — online or offline — is checked at once.
  const [nudge, setNudge] = useState(0);
  /** The device itself said "offline" during this outage (and so will say "online" after it). */
  const deviceSaid = useRef(false);
  useEffect(() => {
    const update = () => {
      if (!navigator.onLine) deviceSaid.current = true;
      setDeviceOffline(!navigator.onLine);
      setNudge((n) => n + 1);
    };
    const first = window.setTimeout(update, 0);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const onSlow = (event: Event) => {
      const on = Boolean((event as CustomEvent<boolean>).detail);
      setSlow(on);
      if (!on) setDismissed(false);
    };
    window.addEventListener(SLOW_EVENT, onSlow);
    return () => window.removeEventListener(SLOW_EVENT, onSlow);
  }, []);

  // A phone on a Wi-Fi or a SIM with no internet behind it says "online", and
  // a portal opened from what the phone keeps (public/sw.js) makes no request
  // of Next.js that could fail — so the portal itself is asked once as it
  // opens and each time it comes back to the screen. A request that fails
  // outright is no line; one still waiting is a slow line, and says nothing.
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    const ask = () => {
      fetch("/manifest.webmanifest", { method: "HEAD", cache: "no-store" }).then(
        () => setUnreachable(false),
        () => setUnreachable(true)
      );
    };
    const first = window.setTimeout(ask, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Neither Next.js nor the device is believed on its word. Windows tells
  // the browser "no network" whenever its own check of Microsoft's test page
  // fails — behind many providers, all the time, with the internet working —
  // and the Windows app said "no internet" over a page that was loading fine.
  // So while either says offline, the cover asks the portal itself, at once
  // and every couple of seconds, with the smallest request it answers: an
  // answer is the connection, whatever anybody said; a request that fails at
  // once is no connection; one that is still out after a few seconds went out
  // and is waiting — a slow line, not a lost one.
  const suspected = flagged || deviceOffline || unreachable;
  const [reached, setReached] = useState<boolean | null>(null);
  useEffect(() => {
    if (!suspected) {
      const reset = window.setTimeout(() => setReached(null), 0);
      return () => window.clearTimeout(reset);
    }
    let stopped = false;
    const look = () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      fetch("/manifest.webmanifest", { method: "HEAD", cache: "no-store", signal: controller.signal })
        .then(
          () => {
            if (stopped) return;
            setReached(true);
            setUnreachable(false);
          },
          (error: unknown) => {
            if (!stopped) setReached(error instanceof DOMException && error.name === "AbortError");
          }
        )
        .finally(() => window.clearTimeout(timeout));
    };
    look();
    const timer = window.setInterval(look, PROBE_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [suspected, nudge]);

  // Offline only once it has lasted; back online the moment it is over, with
  // a short "connected" — and only if the cover was up at all. The device's
  // own word counts only once the portal has failed to answer too.
  const suspect = flagged ? reached !== true : (deviceOffline || unreachable) && reached === false;
  useEffect(() => {
    if (suspect && !offline) {
      // Device and portal agree there is nothing: said soon. Only Next.js
      // saying so: said once it has lasted.
      const confirm = window.setTimeout(() => setOffline(true), deviceOffline && reached === false ? DEVICE_OFFLINE_MS : CONFIRM_MS);
      return () => window.clearTimeout(confirm);
    }
    if (!suspect && offline) {
      const over = window.setTimeout(() => {
        setOffline(false);
        setBack(true);
        // The device never said it had lost the line, so it will not say it is
        // back: what waits for the line (messages on their way, reads, the
        // page's freshness) is told here instead.
        if (!deviceSaid.current) window.dispatchEvent(new Event("online"));
        deviceSaid.current = false;
      }, 0);
      return () => window.clearTimeout(over);
    }
  }, [suspect, deviceOffline, reached, offline]);

  useEffect(() => {
    if (!back) return;
    const hide = window.setTimeout(() => setBack(false), 1300);
    return () => window.clearTimeout(hide);
  }, [back]);

  if (!offline && !back && slow && !dismissed) {
    return (
      <div className="slow-note" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" className="slow-note-waves" aria-hidden>
          <path d="M8.5 15.5a5 5 0 0 1 7 0" />
          <path d="M5.5 12.5a9 9 0 0 1 13 0" />
          <path d="M2.5 9.5a13 13 0 0 1 19 0" />
          <circle cx="12" cy="19" r="1.4" />
        </svg>
        <span className="min-w-0">
          <span className="block font-semibold">{t("slowTitle")}</span>
          <span className="block opacity-75">{t("slowText")}</span>
        </span>
        <button type="button" className="slow-note-close" onClick={() => setDismissed(true)} aria-label={t("hide")}>
          <X aria-hidden />
        </button>
      </div>
    );
  }

  // No cover over the page: what is on the device is still there to use —
  // the pages kept and the last of everything (public/sw.js) — so the foot of
  // the screen says so, and goes when the line is back.
  if (!offline && !back) return null;
  return (
    <div className="slow-note net-note" data-mode={offline ? "offline" : "back"} role={offline ? "alert" : "status"} aria-live="polite">
      <span className="net-note-icon" aria-hidden>
        {offline ? <WifiOff /> : <Wifi />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{offline ? t("title") : t("back")}</span>
        {offline ? <span className="block opacity-75">{t("cached")}</span> : null}
      </span>
    </div>
  );
}
