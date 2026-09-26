/*
 * The portal's service worker. Two jobs:
 *
 * 1. Show a message that arrived while the portal was closed, and open the
 *    conversation when it is tapped.
 * 2. Keep the portal's unchanging files — its scripts, styles, fonts, icons —
 *    on the device, so the second visit starts at once and a school's slow
 *    line carries only what is new.
 *
 * Never a page and never data: a school portal that shows yesterday's marks
 * from a cache is worse than one that says it is offline. Only files whose
 * address changes whenever their content does (Next's /_next/static/) or that
 * never change (the icons and pictures shipped with the site) are kept.
 */

const STATIC_CACHE = "static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("static-") && name !== STATIC_CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

function isStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/brand/") ||
      url.pathname.startsWith("/gov/") ||
      url.pathname.startsWith("/flags/") ||
      url.pathname.startsWith("/images/"))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!isStatic(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      // Whole, same-origin answers only; a partial or failed one is passed on
      // and never kept.
      if (response.ok && response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })()
  );
});

function samePage(clientUrl, path) {
  try {
    return new URL(clientUrl).pathname === path;
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "МТМУ №7";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/messages";

  event.waitUntil(
    (async () => {
      // Somebody already looking at this very conversation has just watched
      // the message arrive; a notification on top of it would be noise.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.focused && samePage(client.url, url))) return;

      await self.registration.showNotification(title, {
        body: typeof data.body === "string" ? data.body : "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : undefined,
        renotify: Boolean(data.tag),
        timestamp: Date.now(),
        data: { url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/messages";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer a tab already on the conversation, then any tab of the portal,
      // and only then a new window.
      const exact = windows.find((client) => samePage(client.url, url));
      if (exact) return exact.focus();
      const any = windows.find((client) => "navigate" in client);
      if (any) {
        await any.focus();
        return any.navigate(url);
      }
      return self.clients.openWindow(url);
    })()
  );
});
