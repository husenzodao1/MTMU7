/**
 * Empties the pages and photos the service worker keeps on the device
 * (public/sw.js): signing out, nothing of one person's screens is left for
 * the next to see — and the next to sign in installs their own
 * (page-installer.tsx).
 */
export async function forgetKeptPages(): Promise<void> {
  forgetInstalled();
  if (typeof caches === "undefined") return;
  await Promise.all(["pages-v1", "data-v1", "media-v1"].map((name) => caches.delete(name).catch(() => false)));
}

/** The data of pages kept on the device (public/sw.js): let go of on a pull, so the page is asked for afresh. */
export async function forgetKeptData(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete("data-v1").catch(() => false);
}

/** What was installed on this phone, for whom, from which version of the site. */
export interface Installed {
  user: string;
  build: string;
  at: number;
  pages: string[];
}

const INSTALLED = "mtmu7:installed";

export function readInstalled(): Installed | null {
  try {
    const raw = window.localStorage.getItem(INSTALLED);
    if (!raw) return null;
    const value = JSON.parse(raw) as Installed;
    return value && typeof value.user === "string" && Array.isArray(value.pages) ? value : null;
  } catch {
    return null;
  }
}

export function saveInstalled(value: Installed): void {
  try {
    window.localStorage.setItem(INSTALLED, JSON.stringify(value));
  } catch {
    // A phone with no room for this installs again next time.
  }
}

export function forgetInstalled(): void {
  try {
    window.localStorage.removeItem(INSTALLED);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/**
 * Something on a page has changed while the page is not open — a new message
 * in a conversation: what the device kept of it is fetched again now
 * (public/sw.js, renew-page), so it opens with it even with no line.
 */
export function renewKeptPage(path: string): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "renew-page", path });
  } catch {
    // No worker, nothing kept: the page is fetched when it is opened.
  }
}
