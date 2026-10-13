/**
 * When the server drew this page, for the page itself to tell a copy kept on
 * the device (public/sw.js) from a fresh one (app-shell.tsx refreshes the
 * former as it opens). A function, so the moment is taken per request.
 */
export function renderedAt(): number {
  return Date.now();
}
