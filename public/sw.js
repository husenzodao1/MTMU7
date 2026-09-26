/*
 * The portal's service worker. It does one thing: show a message that arrived
 * while the portal was closed, and open the conversation when it is tapped.
 *
 * No caching and no offline pages — a school portal that shows yesterday's
 * marks from a cache is worse than one that says it is offline.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
