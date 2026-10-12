"use client";

import { useOffline } from "next/offline";
import { useTranslations } from "next-intl";
import { Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

/** Sent by the loading screen (route-skeleton.tsx) when a page has been on its way too long. */
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
 * The cover over the page when the internet has really gone: a still Wi-Fi
 * sign and what is going on in plain words. It goes away by itself, after a
 * short "connected", when the internet returns.
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
  useEffect(() => {
    const update = () => {
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

  // Neither Next.js nor the device is believed on its word. Windows tells
  // the browser "no network" whenever its own check of Microsoft's test page
  // fails — behind many providers, all the time, with the internet working —
  // and the Windows app said "no internet" over a page that was loading fine.
  // So while either says offline, the cover asks the portal itself, at once
  // and every couple of seconds, with the smallest request it answers: an
  // answer is the connection, whatever anybody said; a request that fails at
  // once is no connection; one that is still out after a few seconds went out
  // and is waiting — a slow line, not a lost one.
  const suspected = flagged || deviceOffline;
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
            if (!stopped) setReached(true);
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
  const suspect = flagged ? reached !== true : deviceOffline && reached === false;
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

  if (!offline && !back) return null;
  return (
    <div className="offline-cover" data-mode={offline ? "offline" : "back"} role="alert" aria-live="assertive">
      <div className="offline-body">
        <span className="offline-icon" aria-hidden>
          {offline ? <WifiOff /> : <Wifi />}
        </span>
        <p className="offline-title">{offline ? t("title") : t("back")}</p>
        {offline ? <p className="offline-text">{t("text")}</p> : null}
        {offline ? (
          <button type="button" className="offline-button" onClick={() => window.location.reload()}>
            {t("retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
