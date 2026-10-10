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
  },
  experimental: {
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
