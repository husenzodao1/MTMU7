import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

const PORTAL_PREFIXES = [
  "/dashboard", "/admin", "/teach", "/messages", "/library", "/notifications", "/profile", "/settings",
  "/schedule", "/grades", "/attendance", "/homework", "/documents", "/announcements", "/events",
  "/news", "/children", "/friends", "/search", "/access-denied",
];
const GUEST_ONLY = ["/login", "/register", "/reset-password"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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
  let isAuthenticated = false;

  if (supabaseUrl && anonKey) {
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
    try {
      const { data } = await supabase.auth.getClaims();
      isAuthenticated = Boolean(data?.claims?.sub);
    } catch {
      isAuthenticated = false;
    }
  }

  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && matches(pathname, PORTAL_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(url), csp, response);
  }

  if (isAuthenticated && matches(pathname, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withSecurityHeaders(NextResponse.redirect(url), csp, response);
  }

  return withSecurityHeaders(response, csp);
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
