"use client";

import { APP_USER_AGENT_MARK } from "@/lib/native/app";
import { notThenable } from "@/lib/native/not-thenable";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { PushState } from "@/features/push/client";

/**
 * The site's side of the phone app.
 *
 * Inside the app the page can reach the phone through Capacitor's bridge,
 * which the app injects into every page it opens. In a browser none of this
 * runs: every function here answers "not in the app" first, and the Capacitor
 * runtime itself is only loaded once that answer is no.
 */

export function isInApp(): boolean {
  if (typeof window === "undefined") return false;
  const injected = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(injected?.isNativePlatform?.()) || navigator.userAgent.includes(APP_USER_AGENT_MARK);
}

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";
interface Listener {
  remove: () => Promise<void>;
}

/** The part of @capacitor-firebase/messaging the site uses. */
interface FirebaseMessaging {
  checkPermissions(): Promise<{ receive: Permission }>;
  requestPermissions(): Promise<{ receive: Permission }>;
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  addListener(event: "notificationActionPerformed", handler: (event: { notification: { data?: unknown } }) => void): Promise<Listener>;
  addListener(event: "tokenReceived", handler: (event: { token: string }) => void): Promise<Listener>;
}

/** The part of @capacitor/app the site uses. */
interface AppPlugin {
  addListener(event: "appUrlOpen", handler: (event: { url: string }) => void): Promise<Listener>;
  /** The link the app was started with, when a link (or a notification) started it. */
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
  /** The installed app's own version, e.g. 1.0.12. */
  getInfo(): Promise<{ version: string; build: string }>;
}

/**
 * A plugin, or null where there is none.
 *
 * Capacitor's plugin is a Proxy that answers every property with a native
 * method — `then` included. Handed out of an async function as it is, the
 * promise takes it for a promise, calls its `then`, and the phone answers
 * "GoogleAccount.then() is not implemented": the await never produced the
 * plugin, so no plugin ever worked in the app — the Google button spun for
 * good, the splash was never hidden from the page, no phone was registered
 * for notifications. The wrapper below says it has no `then`, and passes
 * everything else through.
 */
async function plugin<T>(name: string): Promise<T | null> {
  if (!isInApp()) return null;
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(name)) return null;
    return notThenable(registerPlugin<T & object>(name)) as T;
  } catch {
    return null;
  }
}


/** The part of @capacitor/splash-screen the site uses. */
interface SplashPlugin {
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
}

export type DevicePermission = "notifications" | "location" | "camera" | "microphone";
export type DevicePermissionState = "granted" | "denied" | "prompt";
export type DevicePermissionStates = Record<DevicePermission, DevicePermissionState>;

/** What the phone allows the app (DevicePermissionsPlugin.java, from build 10). */
interface DevicePermissionsPlugin {
  check(): Promise<DevicePermissionStates>;
  request(options: { which: DevicePermission[] }): Promise<DevicePermissionStates>;
  openSettings(): Promise<void>;
}

/** The app's own Google sign-in (GoogleAccountPlugin.java). */
interface GoogleAccountPlugin {
  available(): Promise<{ available: boolean }>;
  signIn(options?: { nonce?: string }): Promise<{ idToken: string; email: string }>;
}

export const appPlugin = () => plugin<AppPlugin>("App");
export const googleAccountPlugin = () => plugin<GoogleAccountPlugin>("GoogleAccount");
export const devicePermissionsPlugin = () => plugin<DevicePermissionsPlugin>("DevicePermissions");
export const splashPlugin = () => plugin<SplashPlugin>("SplashScreen");
export const messagingPlugin = () => plugin<FirebaseMessaging>("FirebaseMessaging");

async function platform(): Promise<"android" | "ios" | null> {
  const { Capacitor } = await import("@capacitor/core");
  const name = Capacitor.getPlatform();
  return name === "android" || name === "ios" ? name : null;
}

const toState = (permission: Permission): PushState =>
  permission === "granted" ? "granted" : permission === "denied" ? "denied" : "default";

const TOKEN_KEY = "native-push-token";

async function saveToken(messaging: FirebaseMessaging, locale: string): Promise<boolean> {
  try {
    const [{ token }, os] = await Promise.all([messaging.getToken(), platform()]);
    if (!token || !os) return false;
    const { error } = await getBrowserClient().rpc("save_device_token", { p_token: token, p_platform: os, p_locale: locale });
    if (error) return false;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* only used to forget the token at sign-out */
    }
    return true;
  } catch {
    // An app built without Firebase answers here: no notifications, and the
    // rest of the app carries on.
    return false;
  }
}

/**
 * Notifications in the app, in the same shape as the browser's: what the
 * phone says now, asking once, and keeping this phone's token current.
 * Null outside the app.
 */
export async function nativePush(): Promise<{
  state: () => Promise<PushState>;
  enable: (locale: string) => Promise<PushState>;
  sync: (locale: string) => Promise<void>;
} | null> {
  const messaging = await messagingPlugin();
  if (!messaging) return null;
  return {
    async state() {
      try {
        return toState((await messaging.checkPermissions()).receive);
      } catch {
        return "unsupported";
      }
    },
    async enable(locale) {
      try {
        const answer = toState((await messaging.requestPermissions()).receive);
        if (answer === "granted" && !(await saveToken(messaging, locale))) return "unsupported";
        return answer;
      } catch {
        return "unsupported";
      }
    },
    async sync(locale) {
      await saveToken(messaging, locale);
    },
  };
}

/** Signing out on a phone: its notifications stop with the session. */
export async function forgetNativeToken(): Promise<void> {
  if (!isInApp()) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing stored, nothing to forget */
  }
  if (!token) return;
  try {
    // Signing out waits for this, so it gets three seconds and no more.
    const forget = getBrowserClient().rpc("forget_my_device_token", { p_token: token }).then(() => undefined);
    await Promise.race([forget, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    /* the next person to sign in on this phone takes the token over anyway */
  }
}

/** How a Google sign-in from the phone's own accounts ended. */
export type NativeGoogleResult =
  | { kind: "signed-in"; path: string }
  | { kind: "cancelled" }
  /**
   * Why it could not be done here: "no_bridge" (the page cannot reach the
   * app), the plugin's own codes ("not_configured", "no_account", "failed",
   * "unexpected"), "not_accepted" (the portal does not take this app's
   * tokens yet), "server" or "network".
   */
  | { kind: "unavailable"; reason: string; message?: string };

/**
 * Google sign-in inside the app, from the accounts already on the phone.
 *
 * The browser's way is not a fallback here: in the app Google's page opens in
 * Chrome, and nobody has ever come back from there signed in. So when the
 * phone's way cannot be used the caller is told why, and says so.
 */
export async function nativeGoogleSignIn(next?: string): Promise<NativeGoogleResult> {
  const google = await googleAccountPlugin();
  if (!google) return { kind: "unavailable", reason: "no_bridge" };
  let idToken: string;
  try {
    ({ idToken } = await google.signIn());
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    if (code === "cancelled") return { kind: "cancelled" };
    return { kind: "unavailable", reason: code ?? "failed", message: message?.slice(0, 200) };
  }
  try {
    const response = await fetch("/auth/google/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ idToken, next: next ?? null }),
    });
    if (!response.ok) return { kind: "unavailable", reason: "server", message: String(response.status) };
    const answer = (await response.json()) as { path?: unknown; fallback?: unknown };
    if (answer.fallback === true) return { kind: "unavailable", reason: "not_accepted" };
    const path = typeof answer.path === "string" && answer.path.startsWith("/") && !answer.path.startsWith("//") ? answer.path : null;
    return path ? { kind: "signed-in", path } : { kind: "unavailable", reason: "server" };
  } catch {
    return { kind: "unavailable", reason: "network" };
  }
}
