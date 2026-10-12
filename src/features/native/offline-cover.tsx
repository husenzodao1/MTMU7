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
 * Only an outage that outlasts that is one. The phone saying it has no
 * network at all is believed sooner.
 */
const CONFIRM_MS = 4000;
const DEVICE_OFFLINE_MS = 1200;
/** How often the cover looks for the server itself while Next.js says offline. */
const PROBE_MS = 2000;

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

  useEffect(() => {
    const update = () => setDeviceOffline(!navigator.onLine);
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

  // Next.js keeps calling the app offline until its own check gets through.
  // While the phone says it is online, the cover looks for itself too, every
  // couple of seconds, with the smallest request the portal answers: one that
  // arrives is the connection back, whatever became of Next.js's check.
  const [reached, setReached] = useState(false);
  useEffect(() => {
    if (!flagged) {
      const reset = window.setTimeout(() => setReached(false), 0);
      return () => window.clearTimeout(reset);
    }
    let stopped = false;
    const look = () => {
      if (!navigator.onLine) return;
      fetch("/manifest.webmanifest", { method: "HEAD", cache: "no-store" }).then(
        () => {
          if (!stopped) setReached(true);
        },
        () => undefined
      );
    };
    const timer = window.setInterval(look, PROBE_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [flagged]);

  // Offline only once it has lasted; back online the moment it is over, with
  // a short "connected" — and only if the cover was up at all.
  const suspect = (flagged && !reached) || deviceOffline;
  useEffect(() => {
    if (suspect && !offline) {
      const confirm = window.setTimeout(() => setOffline(true), deviceOffline ? DEVICE_OFFLINE_MS : CONFIRM_MS);
      return () => window.clearTimeout(confirm);
    }
    if (!suspect && offline) {
      const over = window.setTimeout(() => {
        setOffline(false);
        setBack(true);
      }, 0);
      return () => window.clearTimeout(over);
    }
  }, [suspect, deviceOffline, offline]);

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
