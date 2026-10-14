/**
 * Returns a same-origin, relative path suitable for redirects, or the fallback.
 * Rejects absolute URLs, protocol-relative URLs (`//host`), backslash tricks,
 * userinfo injection (`@host`) and control characters (SEC-008).
 */
export function safeRedirectPath(candidate: unknown, fallback = "/dashboard"): string {
  if (typeof candidate !== "string") return fallback;
  const value = candidate.trim();
  if (value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters or backslashes can be normalised by browsers into other hosts.
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;

  try {
    const base = "http://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (path.startsWith("//")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}

/** Auth flow pages: never a destination once the visitor is signed in. */
const AUTH_PATHS = ["/login", "/reset-password", "/confirm-email", "/verify", "/auth"];

/**
 * Where to land after a successful sign-in. A "next" left over from an earlier
 * redirect can point back into the auth flow — sending the visitor to the
 * registration form right after they typed the correct password — so those
 * destinations fall back to the dashboard.
 */
export function postSignInPath(candidate: unknown, fallback = "/dashboard"): string {
  const path = safeRedirectPath(candidate, fallback);
  const pathname = path.split(/[?#]/)[0] ?? "/";
  const isAuthPage = AUTH_PATHS.some((auth) => pathname === auth || pathname.startsWith(`${auth}/`));
  return isAuthPage ? fallback : path;
}
