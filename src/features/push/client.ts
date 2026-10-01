"use client";

import { publicEnv } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * The browser's half of Web Push: the service worker, the subscription, and
 * telling the database which device this is.
 *
 * Every function here is safe to call anywhere — on a browser without push,
 * on a deployment without keys, twice in a row — and answers with what
 * happened rather than throwing.
 */

export type PushState = "granted" | "denied" | "default" | "unsupported";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

export function pushState(): PushState {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => null);
  return registration;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function save(subscription: PushSubscription, locale: string): Promise<boolean> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  const { error } = await getBrowserClient().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_locale: locale,
  });
  return !error;
}

async function currentSubscription(worker: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const existing = await worker.pushManager.getSubscription();
  if (existing) return existing;
  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
}

/**
 * Asks, and on yes subscribes this device. Must be called from a tap: browsers
 * refuse a permission prompt nobody asked for.
 */
export async function enablePush(locale: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const answer = await Notification.requestPermission();
  if (answer !== "granted") return answer as PushState;
  try {
    const worker = await registerWorker();
    if (!worker) return "unsupported";
    const subscription = await currentSubscription(await navigator.serviceWorker.ready);
    if (subscription) await save(subscription, locale);
  } catch {
    // Subscribing can fail on a browser with push disabled by policy; the
    // permission is still granted and the next visit tries again.
  }
  return "granted";
}

const SYNC_KEY = "push-synced-at";
const SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * On every visit of somebody who already said yes: make sure the database
 * still knows this device. Endpoints rotate, a different person may have
 * signed in on it, and the language may have changed; once a day is enough.
 */
export async function syncPush(locale: string, userId: string): Promise<void> {
  if (pushState() !== "granted") return;
  const stamp = `${userId}:${locale}`;
  try {
    const last = localStorage.getItem(SYNC_KEY);
    if (last) {
      const [at, who] = [Number(last.split("|")[0]), last.split("|")[1]];
      if (who === stamp && Date.now() - at < SYNC_EVERY_MS) return;
    }
  } catch {
    // Storage can be off; syncing on every visit is merely wasteful.
  }
  try {
    const worker = await registerWorker();
    if (!worker) return;
    const subscription = await currentSubscription(await navigator.serviceWorker.ready);
    if (subscription && (await save(subscription, locale))) {
      try {
        localStorage.setItem(SYNC_KEY, `${Date.now()}|${stamp}`);
      } catch {
        // See above.
      }
    }
  } catch {
    // Nothing to do: the next visit tries again.
  }
}

/**
 * Tells the server to push a message the browser has just written. Whether
 * this browser can receive pushes is beside the point — the others' can.
 */
export function announceMessage(id: string): void {
  if (!publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  void fetch("/api/push/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
    // Survives the tab being closed straight after sending.
    keepalive: true,
  }).catch(() => undefined);
}
