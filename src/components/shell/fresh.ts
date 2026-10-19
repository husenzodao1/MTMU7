"use client";

/** The service worker's answer to "the next data is to be fresh" is waited for this long. */
const ASK_MS = 1000;

/** The page's own address, as the service worker names it (public/sw.js, pagePath). */
function pagePath(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("_rsc");
  const search = params.toString();
  return `${window.location.pathname}${search ? `?${search}` : ""}`;
}

/**
 * Tells the service worker that the page's next data is to come from the
 * network, not from what the device kept (public/sw.js, fresh-data) — the
 * pull at the top of a page (pull-to-refresh.tsx). True when it may go now;
 * with no service worker the refresh goes to the network as it is. Nothing
 * asks this on a timer: a page changes on the screen only when its person
 * pulls it down.
 */
export async function askFresh(force = false): Promise<boolean> {
  const worker = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
  if (!worker) return true;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    // A service worker from before this one does not answer: the pull goes all the same.
    const timer = window.setTimeout(() => resolve(force), ASK_MS);
    channel.port1.onmessage = (event: MessageEvent<{ go?: boolean }>) => {
      window.clearTimeout(timer);
      resolve(Boolean(event.data?.go));
    };
    worker.postMessage({ type: "fresh-data", path: pagePath(), build: document.documentElement.dataset.build ?? "", force }, [channel.port2]);
  });
}
