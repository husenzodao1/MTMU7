/**
 * Which service an address belongs to, and whose page on it, so that a link
 * reads as what it is — the Telegram mark and «Telegram · @mtmu7» — rather
 * than as a line of letters. Used for the links in news and announcements
 * (components/ui/misc.tsx) and for the accounts people add to their profiles
 * (features/profile/social-accounts.tsx).
 */

export const PLATFORMS = [
  "telegram",
  "instagram",
  "whatsapp",
  "youtube",
  "tiktok",
  "facebook",
  "snapchat",
  "x",
  "vk",
  "ok",
  "linkedin",
  "docs",
  "drive",
  "maps",
  "meet",
  "zoom",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** The service's own name, the same in every language. */
export const PLATFORM_NAME: Record<Platform, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  snapchat: "Snapchat",
  x: "X",
  vk: "VK",
  ok: "Одноклассники",
  linkedin: "LinkedIn",
  docs: "Google Docs",
  drive: "Google Drive",
  maps: "Google Maps",
  meet: "Google Meet",
  zoom: "Zoom",
};

export interface LinkPlatform {
  platform: Platform;
  /** The account, channel or number the address points at, when it names one. */
  handle: string | null;
}

/** Paths on a service that are its own pages, not somebody's. */
const NOT_A_HANDLE = new Set([
  "share",
  "joinchat",
  "s",
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "watch",
  "shorts",
  "embed",
  "playlist",
  "results",
  "video",
  "photo",
  "groups",
  "events",
  "pages",
  "profile.php",
  "home",
  "i",
  "intent",
  "search",
  "hashtag",
  "feed",
  "in",
  "company",
  "add",
  "t",
]);

function firstSegment(path: string): string | null {
  const segment = path.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const clean = decodeURIComponent(segment).replace(/^@/, "");
  if (!clean || NOT_A_HANDLE.has(clean.toLowerCase())) return null;
  return /^[\p{L}\p{N}._+-]{2,64}$/u.test(clean) ? clean : null;
}

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|web\.)/, "");
}

/** The service an address belongs to, or null for any other site. */
export function platformOf(href: string): LinkPlatform | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const h = host(url);
  const path = url.pathname;
  const parts = path.split("/").filter(Boolean);
  const at = (handle: string | null) => (handle ? `@${handle}` : null);

  if (h === "t.me" || h === "telegram.me" || h === "telegram.dog") {
    // t.me/+992…, t.me/name, t.me/s/name (a channel's public page)
    const phone = /^\+?(\d{7,15})$/.exec(parts[0] ?? "");
    if (phone) return { platform: "telegram", handle: `+${phone[1]}` };
    return { platform: "telegram", handle: at(firstSegment(parts[0] === "s" ? parts.slice(1).join("/") : path)) };
  }
  if (h === "instagram.com" || h === "instagr.am") return { platform: "instagram", handle: at(firstSegment(path)) };
  if (h === "wa.me" || h === "api.whatsapp.com" || h === "whatsapp.com" || h === "chat.whatsapp.com") {
    const number = h === "wa.me" ? parts[0] : url.searchParams.get("phone");
    return { platform: "whatsapp", handle: number && /^\d{7,15}$/.test(number) ? `+${number}` : null };
  }
  if (h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com") {
    const handle = parts[0]?.startsWith("@") ? firstSegment(parts[0]) : parts[0] === "c" || parts[0] === "user" ? firstSegment(parts[1] ?? "") : null;
    return { platform: "youtube", handle: at(handle) };
  }
  if (h === "tiktok.com" || h === "vm.tiktok.com" || h === "vt.tiktok.com") {
    return { platform: "tiktok", handle: parts[0]?.startsWith("@") ? at(firstSegment(parts[0])) : null };
  }
  if (h === "facebook.com" || h === "fb.com" || h === "fb.me" || h === "fb.watch") return { platform: "facebook", handle: firstSegment(path) };
  if (h === "snapchat.com") {
    return { platform: "snapchat", handle: at(parts[0] === "add" ? firstSegment(parts[1] ?? "") : parts[0]?.startsWith("@") ? firstSegment(parts[0]) : null) };
  }
  if (h === "x.com" || h === "twitter.com") return { platform: "x", handle: at(firstSegment(path)) };
  if (h === "vk.com" || h === "vk.ru" || h === "vkontakte.ru") return { platform: "vk", handle: firstSegment(path) };
  if (h === "ok.ru") return { platform: "ok", handle: null };
  if (h === "linkedin.com") return { platform: "linkedin", handle: parts[0] === "in" || parts[0] === "company" ? firstSegment(parts[1] ?? "") : null };
  if (h === "docs.google.com") return { platform: "docs", handle: null };
  if (h === "drive.google.com") return { platform: "drive", handle: null };
  if (h === "maps.google.com" || h === "maps.app.goo.gl" || (h === "google.com" && parts[0] === "maps") || (h === "goo.gl" && parts[0] === "maps")) {
    return { platform: "maps", handle: null };
  }
  if (h === "meet.google.com") return { platform: "meet", handle: null };
  if (h === "zoom.us" || h.endsWith(".zoom.us")) return { platform: "zoom", handle: null };
  return null;
}

/** How an address with no service of its own reads: the site, and as much of the rest as fits. */
export function shortAddress(href: string, max = 48): string {
  try {
    const url = new URL(href);
    const text = `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  } catch {
    return href.length > max ? `${href.slice(0, max - 1)}…` : href;
  }
}
