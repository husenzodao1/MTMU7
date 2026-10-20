/*
 * The portal's service worker. Three jobs:
 *
 * 1. Show a notification that arrived while the portal was closed, and open
 *    its page when it is tapped.
 * 2. Keep the portal's unchanging files — its scripts, styles, fonts, icons,
 *    pictures — on the device, so nothing that has been seen once is ever
 *    fetched again: on a school's slow line only what is new travels.
 * 3. Keep the pages themselves, as an app keeps its screens: every page this
 *    person can open is installed after signing in (keep-pages,
 *    page-installer.tsx), and every page and its data shown since is kept.
 *    A page and its data open from the device at once, with or without a
 *    line; what was kept is fetched again behind the screen when it grows
 *    old, and let go of when something is saved or the page is pulled down
 *    (fresh-data, pull-to-refresh.tsx). Nothing refreshes on a timer.
 *
 * Every page and every piece of data is kept with the version of the site it
 * belongs to (x-mtmu7-build, data-build on <html>). A page is only ever given
 * data of its own version — Next.js opens a page anew, whole, for data of
 * another — and a page kept from an older version than the network last
 * answered with is asked of the network first while there is a line. Every
 * script, style and font of the newest version is kept on the device as soon
 * as the version is seen (app-assets.json, scripts/build/asset-list.mjs), so
 * the app opens and works with no line at all.
 *
 * Signing out empties the kept pages (app-shell.tsx, signed-out.tsx): one
 * person's screens are never shown to the next.
 */

const STATIC_CACHE = "static-v1";
const PAGE_CACHE = "pages-v1";
/** Kept data older than this is fetched again behind the copy answered from the device. */
const DATA_FRESH_MS = 60_000;
/** Kept data fetched again side by side, at most. */
const RENEW_AT_ONCE = 3;
/** A page's data, kept apart from the pages: there is much more of it, and it must never push an installed page out. */
const DATA_CACHE = "data-v1";
const MEDIA_CACHE = "media-v1";
/** How many pages are kept, the oldest let go first. */
const PAGE_LIMIT = 700;
/** How many data fetches are kept, the oldest let go first. */
const DATA_LIMIT = 1200;
/** After something is saved, the page it was saved on is installed again this long after. */
const AFTER_CHANGE_MS = 2500;
/**
 * Pages installed side by side (keep-pages): quick enough on a good line,
 * gentle on a slow one — and on the server when a whole class signs in at once.
 */
const INSTALL_AT_ONCE = 3;
/** How many photos from the school's storage are kept. */
const MEDIA_LIMIT = 800;
/** A fresh page's data slower than this is answered from what was kept, if anything was. */
const DATA_WAIT_MS = 2500;
/** A page the device holds, that a newer version has replaced, waits only this long for the new one before the held copy is answered. */
const STALE_GRACE_MS = 1500;
/** A page never seen before waits this long for the network before saying there is none. */
const PAGE_WAIT_MS = 12000;
/** A quiet refresh slower than this is answered with the last one, and kept when it comes. */
const FRESH_WAIT_MS = 8000;
/** A quiet refresh with no line is tried this many times, a little apart, before giving up. */
const FRESH_TRIES = 3;
/** How long the page's word that its next data is to be fresh holds. */
const FRESH_HOLD_MS = 5000;
/** What this worker remembers between its starts: the newest version seen, and which version each open page is. */
const META_CACHE = "meta-v1";
const META_KEY = "/__sw/meta";
const LISTS_KEY = "/__sw/asset-lists";
/** Every file of a version (scripts/build/asset-list.mjs), written next to them. */
const ASSET_LIST = "/_next/static/app-assets.json";
/** A version's files fetched side by side. */
const ASSETS_AT_ONCE = 3;
/** Open pages whose version is remembered, at most. */
const CLIENTS_KEPT = 30;

/**
 * The page in front, which has asked for its next data from the network
 * (quiet-refresh.ts): its address, the version of the site it is, and until
 * when the word holds.
 */
let freshFor = null;
/** Quiet refreshes that found no line, one after another, and when the last did: they rest a while. */
let freshMisses = 0;
let freshMissedAt = 0;
/** The version of the site a page was last moved on from (answerFresh): moved once, not on every refresh. */
let movedFrom = "";

/** The version the network last answered with: the newest there is, as far as this worker knows. */
let latestBuild = "";
/** The version whose every script, style and font is on the device. */
let assetsDone = "";
/**
 * When something about the person signed in last changed (their photo, which
 * every page's header shows): a page or its data kept before then is asked of
 * the network first while there is a line, and kept anew (kept-pages.ts).
 */
let meChangedAt = 0;
/** The version whose files are being fetched now. */
let assetsFor = "";
/** Which version each open page is (a client id to a version), so its data is of the same one. */
const clientBuilds = new Map();
let metaLoaded = null;

/** A version that says which one it is: never "local", a developer's machine. */
function realBuild(build) {
  return typeof build === "string" && build && build !== "local" ? build : "";
}

/** Which version a response is of: kept with it, or as the site said it. */
function buildOf(response) {
  return realBuild(response.headers.get("x-kept-build") || response.headers.get("x-mtmu7-build") || "");
}

/** The version a page names on its <html> (src/app/layout.tsx) — where an app's own fetch has left the headers behind. */
const HTML_BUILD = /<html[^>]*?\sdata-build="([^"]*)"/;

function loadMeta() {
  metaLoaded ??= (async () => {
    try {
      const answer = await (await caches.open(META_CACHE)).match(META_KEY);
      if (!answer) return;
      const meta = await answer.json();
      if (!latestBuild) latestBuild = realBuild(meta.latest);
      if (!assetsDone) assetsDone = realBuild(meta.assets);
      if (typeof meta.me === "number" && meta.me > meChangedAt) meChangedAt = meta.me;
      for (const [id, build] of Array.isArray(meta.clients) ? meta.clients : []) if (!clientBuilds.has(id)) clientBuilds.set(id, build);
    } catch {
      // Remembered again from the next answers.
    }
  })();
  return metaLoaded;
}

async function saveMeta() {
  try {
    const meta = { latest: latestBuild, assets: assetsDone, me: meChangedAt, clients: [...clientBuilds].slice(-CLIENTS_KEPT) };
    await (await caches.open(META_CACHE)).put(META_KEY, new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // Remembered in memory for as long as this worker runs.
  }
}

function rememberClient(id, build) {
  if (!id || !realBuild(build) || clientBuilds.get(id) === build) return Promise.resolve();
  clientBuilds.delete(id);
  clientBuilds.set(id, build);
  while (clientBuilds.size > CLIENTS_KEPT) clientBuilds.delete(clientBuilds.keys().next().value);
  return saveMeta();
}

/** A version the network has answered with: the newest from now on, and its files are fetched onto the device. */
function seeBuild(build) {
  const seen = realBuild(build);
  if (!seen || seen === latestBuild) return Promise.resolve();
  latestBuild = seen;
  return saveMeta().then(() => keepBuildFiles(seen));
}

/**
 * Every script, style and font of a version, on the device — those a page
 * names, and those only fetched when needed (a picker, an editor) that no
 * page names — so nothing of it needs the network again. Once all are here,
 * the files of versions before the previous one are let go of.
 */
async function keepBuildFiles(build) {
  await loadMeta();
  if (!build || build === assetsDone || build === assetsFor) return;
  assetsFor = build;
  try {
    const answer = await fetch(ASSET_LIST, { cache: "no-store", credentials: "same-origin" });
    if (!answer.ok) return;
    const list = await answer.json();
    if (!list || !Array.isArray(list.files)) return;
    // Another version answered (one more has come out meanwhile): its own turn comes.
    if (realBuild(list.build) && list.build !== build) return;
    const files = list.files.filter((path) => typeof path === "string" && path.startsWith("/_next/static/"));
    const queue = files.filter((path) => /\.(?:js|css|woff2)$/.test(path));
    const cache = await caches.open(STATIC_CACHE);
    let missed = 0;
    const worker = async () => {
      while (queue.length > 0 && latestBuild === build) {
        const href = new URL(queue.shift(), self.location.origin).href;
        if (await cache.match(href)) continue;
        const got = await fetch(href, { credentials: "same-origin" }).catch(() => null);
        if (got && got.ok && got.status === 200 && got.type === "basic") await cache.put(href, got).catch(() => (missed += 1));
        else missed += 1;
      }
    };
    await Promise.all(Array.from({ length: ASSETS_AT_ONCE }, worker));
    if (missed > 0 || latestBuild !== build) return;
    assetsDone = build;
    await saveMeta();
    await letGoOfOldFiles(build, files);
  } catch {
    // No line: tried again when a page next says hello.
  } finally {
    if (assetsFor === build) assetsFor = "";
  }
}

/** The files of this version and the one before it stay; the rest under /_next/static go. */
async function letGoOfOldFiles(build, files) {
  try {
    const meta = await caches.open(META_CACHE);
    const was = await meta.match(LISTS_KEY).then((answer) => (answer ? answer.json() : []), () => []);
    const lists = [...(Array.isArray(was) ? was : []).filter((entry) => entry && entry.build !== build).slice(-1), { build, files }];
    await meta.put(LISTS_KEY, new Response(JSON.stringify(lists), { headers: { "Content-Type": "application/json" } }));
    // Only once two versions are known, so the one before this is never lost.
    if (lists.length < 2) return;
    const wanted = new Set(lists.flatMap((entry) => (Array.isArray(entry.files) ? entry.files : [])));
    const cache = await caches.open(STATIC_CACHE);
    for (const key of await cache.keys()) {
      const path = new URL(key.url).pathname;
      if (path.startsWith("/_next/static/") && !wanted.has(path)) await cache.delete(key);
    }
  } catch {
    // Let go of next time.
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGE_CACHE, DATA_CACHE, MEDIA_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((name) => /^(static|pages|data|media)-/.test(name) && !keep.includes(name)).map((name) => caches.delete(name)));
      await forgetChatPages();
      await self.clients.claim();
    })()
  );
});

/**
 * The portal's own chat is retired: whatever the device kept of its pages —
 * conversations included — goes, so nobody's messages stay on a phone.
 */
const CHAT_PAGE = /^\/(messages|support\/chat)(\/|$)/;
async function forgetChatPages() {
  for (const name of [PAGE_CACHE, DATA_CACHE]) {
    try {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (CHAT_PAGE.test(new URL(request.url).pathname)) await cache.delete(request);
      }
    } catch {
      // Tried again when the next version starts.
    }
  }
}

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
 * now — so a page fetched ahead, never opened, still opens with no line —
 * and the photos it shows from the school's storage (avatars, news, covers),
 * so they are there too, with or without one.
 */
const CHUNK = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./~%()[\]@]+?\.(?:js|css|woff2)/g;
const PHOTO = /https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/[A-Za-z0-9_\-./%]+?\.(?:jpe?g|png|webp|gif|avif)/gi;
async function keepChunks(response) {
  try {
    const text = await response.text();
    const found = new Set();
    for (const match of text.matchAll(CHUNK)) {
      const path = match[0].startsWith("/_next/") ? match[0] : `/_next/${match[0]}`;
      found.add(new URL(path, self.location.origin).href);
      if (found.size >= 80) break;
    }
    if (found.size > 0) {
      const cache = await caches.open(STATIC_CACHE);
      for (const href of found) {
        if (await cache.match(href)) continue;
        const answer = await fetch(href).catch(() => null);
        if (answer && answer.ok && answer.status === 200) await cache.put(href, answer).catch(() => undefined);
      }
    }
    const photos = new Set();
    for (const match of text.matchAll(PHOTO)) {
      photos.add(match[0]);
      if (photos.size >= 40) break;
    }
    if (photos.size > 0) {
      const cache = await caches.open(MEDIA_CACHE);
      for (const href of photos) {
        if (await cache.match(href, { ignoreVary: true })) continue;
        const answer = await fetchPhoto(href);
        if (answer && answer.type === "cors") await cache.put(href, answer).catch(() => undefined);
      }
      await trim(cache, MEDIA_LIMIT).catch(() => undefined);
    }
  } catch {
    // Kept is kept; what could not be fetched is fetched when it is needed.
  }
}

/**
 * A photo from the school's storage, asked for so that it may be kept: an
 * <img> asks without CORS, and what comes back then cannot be kept or even
 * looked at; storage answers CORS requests for public files, so it is asked
 * that way, and the plain way only if that fails.
 */
async function fetchPhoto(href) {
  const shared = await fetch(href, { mode: "cors", credentials: "omit" }).catch(() => null);
  if (shared && shared.ok && shared.status === 200) return shared;
  return null;
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

/** A copy to keep, marked with when it was kept, so it is known how old it is (answerData). */
function stamped(response) {
  const headers = new Headers(response.headers);
  headers.set("x-kept-at", String(Date.now()));
  const build = buildOf(response);
  if (build) headers.set("x-kept-build", build);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * A page or its data, as the network gave it, kept with when and with the
 * version it is of — read from <html> when the headers did not come with it
 * (the app's own fetch of a page leaves them behind). Says which version.
 */
async function keepWithBuild(cache, key, response) {
  const text = await response.text();
  const named = HTML_BUILD.exec(text.slice(0, 4000));
  const build = buildOf(response) || realBuild(named ? named[1] : "");
  const headers = new Headers(response.headers);
  headers.set("x-kept-at", String(Date.now()));
  if (build) headers.set("x-kept-build", build);
  await cache.put(key, new Response(text, { status: response.status, statusText: response.statusText, headers }));
  return { text, build };
}

function keptAt(response) {
  return Number(response.headers.get("x-kept-at")) || 0;
}

/** A network answer kept (keepWithBuild); the page it was for, if one is opening with it, is of its version. */
function keep(event, cache, key, response, limit = PAGE_LIMIT, chunks = true, clientId = "") {
  if (!response || !response.ok || response.status !== 200 || response.type !== "basic" || response.redirected) return;
  const copy = response.clone();
  event.waitUntil(
    (async () => {
      const { text, build } = await keepWithBuild(cache, key, copy);
      if (build) {
        await rememberClient(clientId, build);
        await seeBuild(build);
      }
      await trim(cache, limit);
      if (chunks) await keepChunks(new Response(text));
    })().catch(() => undefined)
  );
}

/**
 * Pages outside the portal's frame — signing in, the front page, the public
 * ones — always come from the network when it answers: their forms must be
 * this version's. What was kept of them is only for when there is no line.
 */
const NETWORK_FIRST = /^\/($|login|register|two-factor|confirm-email|forgot|reset|verify|auth|app(\/|$)|terms|privacy|download|u\/|offline)/;

/**
 * A page of the portal opens from the device at once whenever it is there —
 * installed after signing in (keep-pages) or kept from an earlier visit —
 * and its fresh copy is kept behind it for the next time; what is on the
 * screen changes only when its person pulls it down (pull-to-refresh.tsx).
 * A copy of an older version of the site than the network last answered
 * with is asked of the network first, while there is a line (a newer version
 * cannot use the older one's data, nor the older one the newer's), and is
 * the answer only when the network is slow or not there. A page never kept
 * waits for the network, and with none gets the plain "no internet" page.
 *
 * Which version the page that opens is, is remembered, so its data is of the
 * same version (answerData).
 */
async function answerPage(event, request, url) {
  await loadMeta();
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKey(url, "page");
  const kept = await cache.match(key, { ignoreVary: true });
  const clientId = event.resultingClientId || "";
  const fresh = fetch(request).then(
    (response) => {
      keep(event, cache, key, response, PAGE_LIMIT, true, clientId);
      return response;
    },
    () => null
  );
  const keptBuild = kept ? buildOf(kept) : "";
  // A newer version of the site has come since this copy was kept, or this
  // person's details changed (me-changed): the copy is still a whole, usable
  // page. It is never made to wait on the network the way a page the device
  // has never held is — the old code asked the network first and waited some
  // five seconds before falling back, which on a bad line (where a phone's
  // app wrongly says it is online) showed the "still loading" note over every
  // page. navigator.onLine is not trusted here at all.
  const stale = Boolean(keptBuild && latestBuild && keptBuild !== latestBuild) || Boolean(kept && keptAt(kept) < meChangedAt);

  if (kept && !NETWORK_FIRST.test(url.pathname)) {
    if (!stale) {
      // Held and current: from the device at once, refreshed behind the screen.
      event.waitUntil(fresh);
      event.waitUntil(rememberClient(clientId, keptBuild));
      return kept;
    }
    // Held, but a newer version is out: the network gets a short moment to
    // bring it — on a quick line the newest page wins — and the instant it is
    // slow or gone, the copy on the device is answered. The newer version is
    // installed behind the screen (page-installer) and taken on the next open
    // or a pull.
    const answer = await Promise.race([fresh, wait(STALE_GRACE_MS).then(() => "slow")]);
    if (answer && answer !== "slow") {
      event.waitUntil(rememberClient(clientId, buildOf(answer)));
      return answer;
    }
    event.waitUntil(fresh);
    event.waitUntil(rememberClient(clientId, keptBuild));
    return kept;
  }

  // Never held, or a page that must be this version's (signing in, and the
  // other NETWORK_FIRST paths): the network, with the plain "no internet" page
  // when there is none and nothing kept to fall back on.
  const answer = await Promise.race([fresh, wait(PAGE_WAIT_MS).then(() => "slow")]);
  if (answer && answer !== "slow") {
    event.waitUntil(rememberClient(clientId, buildOf(answer)));
    return answer;
  }
  if (kept) {
    event.waitUntil(fresh);
    event.waitUntil(rememberClient(clientId, keptBuild));
    return kept;
  }
  const late = await fresh;
  if (late) return late;
  return offlinePage();
}

/** A page's own address, without Next.js's mark of the state its data was asked from. */
function pagePath(url) {
  const params = new URLSearchParams(url.search);
  params.delete("_rsc");
  const search = params.toString();
  return `${url.pathname}${search ? `?${search}` : ""}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Answered by another version of the site than the page that asked (src/proxy.ts names it). */
function otherBuild(response, build) {
  const served = response.headers.get("x-mtmu7-build");
  return Boolean(served && build && build !== "local" && served !== build);
}

/** One page fetched afresh and kept, with its scripts and styles, as installing it does (keep-pages). */
async function installPage(url) {
  try {
    const response = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
    const html = (response.headers.get("content-type") || "").includes("text/html");
    if (response.ok && response.status === 200 && !response.redirected && html) {
      const cache = await caches.open(PAGE_CACHE);
      const { text, build } = await keepWithBuild(cache, pageKey(url, "page"), response);
      await seeBuild(build);
      await keepChunks(new Response(text));
    }
  } catch {
    // Installed again on the next pull.
  }
}

/**
 * A page's data — what a tap inside the portal fetches — from the device
 * whenever it was kept, as the page itself is: the portal does not wait on
 * the network for anything it has already shown. Kept data is let go of
 * when its person pulls a page down (pull-to-refresh.tsx, answerFresh) and
 * when anything is saved (below), so what changed is fetched again then.
 *
 * Only data of the asking page's own version is given from the device: for
 * another, Next.js would throw the page away and open the next one whole
 * (a reload on every tap). That is asked of the network; with no line it is
 * refused, and Next.js opens the next page whole from the device instead.
 */
async function answerData(event, request, url) {
  await loadMeta();
  const cache = await caches.open(DATA_CACHE);
  const key = pageKey(url, "data");
  const kept = await cache.match(key, { ignoreVary: true });
  if (freshFor && freshFor.until > Date.now() && freshFor.path === pagePath(url)) {
    const build = freshFor.build;
    freshFor = null;
    return answerFresh(event, request, url, cache, key, kept, build);
  }
  const asking = clientBuilds.get(event.clientId) || "";
  const keptBuild = kept ? buildOf(kept) : "";
  // Data of the asking page's own version (or with no version marked) is
  // usable; another version's would make Next.js throw the page away.
  const usable = kept && !(asking && keptBuild && keptBuild !== asking);
  if (usable) {
    // From the device at once. A copy gone stale — more than a moment old, or
    // kept before this person's details changed (me-changed) — is fetched
    // again behind the screen, so the next time (with no line, say) it is the
    // newest the phone could have had. navigator.onLine is not trusted; a
    // fetch with no line simply fails and is let go of (renew).
    if (Date.now() - keptAt(kept) > DATA_FRESH_MS || keptAt(kept) < meChangedAt) event.waitUntil(renew(cache, key, request, kept));
    return kept;
  }
  // No usable copy (never asked, or a newer version is out): the network — but
  // never a wait without end on a bad line. It is capped; then Next.js, handed
  // a failed data request, opens the next page whole, which answerPage gives
  // from the device.
  const response = await Promise.race([fetch(request).catch(() => null), wait(DATA_WAIT_MS).then(() => null)]);
  if (response) {
    keep(event, cache, key, response, DATA_LIMIT);
    return response;
  }
  return Response.error();
}

/** Copies being fetched again (renew), and how many at once: the page in front's own requests come first. */
const renewing = new Set();
let renewRunning = 0;

/**
 * A page's kept data fetched again behind the screen and kept in its place —
 * never one from a newer version of the site than the copy it replaces, which
 * the page on the screen could not use (the version is taken whole, answerFresh).
 */
async function renew(cache, key, request, kept) {
  if (renewing.has(key)) return;
  renewing.add(key);
  try {
    while (renewRunning >= RENEW_AT_ONCE) await wait(300);
    renewRunning += 1;
    try {
      const response = await fetch(request);
      const was = kept.headers.get("x-mtmu7-build");
      const now = response.headers.get("x-mtmu7-build");
      if (response.ok && response.status === 200 && response.type === "basic" && !response.redirected && !(was && now && was !== now)) {
        await cache.put(key, stamped(response));
      }
    } finally {
      renewRunning -= 1;
    }
  } catch {
    // No line after all: kept as it was, and tried again next time.
  } finally {
    renewing.delete(key);
  }
}

/**
 * The page in front brought up to date by a pull (pull-to-refresh.tsx): from
 * the network, and kept, so that the next pull has it to fall back on. A slow
 * line is answered with the last copy, and the new one is kept when it comes;
 * no line at all is tried a few times, a little apart, then answered the same
 * way — the page stays as it is, never reloads — and the next pulls rest a
 * while.
 *
 * A newer version of the site cannot be laid over the one on the screen:
 * Next.js opens the page again for it. So the page is installed anew first,
 * and opens at once from the device in the new version; what was kept of the
 * old version's data goes (the rest of the pages are installed again behind
 * it, page-installer.tsx).
 */
async function answerFresh(event, request, url, cache, key, kept, build) {
  for (let tries = 0; tries < FRESH_TRIES; tries += 1) {
    if (tries > 0) await wait(1200 * tries);
    const fresh = fetch(request).catch(() => null);
    const answer = kept ? await Promise.race([fresh, wait(FRESH_WAIT_MS).then(() => "slow")]) : await fresh;
    if (answer === "slow") {
      event.waitUntil(
        fresh
          .then((late) => (late && late.ok && late.status === 200 && !late.redirected && !otherBuild(late, build) ? cache.put(key, late) : undefined))
          .catch(() => undefined)
      );
      return kept;
    }
    if (!answer) continue;
    if (otherBuild(answer, build) && movedFrom !== build) {
      movedFrom = build;
      await caches.delete(DATA_CACHE).catch(() => false);
      await installPage(new URL(pagePath(url), self.location.origin));
      return answer;
    }
    if (answer.status >= 500) {
      freshMisses += 1;
      freshMissedAt = Date.now();
      return kept || answer;
    }
    freshMisses = 0;
    keep(event, cache, key, answer, DATA_LIMIT, false);
    return answer;
  }
  freshMisses += 1;
  freshMissedAt = Date.now();
  return kept || Response.error();
}

/**
 * Something was saved (a form, a journal page): what the device kept of the
 * page it was saved on is let go of, and the page is installed again a
 * moment later, so the saved marks are what it shows next time — not the
 * ones from before. Every other page keeps what it had: whichever is opened
 * next shows it at once and fetches it again behind the screen when it has
 * grown old (answerData).
 */
async function afterChange(referrer) {
  let url;
  try {
    url = new URL(referrer);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || pageKind({ mode: "navigate", headers: new Headers() }, url) !== "page") return;
  try {
    const cache = await caches.open(DATA_CACHE);
    const path = pagePath(url);
    for (const key of await cache.keys()) if (pagePath(new URL(key.url)) === path) await cache.delete(key);
  } catch {
    // Brought up to date by the page's next refresh all the same.
  }
  await wait(AFTER_CHANGE_MS);
  await installPage(url);
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

async function answerMedia(event, request, url) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  // From the school's storage: asked with CORS, so the answer can be kept
  // (fetchPhoto); were it asked the <img>'s way, it would come back sealed
  // and be fetched again every time, and on a bad line not at all.
  const response = (url.origin !== self.location.origin ? await fetchPhoto(url.href) : null) || (await fetch(request));
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
  if (request.method !== "GET") {
    // Answered by the network as ever. A form saved on a page (a server
    // action posts to the page itself) brings what was kept up to date
    // behind it; the API's own posts — a sign of life, say — do
    // not, and nor does Next.js asking whether the line is back (HEAD).
    const target = new URL(request.url);
    if (request.method !== "HEAD" && target.origin === self.location.origin && !target.pathname.startsWith("/api/") && request.referrer) {
      event.waitUntil(afterChange(request.referrer));
    }
    return;
  }
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
    event.respondWith(answerMedia(event, request, url));
    return;
  }
  const kind = pageKind(request, url);
  if (kind === "page") event.respondWith(answerPage(event, request, url));
  else if (kind === "data") event.respondWith(answerData(event, request, url));
});

/**
 * Installs pages on the device ahead of any tap (page-installer.tsx): each
 * is fetched, kept as a page opened by a tap would be, and its scripts and
 * styles with it. Says how far it has got on the port it is given.
 */
async function keepPages(paths, port) {
  const cache = await caches.open(PAGE_CACHE);
  const queue = paths.filter((path) => typeof path === "string" && path.startsWith("/") && !path.startsWith("//"));
  const total = queue.length;
  let done = 0;
  let kept = 0;
  const tell = (message) => {
    try {
      if (port) port.postMessage(message);
    } catch {
      // The page that asked has gone; the pages are installed all the same.
    }
  };
  const worker = async () => {
    while (queue.length > 0) {
      const path = queue.shift();
      try {
        const url = new URL(path, self.location.origin);
        const response = await fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } });
        const html = (response.headers.get("content-type") || "").includes("text/html");
        if (response.ok && response.status === 200 && !response.redirected && html) {
          const { text, build } = await keepWithBuild(cache, pageKey(url, "page"), response);
          if (build && !latestBuild) latestBuild = build;
          await keepChunks(new Response(text));
          kept += 1;
        }
      } catch {
        // No line, or a page that would not come: the rest go on.
      }
      done += 1;
      tell({ type: "progress", done, total, kept });
    }
  };
  await Promise.all(Array.from({ length: Math.min(INSTALL_AT_ONCE, total) }, worker));
  await trim(cache, PAGE_LIMIT).catch(() => undefined);
  tell({ type: "done", done, total, kept });
  // And everything else of this version, for the dialogs and pickers no page names.
  await saveMeta();
  await keepBuildFiles(latestBuild);
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;
  // A page says which version of the site it is (native-app.tsx): its data is
  // given of the same version. And whatever of the newest version's files is
  // not on the device yet is fetched now (a start cut short, say).
  if (data.type === "hello" && event.source && typeof event.source.id === "string") {
    const id = event.source.id;
    event.waitUntil(
      (async () => {
        await loadMeta();
        await rememberClient(id, data.build);
        if (latestBuild && assetsDone !== latestBuild && self.navigator.onLine !== false) await keepBuildFiles(latestBuild);
      })()
    );
  }
  // Something about the person signed in changed (kept-pages.ts, meChanged):
  // the kept data goes, and each kept page is fetched again before it is shown.
  if (data.type === "me-changed") {
    event.waitUntil(
      (async () => {
        await loadMeta();
        meChangedAt = Date.now();
        await caches.delete(DATA_CACHE).catch(() => false);
        await saveMeta();
      })()
    );
  }
  // The page asks the worker to forget the kept pages (signing out).
  if (data.type === "forget-pages") {
    event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(DATA_CACHE), caches.delete(MEDIA_CACHE)]));
  }
  if (data.type === "keep-pages" && Array.isArray(data.paths)) {
    event.waitUntil(keepPages(data.paths, event.ports && event.ports[0]));
  }
  // The page in front is about to be refreshed by a pull (fresh.ts): its
  // next data comes from the network.
  if (data.type === "fresh-data" && typeof data.path === "string") {
    const rest = freshMisses === 0 ? 0 : Math.min(5 * 60_000, 15_000 * 2 ** (freshMisses - 1));
    const go = data.force === true || Date.now() - freshMissedAt >= rest;
    if (go) freshFor = { path: data.path, build: typeof data.build === "string" ? data.build : "", until: Date.now() + FRESH_HOLD_MS };
    try {
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ go });
    } catch {
      // The page has gone; nothing to tell.
    }
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
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications";

  event.waitUntil(
    (async () => {
      // Somebody already looking at this very page has just watched it
      // arrive; a notification on top of it would be noise.
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
  const data = event.notification.data || {};
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefer a tab already on the page, then any tab of the portal,
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
