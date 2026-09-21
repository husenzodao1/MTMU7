import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { isGuestOnlyPath, isPortalPath } from "@/lib/security/routes";
import { accessTokenSecondsLeft, readSessionCookie } from "@/lib/security/session-token";


/**
 * Runs before rendering: refreshes the Supabase session cookie, verifies the
 * JWT (getClaims validates the signature), applies coarse route gating and
 * sets a per-request CSP nonce. Authorization is still enforced in every
 * page, Server Action and in the database.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const csp = buildContentSecurityPolicy(nonce, supabaseUrl, process.env.NODE_ENV !== "production");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname: path } = request.nextUrl;
  // Only the gated routes need to know who is calling. Public pages skip the
  // auth request entirely: asking on every hit burns the project's auth rate
  // limit and, once it answers 429, would look like everyone got signed out.
  const needsSession = isPortalPath(path) || isGuestOnlyPath(path);
  let isAuthenticated = false;

  if (supabaseUrl && anonKey && needsSession) {
    const sessionCookie = readSessionCookie(request.cookies.getAll());
    const secondsLeft = accessTokenSecondsLeft(sessionCookie);
    const hasSession = sessionCookie !== null;
    // Ask the auth server only when a refresh is actually due. Asking on every
    // page view exhausts the project's auth rate limit, and a 429 answer would
    // look exactly like "signed out" — which sent signed-in people back to the
    // sign-in page in a loop. Coarse gating may trust the cookie: the page
    // guard and row level security decide what the caller may actually see.
    const refreshDue = hasSession && (secondsLeft === null || secondsLeft < 120);
    isAuthenticated = hasSession;

    if (refreshDue) {
      const supabase = createServerClient<Database>(supabaseUrl, anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
            response = NextResponse.next({ request: { headers: requestHeaders } });
            for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          },
        },
      });
      // getUser() rotates the tokens and writes them onto this response; a
      // Server Component cannot write cookies, so if the refresh happened there
      // the browser would keep the spent refresh token and the next request
      // would fail with "Invalid Refresh Token: Already Used".
      try {
        const { data, error } = await supabase.auth.getUser();
        if (data.user) {
          isAuthenticated = true;
        } else if (error && isStaleSession(error)) {
          clearAuthCookies(request, response);
          isAuthenticated = false;
        }
        // Any other failure (rate limit, network) keeps the cookie's answer.
      } catch {
        // Keep the cookie's answer rather than signing the visitor out.
      }
    }
  }

  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && isPortalPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(url), csp, response);
  }

  if (isAuthenticated && isGuestOnlyPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withSecurityHeaders(NextResponse.redirect(url), csp, response);
  }

  return withSecurityHeaders(response, csp);
}

/** A session the project will never accept again: start over cleanly. */
function isStaleSession(error: { code?: string; status?: number; message?: string }): boolean {
  const code = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return /refresh_token|session_not_found|invalid_grant|already used|user_not_found|jwt/.test(code);
}

/** Drops the Supabase auth cookies so the next request starts signed out. */
function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) response.cookies.delete(cookie.name);
  }
}

function withSecurityHeaders(target: NextResponse, csp: string, cookieSource?: NextResponse) {
  if (cookieSource && cookieSource !== target) {
    for (const cookie of cookieSource.cookies.getAll()) target.cookies.set(cookie);
  }
  target.headers.set("Content-Security-Policy", csp);
  return target;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|images/|robots.txt|sitemap.xml|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
