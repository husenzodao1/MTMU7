/**
 * Coarse route classification used by the proxy. Kept pure and separate so the
 * rules can be tested: a mistake here produces redirect loops rather than a
 * visible error.
 */

/** Signed-in area: an anonymous visitor is sent to the sign-in page. */
export const PORTAL_PREFIXES = [
  "/dashboard", "/admin", "/teach", "/messages", "/library", "/notifications", "/profile", "/settings",
  "/schedule", "/grades", "/attendance", "/homework", "/children", "/friends", "/access-denied",
  // The support chat itself; /support alone is public, for somebody who cannot
  // sign in and needs to say so.
  "/support/chat",
] as const;

/**
 * Pages that make no sense for a signed-in visitor. "/confirm-email" is not one
 * of them: a session exists there by design, and the visitor is sent to it
 * precisely because they have one but have not yet proved the address.
 * Bouncing them back would loop between the two pages.
 */
export const GUEST_ONLY = ["/login", "/reset-password"] as const;

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPortalPath(pathname: string): boolean {
  return matches(pathname, PORTAL_PREFIXES);
}

export function isGuestOnlyPath(pathname: string): boolean {
  return matches(pathname, GUEST_ONLY);
}

/**
 * Whether a visitor who already has a session should be sent away from this
 * page.
 *
 * Normally yes: they pressed "sign in" while already in. But not when the page
 * carries a `reason`, because that message is there precisely because another
 * page just sent them here — a blocked account is refused by the dashboard,
 * which redirects to /login?reason=inactive, and sending them back produced
 * ERR_TOO_MANY_REDIRECTS.
 */
export function shouldRedirectSignedInAway(pathname: string, search: URLSearchParams): boolean {
  return isGuestOnlyPath(pathname) && !search.has("reason");
}
