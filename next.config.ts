import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function supabaseImagePattern() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [{ protocol: url.protocol.replace(":", "") as "http" | "https", hostname: url.hostname, pathname: "/storage/v1/**" }];
  } catch {
    return [];
  }
}

/** Static security headers; the CSP (with a per-request nonce) is set in src/proxy.ts. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): the chat's pin asks for one position, on this origin
  // only. The empty list that stood here switched the browser API off for the
  // whole site, so the pin failed before the question was ever put to anybody.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * The site's version as the menu shows it: the day it was built and, on
 * Vercel, the commit — 2026.09.27 · 4948fca.
 */
function buildVersion(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return commit ? `${day} · ${commit}` : day;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion(),
  },
  images: {
    remotePatterns: supabaseImagePattern(),
  },
  // The parents' report is drawn with these fonts (src/lib/telegram/report-card.tsx),
  // read from disk by the two routes that send it.
  outputFileTracingIncludes: {
    "/api/cron/telegram-dispatch": ["src/lib/telegram/fonts/*.ttf"],
    "/api/telegram/webhook": ["src/lib/telegram/fonts/*.ttf"],
    // Report cards and office reports as PDF (src/lib/pdf): the same fonts and the emblem.
    "/report-cards": ["src/lib/telegram/fonts/*.ttf", "src/lib/pdf/assets/*.png"],
    "/admin/reports/export": ["src/lib/telegram/fonts/*.ttf", "src/lib/pdf/assets/*.png"],
  },
  experimental: {
    // The connection watched for us: offline is noticed (the browser's own
    // event, or a page, prefetch or save that could not reach the server),
    // what was asked for is kept and sent again when it is back, and the
    // offline cover (features/native/offline-cover.tsx) reads it.
    useOffline: true,
    // A page opened in the last two minutes opens again at once, from the
    // phone's memory, instead of asking the server — on a slow line that is
    // the difference between a tap and a wait; anything saved in between
    // clears it (revalidatePath), so nobody sees their own change missing.
    staleTimes: {
      dynamic: 120,
    },
    serverActions: {
      // Book files are uploaded directly to storage from the browser; action
      // payloads stay small (metadata, CSV imports up to ~2 MB).
      bodySizeLimit: "4mb",
    },
  },
  // The public school site ("about us", its news, events and documents) is
  // gone; links to it that are still out there land on the front page.
  async redirects() {
    return [
      { source: "/s/:path*", destination: "/", permanent: false },
      { source: "/admin/website", destination: "/admin", permanent: false },
      // One way in for people: the older list pages lead to the account block.
      { source: "/admin/users", destination: "/admin/accounts", permanent: false },
      { source: "/admin/parents", destination: "/admin/accounts/parents", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be served from a cache: a stale one
        // keeps running old code on every device until it happens to expire.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
