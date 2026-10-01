/**
 * The portal's own app for Android and iPhone, as the site sees it.
 *
 * The app is the site: a native shell that opens https://…/ and adds what a
 * browser tab cannot have — notifications from Firebase, a home-screen icon,
 * the camera and location asked for by the phone itself. The site needs to
 * know it is inside the app in two places only: where a notification token is
 * saved, and where Google sign-in has to leave for the system browser, because
 * Google refuses to sign anybody in inside an embedded web view.
 *
 * Shared by server and client, so no browser or Node APIs here.
 */

/** The app's id on both stores, and the scheme its links open with. */
export const APP_ID = "tj.mtmu7.app";
export const APP_SCHEME = APP_ID;

/** Appended to the web view's User-Agent by capacitor.config.json. */
export const APP_USER_AGENT_MARK = "MTMU7App";

export function isAppUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && userAgent.includes(APP_USER_AGENT_MARK));
}

/** Only these travel from the browser back into the app with a sign-in. */
const RETURN_PARAMS = ["code", "via", "next", "error", "error_code", "error_description"] as const;

/** The link the system browser opens to hand a Google sign-in back to the app. */
export function appReturnUrl(search: URLSearchParams): string {
  const forward = new URLSearchParams();
  for (const key of RETURN_PARAMS) {
    const value = search.get(key);
    if (value !== null && value.length <= 2000) forward.set(key, value);
  }
  return `${APP_SCHEME}://auth/callback?${forward.toString()}`;
}

/**
 * Where a link that opened the app should take the web view: a sign-in coming
 * back from the browser, or a link to the site itself. Anything else is
 * ignored. Returns a same-origin path, never a full URL.
 */
export function pathForAppLink(link: string, siteOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol === `${APP_SCHEME}:` && url.host === "open") {
    // tj.mtmu7.app://open/messages/<id> — a notification the app drew itself.
    // A path on the site and nothing more: letters, digits and dashes only.
    return /^\/[a-z0-9/-]{0,120}$/i.test(url.pathname) && !url.pathname.startsWith("//") ? url.pathname : null;
  }
  if (url.protocol === `${APP_SCHEME}:`) {
    // tj.mtmu7.app://auth/callback?code=… — "auth" parses as the host.
    const path = `/${url.host}${url.pathname}`.replace(/\/+$/, "");
    if (path !== "/auth/callback") return null;
    const forward = new URLSearchParams();
    for (const key of RETURN_PARAMS) {
      const value = url.searchParams.get(key);
      if (value !== null) forward.set(key, value);
    }
    return `/auth/callback?${forward.toString()}`;
  }
  if (url.origin === siteOrigin && url.pathname.startsWith("/") && !url.pathname.startsWith("//")) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}
