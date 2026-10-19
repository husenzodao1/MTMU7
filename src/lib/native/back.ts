/**
 * What one press of Android's back button does in the app (native-app.tsx),
 * decided apart from the phone so it can be checked: an app's back, not a
 * browser's.
 *
 * - Whatever is open over the page closes first (a menu, a dialog, a photo,
 *   messages being chosen).
 * - On the first page it asks for a second press, and only a second press
 *   within `exitMs` leaves.
 * - A conversation opened from the list goes back to the list; one opened any
 *   other way (a notification, a link) is replaced by the list, so the list
 *   is never skipped on the way out.
 * - Anywhere else it goes one page back, or — with nothing before it — to
 *   where the page belongs.
 *
 * Shared by server and client, so no browser APIs here.
 */

/** Pages back does not go behind: from these the app steps aside, like any app at its start. */
export const ROOT_PATHS: ReadonlySet<string> = new Set(["/", "/dashboard", "/login", "/admin"]);
/** A second press of back on the first page within this long leaves the app. */
export const EXIT_MS = 2000;
const THREAD = /^\/messages\/[0-9a-f-]{36}$/;

export type BackAction = { kind: "close" } | { kind: "hint" } | { kind: "leave" } | { kind: "back" } | { kind: "replace"; path: string };

export function backAction(input: {
  path: string;
  overlayOpen: boolean;
  canGoBack: boolean;
  /** This place in the history was opened from the list of conversations (messages-frame.tsx). */
  fromList: boolean;
  /** When the first press on the first page was, or 0. */
  armedAt: number;
  now: number;
}): BackAction {
  if (input.overlayOpen) return { kind: "close" };
  if (ROOT_PATHS.has(input.path)) return input.armedAt > 0 && input.now - input.armedAt < EXIT_MS ? { kind: "leave" } : { kind: "hint" };
  if (THREAD.test(input.path) && !input.fromList) return { kind: "replace", path: "/messages" };
  if (input.canGoBack) return { kind: "back" };
  return { kind: "replace", path: THREAD.test(input.path) ? "/messages" : "/dashboard" };
}
