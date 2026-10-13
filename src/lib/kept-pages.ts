/**
 * Empties the pages and photos the service worker keeps on the device
 * (public/sw.js): signing out, nothing of one person's screens is left for
 * the next to see.
 */
export async function forgetKeptPages(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all(["pages-v1", "media-v1"].map((name) => caches.delete(name).catch(() => false)));
}
