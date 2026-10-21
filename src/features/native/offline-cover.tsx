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
/** The "no internet" note says it once, for this long, and goes; the page stays usable under it. */
const OFFLINE_NOTE_MS = 4000;
/** That the note was already said this outage — kept so a full-page open does not say it anew. */
const OFFLINE_NOTED_KEY = "mtmu7:offline-noted";
/** A note pushed this far sideways goes. */
const SWIPE_AWAY_PX = 70;

/**
 * A note at the foot of the screen that goes when it is pushed sideways, as a
 * phone's own notifications do: it follows the finger, and let go far enough
 * it slides off; not far enough, it comes back.
 */
function useSwipeAway(onAway: () => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const away = useRef(onAway);
  useEffect(() => {
    away.current = onAway;
  }, [onAway]);
  const move = (element: HTMLElement, dx: number) => {
    element.style.transform = dx ? `translateX(${dx}px)` : "";
    element.style.opacity = dx ? String(Math.max(0.15, 1 - Math.abs(dx) / 220)) : "";
  };
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if ((event.target as Element).closest("button")) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      event.currentTarget.style.transition = "none";
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const from = start.current;
      if (!from || from.id !== event.pointerId) return;
      const dx = event.clientX - from.x;
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(event.clientY - from.y)) return;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      move(event.currentTarget, dx);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const element = event.currentTarget;
      const dx = event.clientX - from.x;
      element.style.transition = "transform 180ms ease, opacity 180ms ease";
      if (Math.abs(dx) >= SWIPE_AWAY_PX) {
        move(element, Math.sign(dx) * window.innerWidth);
        window.setTimeout(() => away.current(), 180);
      } else {
        move(element, 0);
      }
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      start.current = null;
      event.currentTarget.style.transition = "transform 180ms ease, opacity 180ms ease";
      move(event.currentTarget, 0);
    },
  };
}

/**
 * A note at the foot of the screen when the internet has really gone: a
 * still Wi-Fi sign and plain words — the page under it stays in use, from
 * what is kept on the device. It says so once, goes by itself after a few
 * seconds or at once when pushed sideways, and is not said again until the
 * line has come back and gone again; a short "connected" when it returns.
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
  // The "no internet" note, said once for each time the line goes: it goes by
  // itself after a few seconds, or at once when pushed aside.
  const [offlineNoted, setOfflineNoted] = useState(false);
  // Told already during an outage still going on when this page opened from the
  // device: do not say it anew (the flag is cleared when the line comes back).
  // Read here, not in the initial state, because this page is drawn on the
  // server too, where there is no sessionStorage; and well before the line is
  // judged gone (~a second), so the note is suppressed before it could show.
  useEffect(() => {
    let noted = false;
    try {
      noted = sessionStorage.getItem(OFFLINE_NOTED_KEY) === "1";
    } catch {
      // No storage: the note is said once per page instead of once per outage.
    }
    if (!noted) return;
    const id = window.setTimeout(() => setOfflineNoted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

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
        // The outage is over, so the "no internet" note may be said afresh the
        // next time the line goes (it is remembered only for one outage).
        setOfflineNoted(false);
        try {
          sessionStorage.removeItem(OFFLINE_NOTED_KEY);
        } catch {
          // Nothing was remembered.
        }
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

  // The "no internet" note is said once for the whole outage. It is remembered
  // in sessionStorage so the full-page opens the portal makes as it draws a
  // page from the device (instant-nav.ts) do not say it anew — without this it
  // came back on every tap, which read as nagging to connect on a line that
  // was simply gone. offlineNoted starts from that memory (above) and is reset
  // only when the line truly comes back; nothing is reset here, because a page
  // opening from the device is offline-false for a moment before the line is
  // re-checked.
  useEffect(() => {
    if (!offline || offlineNoted) return;
    // Shown now, and remembered straight away — not after it has run its few
    // seconds — so a page opened from the device meanwhile does not say it anew.
    try {
      sessionStorage.setItem(OFFLINE_NOTED_KEY, "1");
    } catch {
      // Nothing to remember it by; it is said again on the next page.
    }
    const hide = window.setTimeout(() => setOfflineNoted(true), OFFLINE_NOTE_MS);
    return () => window.clearTimeout(hide);
  }, [offline, offlineNoted]);

  const swipeSlow = useSwipeAway(() => setDismissed(true));
  // Pushed aside, the "no internet" note is counted as said for the whole
  // outage, so it does not return on the next page opened from the device.
  const swipeNet = useSwipeAway(() => {
    if (!offline) return setBack(false);
    setOfflineNoted(true);
    try {
      sessionStorage.setItem(OFFLINE_NOTED_KEY, "1");
    } catch {
      // Nothing to remember it by.
    }
  });

  if (!offline && !back && slow && !dismissed) {
    return (
      <div className="slow-note touch-pan-y" role="status" aria-live="polite" {...swipeSlow}>
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
  if ((!offline || offlineNoted) && !back) return null;
  return (
    <div
      className="slow-note net-note touch-pan-y"
      data-mode={offline ? "offline" : "back"}
      role={offline ? "alert" : "status"}
      aria-live="polite"
      {...swipeNet}
    >
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
