/**
 * Coarse route classification used by the proxy. Kept pure and separate so the
 * rules can be tested: a mistake here produces redirect loops rather than a
 * visible error.
 */

/** Signed-in area: an anonymous visitor is sent to the sign-in page. */
export const PORTAL_PREFIXES = [
  "/dashboard", "/admin", "/teach", "/messages", "/library", "/notifications", "/profile", "/settings",
  "/schedule", "/grades", "/attendance", "/homework", "/children", "/friends", "/access-denied",
] as const;

/**
 * Pages that make no sense for a signed-in visitor. "/register" is not one of
 * them: a session may exist while the account still has no profile row, and the
 * portal sends exactly those visitors to /register?step=profile. Bouncing them
 * back would loop between the two pages.
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
