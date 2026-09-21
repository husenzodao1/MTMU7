import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * Only the public school website is crawlable. Everything behind
 * authentication is excluded; the real protection is the proxy, the page
 * guards and RLS — this file only keeps private URLs out of search results.
 */
const PRIVATE_PREFIXES = [
  "/admin/", "/dashboard", "/teach", "/messages", "/notifications", "/profile", "/settings",
  "/schedule", "/grades", "/attendance", "/homework", "/children", "/friends", "/library",
  "/news", "/announcements", "/events", "/documents", "/access-denied", "/pending",
  "/api/", "/files/", "/auth/", "/verify", "/dev-preview",
];

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES }],
    sitemap: base ? `${base.replace(/\/$/, "")}/sitemap.xml` : undefined,
  };
}
