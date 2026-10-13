/*
 * The portal's service worker. Three jobs:
 *
 * 1. Show a message that arrived while the portal was closed, and open the
 *    conversation when it is tapped — or answer it, or mark it read, from the
 *    notification itself, where the browser offers the buttons.
 * 2. Keep the portal's unchanging files — its scripts, styles, fonts, icons,
 *    pictures — on the device, so nothing that has been seen once is ever
 *    fetched again: on a school's slow line only what is new travels.
 * 3. Keep the pages themselves, as an app keeps its screens: every page the
 *    portal has shown or fetched ahead (components/shell/warm-pages.ts) is
 *    kept, with the data it came with. A page opens from the device at once
 *    and is fetched again behind it (the page then refreshes itself); a page
 *    whose fresh copy is slow to come, or cannot come at all, is answered
 *    from what was kept. With no line the portal still opens, on its last
 *    state, and says so at the foot of the screen (offline-cover.tsx).
 *
 * Signing out empties the kept pages (app-shell.tsx, signed-out.tsx): one
 * person's screens are never shown to the next.
 */

const STATIC_CACHE = "static-v1";
const PAGE_CACHE = "pages-v1";
const MEDIA_CACHE = "media-v1";
/** How many pages (and their data fetches) are kept, the oldest let go first. */
const PAGE_LIMIT = 220;
/** How many photos from the school's storage are kept. */
const MEDIA_LIMIT = 500;
/** A fresh page's data slower than this is answered from what was kept, if anything was. */
const DATA_WAIT_MS = 2500;
/** A page never seen before waits this long for the network before saying there is none. */
const PAGE_WAIT_MS = 12000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGE_CACHE, MEDIA_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((name) => /^(static|pages|media)-/.test(name) && !keep.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

/** A picture the site ships, at one of the sizes Next.js makes of it. */
function isShippedPicture(url) {
  if (url.pathname !== "/_next/image") return false;
  const source = url.searchParams.get("url") || "";
  return source.startsWith("/_next/static/") || source.startsWith("/images/");
}

function isStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/brand/") ||
      url.pathname.startsWith("/gov/") ||
      url.pathname.startsWith("/flags/") ||
      url.pathname.startsWith("/images/") ||
      isShippedPicture(url))
  );
}

/** A photo from the school's storage: public, never signed (a signed address changes with every look). */
function isMedia(url) {
  if (url.pathname === "/_next/image") {
    const source = url.searchParams.get("url") || "";
    return /\/storage\/v1\/object\/public\//.test(source);
  }
  return /\/storage\/v1\/(object|render\/image)\/public\//.test(url.pathname) && !url.searchParams.has("token");
}

/** A page of the portal, or the data a page is drawn from: "page", "data", or null. */
function pageKind(request, url) {
  if (url.origin !== self.location.origin) return null;
  if (/^\/(api|auth|_next|files|download|icons|brand|images|gov|flags)(\/|$)/.test(url.pathname)) return null;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/manifest") || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  if (url.searchParams.has("code") || url.searchParams.has("token_hash")) return null;
  if (request.mode === "navigate") return "page";
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return "data";
  return null;
}

/** A page is kept by its address alone; its data by the whole request address (it names the state it was asked from). */
function pageKey(url, kind) {
  if (kind === "data") return url.href;
  return `${url.origin}${url.pathname}${url.search}`;
}

async function trim(cache, limit) {
  const keys = await cache.keys();
  const extra = keys.length - limit;
  for (let i = 0; i < extra; i += 1) await cache.delete(keys[i]);
}

/**
 * The scripts and styles a page or its data name, fetched into the device
 * now — so a page fetched ahead, never opened, still opens with no line.
 */
const CHUNK = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%()[\]@]+?\.(?:js|css|woff2)/g;
async function keepChunks(response) {
  try {
    const text = await response.text();
    const found = new Set();
    for (const match of text.matchAll(CHUNK)) {
      const path = match[0].startsWith("/_next/") ? match[0] : `/_next/${match[0]}`;
      found.add(new URL(path, self.location.origin).href);
      if (found.size >= 80) break;
    }
    if (found.size === 0) return;
    const cache = await caches.open(STATIC_CACHE);
    for (const href of found) {
      if (await cache.match(href)) continue;
      const answer = await fetch(href).catch(() => null);
      if (answer && answer.ok && answer.status === 200) await cache.put(href, answer).catch(() => undefined);
    }
  } catch {
    // Kept is kept; what could not be fetched is fetched when it is needed.
  }
}

/** A plain page for an address never seen before, with no line to fetch it on. */
function offlinePage() {
  const html = `<!doctype html><html lang="tg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МТМУ №7</title><style>
:root{color-scheme:light dark}body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f4f2ec;color:#1b1f27;text-align:center;padding:1.5rem}
@media (prefers-color-scheme:dark){body{background:#0a0e17;color:#eee9df}}
.box{max-width:20rem}.i{width:3.25rem;height:3.25rem;margin:0 auto 1rem;border-radius:999px;display:grid;place-items:center;border:1px solid #c8a46a55;color:#c8a46a}
h1{font-size:1.05rem;margin:0 0 .4rem}p{font-size:.875rem;opacity:.75;margin:0 0 1.25rem;line-height:1.5}
button{min-height:2.75rem;padding:0 1.5rem;border:0;border-radius:.75rem;background:#c8a46a;color:#15110a;font-weight:600;font-size:.875rem}
</style></head><body><div class="box"><div class="i"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.1-1.5M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11.1 5"/><circle cx="12" cy="20" r="1"/></svg></div>
<h1>Пайвасти интернет нест</h1><p>Ин саҳифа ҳанӯз дар дастгоҳ нест. Вақте ки интернет барқарор шавад, худ ба худ кушода мешавад.</p>
<button onclick="location.reload()">Аз нав кӯшиш кардан</button></div>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function keep(event, cache, key, response) {
  if (!response || !response.ok || response.status !== 200 || response.type !== "basic" || response.redirected) return;
  const copy = response.clone();
  const scan = response.clone();
  event.waitUntil(
    cache
      .put(key, copy)
      .then(() => trim(cache, PAGE_LIMIT))
      .then(() => keepChunks(scan))
      .catch(() => undefined)
  );
}

/**
 * Pages outside the portal's frame — signing in, the front page, the public
 * ones — always come from the network when it answers: their forms must be
 * this version's. What was kept of them is only for when there is no line.
 */
const NETWORK_FIRST = /^\/($|login|register|two-factor|confirm-email|forgot|reset|verify|auth|app(\/|$)|terms|privacy|download|u\/|offline)/;
/** A kept page served this recently is asked of the network next time: a page reloading itself wants its newest copy. */
const servedKept = new Map();
const AGAIN_MS = 15000;

/**
 * A page of the portal opens from the device at once when it is there, and
 * its fresh copy is kept for next time (the page asks for its own fresh data
 * as it opens, app-shell.tsx). A page asked for again straight after — a
 * reload, a new version taking over — waits for the network instead, and
 * falls back on what was kept. A page never kept waits for the network, and
 * with none gets the plain "no internet" page.
 */
async function answerPage(event, request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKey(url, "page");
  const kept = await cache.match(key, { ignoreVary: true });
  const fresh = fetch(request).then(
    (response) => {
      keep(event, cache, key, response);
      return response;
    },
    () => null
  );
  const recently = (servedKept.get(key) || 0) > Date.now() - AGAIN_MS;
  if (kept && !recently && !NETWORK_FIRST.test(url.pathname)) {
    servedKept.set(key, Date.now());
    event.waitUntil(fresh);
    return kept;
  }
  const answer = await Promise.race([fresh, new Promise((resolve) => setTimeout(() => resolve("slow"), kept ? DATA_WAIT_MS * 2 : PAGE_WAIT_MS))]);
  if (answer && answer !== "slow") return answer;
  if (kept) {
    event.waitUntil(fresh);
    return kept;
  }
  const late = await fresh;
  if (late) return late;
  return offlinePage();
}

/**
 * A page's data: the network's if it answers in a moment, else what was kept
 * for the very same request, else the network's whenever it answers.
 */
async function answerData(event, request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKey(url, "data");
  const fresh = fetch(request).then(
    (response) => {
      keep(event, cache, key, response);
      return response;
    },
    () => null
  );
  const first = await Promise.race([fresh, new Promise((resolve) => setTimeout(() => resolve("slow"), DATA_WAIT_MS))]);
  if (first && first !== "slow") return first;
  const kept = await cache.match(key, { ignoreVary: true });
  if (kept) {
    event.waitUntil(fresh);
    return kept;
  }
  const late = await fresh;
  if (late) return late;
  return Response.error();
}

async function answerStatic(request) {
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
}

async function answerMedia(event, request) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && (response.type === "basic" || response.type === "cors") && response.status === 200) {
    const copy = response.clone();
    event.waitUntil(
      cache
        .put(request, copy)
        .then(() => trim(cache, MEDIA_LIMIT))
        .catch(() => undefined)
    );
  }
  return response;
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
  if (isStatic(url)) {
    event.respondWith(answerStatic(request));
    return;
  }
  if (isMedia(url)) {
    event.respondWith(answerMedia(event, request));
    return;
  }
  const kind = pageKind(request, url);
  if (kind === "page") event.respondWith(answerPage(event, request, url));
  else if (kind === "data") event.respondWith(answerData(event, request, url));
});

// The page asks the worker to forget the kept pages (signing out).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "forget-pages") {
    event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(MEDIA_CACHE)]));
  }
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

      // A signed note from the portal lets the notification be answered
      // without opening anything (see /api/push/reply). Browsers that can
      // type into a notification show a box; the rest open the conversation
      // with the composer ready.
      const reply = typeof data.reply === "string" ? data.reply : null;
      const labels = data.labels && typeof data.labels === "object" ? data.labels : null;
      const actions =
        reply && labels
          ? [
              { action: "reply", type: "text", title: String(labels.reply || "Reply"), placeholder: String(labels.placeholder || "") },
              { action: "read", title: String(labels.read || "Mark as read") },
            ]
          : [];

      await self.registration.showNotification(title, {
        body: typeof data.body === "string" ? data.body : "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : undefined,
        renotify: Boolean(data.tag),
        timestamp: Date.now(),
        actions,
        data: { url, reply },
      });
    })()
  );
});

function answer(body) {
  return fetch("/api/push/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  }).then(
    (response) => response.ok,
    () => false
  );
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = data.url || "/messages";
  const reply = typeof data.reply === "string" ? data.reply : null;

  if (reply && event.action === "read") {
    event.waitUntil(answer({ action: "read", token: reply }));
    return;
  }
  if (reply && event.action === "reply") {
    const text = typeof event.reply === "string" ? event.reply.trim() : "";
    if (text) {
      event.waitUntil(answer({ action: "reply", token: reply, text }));
      return;
    }
    // No box in this browser: open the conversation, composer first.
    url = `${url}${url.includes("?") ? "&" : "?"}reply=1`;
  }

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
