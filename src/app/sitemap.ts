import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** Public URLs only: the front page and the directory of schools. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (publicEnv.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) return [];
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/schools`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
  return entries;
}
