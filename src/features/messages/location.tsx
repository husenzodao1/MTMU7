"use client";

import { ChevronRight } from "lucide-react";
import { devicePermissionsPlugin, isInApp } from "@/features/native/bridge";

/** Why a position could not be had: refused, the phone's location off, or no fix in time. */
export type LocateFailure = "denied" | "off" | "timeout" | "unsupported";

/** How long a quick, approximate position may wait for a precise one before it is taken. */
const PRECISE_GRACE_MS = 3000;

/**
 * Where this device is, once — asking first wherever asking is needed.
 *
 * In the app the web view cannot put the question itself, so the phone's own
 * prompt comes first (DevicePermissionsPlugin). Then two asks go out together:
 * a quick one from the network, answered in a moment even indoors, and a
 * precise one from the satellites, which may take its time or never come
 * under a roof. The precise one is taken when it is there; the quick one is
 * kept and sent if the precise one has not come a few seconds after it. A
 * single precise ask with a short timeout used to be all there was, and
 * indoors it simply ran out — "could not be determined".
 */
export async function locate(): Promise<{ position: GeolocationPosition } | { failure: LocateFailure }> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return { failure: "unsupported" };
  if (isInApp()) {
    const plugin = await devicePermissionsPlugin();
    if (plugin) {
      const now = await plugin.check().catch(() => null);
      if (now && now.location !== "granted") {
        const answer = await plugin.request({ which: ["location"] }).catch(() => null);
        if (answer && answer.location !== "granted") return { failure: "denied" };
      }
    }
  }
  return new Promise((resolve) => {
    let settled = false;
    let quick: GeolocationPosition | null = null;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const errors: GeolocationPositionError[] = [];
    const finish = (position: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (grace) clearTimeout(grace);
      resolve({ position });
    };
    const failed = (error: GeolocationPositionError) => {
      errors.push(error);
      if (settled) return;
      if (error.code === error.PERMISSION_DENIED) {
        settled = true;
        if (grace) clearTimeout(grace);
        resolve({ failure: "denied" });
        return;
      }
      if (errors.length === 2) {
        if (quick) return finish(quick);
        settled = true;
        resolve({ failure: errors.some((e) => e.code === e.POSITION_UNAVAILABLE) ? "off" : "timeout" });
      }
    };
    navigator.geolocation.getCurrentPosition(finish, failed, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        quick = position;
        grace ??= setTimeout(() => quick && finish(quick), PRECISE_GRACE_MS);
      },
      failed,
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 120_000 }
    );
  });
}

/** A small number from a place, so that two places do not draw the same streets. */
function seedOf(lat: number, lng: number) {
  const x = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A place in the conversation: a small drawn map with a pin dropped on it, and
 * one line under it — what was written with it, or "Location" — that opens the
 * place in a real map.
 *
 * Drawn, not fetched: map tiles would be a third party seeing every place
 * anybody in the school sends, a poor trade for a picture. The streets are a
 * sketch turned a little by the place itself, so two locations do not look
 * alike; the coordinates are on the link for whoever wants them.
 */
export function LocationCard({ lat, lng, label, openLabel, title }: { lat: number; lng: number; label: string; openLabel: string; title: string }) {
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  // The word alone: the pin is on the map already.
  const words = label || title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
  const seed = seedOf(lat, lng);
  const turn = Math.round(seed * 50 - 25);
  const shift = Math.round(seed * 40 - 20);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="chat-place" aria-label={`${words} — ${openLabel}`} title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}>
      <svg viewBox="0 0 240 120" className="chat-place-map" aria-hidden>
        <rect width="240" height="120" className="chat-place-land" />
        <g transform={`rotate(${turn} 120 60) translate(${shift} 0)`}>
          <path d="M-40 92 C 40 70, 90 118, 160 86 S 260 70, 300 84 L 300 112 C 240 100, 200 132, 150 116 S 30 108, -40 122 Z" className="chat-place-water" />
          <rect x="22" y="14" width="44" height="30" rx="5" className="chat-place-park" />
          <rect x="170" y="8" width="52" height="26" rx="5" className="chat-place-park" />
          <path d="M-40 52 L 300 40" className="chat-place-road chat-place-road-main" />
          <path d="M96 -20 L 112 140" className="chat-place-road chat-place-road-main" />
          <path d="M-40 18 L 300 6 M-40 82 L 300 70 M38 -20 L 52 140 M160 -20 L 176 140 M214 -20 L 230 140" className="chat-place-road" />
        </g>
        <ellipse cx="120" cy="64" rx="9" ry="3" className="chat-place-shadow" />
        <g className="chat-place-pin">
          <path d="M120 64 C 112 52, 106 46, 106 38 A 14 14 0 0 1 134 38 C 134 46, 128 52, 120 64 Z" />
          <circle cx="120" cy="38" r="5" />
        </g>
      </svg>
      <span className="chat-place-line">
        <span className="truncate">{words}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
      </span>
    </a>
  );
}
