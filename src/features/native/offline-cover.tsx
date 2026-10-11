"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useOffline } from "next/offline";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/** Sent by the loading screen (route-skeleton.tsx) when a page has been on its way too long. */
export const SLOW_EVENT = "mtmu7:slow";

/**
 * The cover over the page when the internet has gone, or is so slow that a
 * page has been loading for longer than anybody waits: a still Wi-Fi sign and
 * what is going on in plain words.
 *
 * Next.js notices the connection itself (experimental.useOffline): the
 * browser saying it is offline, or a page, a prefetch or a save that could
 * not reach the server. It keeps whatever was asked for and sends it again
 * once the connection is back — so the cover only has to say so, and to go
 * away by itself, after a short "connected", when the internet returns.
 *
 * The slow cover can be put aside; the offline one stays until it is over.
 */
export function OfflineCover() {
  const t = useTranslations("common.offline");
  const offline = useOffline();
  const [slow, setSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [back, setBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const onSlow = (event: Event) => {
      const on = Boolean((event as CustomEvent<boolean>).detail);
      setSlow(on);
      if (!on) setDismissed(false);
    };
    window.addEventListener(SLOW_EVENT, onSlow);
    return () => window.removeEventListener(SLOW_EVENT, onSlow);
  }, []);

  // A short "connected" when it comes back, then out of the way.
  useEffect(() => {
    if (offline) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const show = window.setTimeout(() => setBack(true), 0);
    const hide = window.setTimeout(() => setBack(false), 1300);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [offline]);

  const mode = offline ? "offline" : back ? "back" : slow && !dismissed ? "slow" : null;
  if (!mode) return null;

  return (
    <div className="offline-cover" data-mode={mode} role="alert" aria-live="assertive">
      <div className="offline-body">
        <span className="offline-icon" aria-hidden>
          {mode === "back" ? <Wifi /> : <WifiOff />}
        </span>
        <p className="offline-title">{mode === "offline" ? t("title") : mode === "slow" ? t("slowTitle") : t("back")}</p>
        {mode === "back" ? null : <p className="offline-text">{mode === "offline" ? t("text") : t("slowText")}</p>}
        {mode === "offline" ? (
          <button type="button" className="offline-button" onClick={() => window.location.reload()}>
            {t("retry")}
          </button>
        ) : mode === "slow" ? (
          <button type="button" className="offline-button offline-button-quiet" onClick={() => setDismissed(true)}>
            {t("hide")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
