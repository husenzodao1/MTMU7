// Relative, with its ending, so the unit tests run it as it is (node --test).
import { PLATFORM_NAME, platformOf, type Platform } from "./platforms.ts";

/**
 * The accounts people put on their profile (00101): the service and the name
 * on it. The address is always made here from the two, never taken as typed,
 * so a profile can only ever link to the service it says.
 */
export const SOCIAL_PLATFORMS = ["instagram", "telegram", "snapchat", "tiktok", "youtube", "facebook", "x", "vk", "ok", "linkedin"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number] & Platform;

export interface SocialAccount {
  platform: SocialPlatform;
  handle: string;
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** What a name may be on each service (their own rules, a little loosened). */
const NAME: Record<SocialPlatform, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  telegram: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
  snapchat: /^[A-Za-z][A-Za-z0-9._-]{2,14}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  youtube: /^[A-Za-z0-9._-]{3,30}$/,
  facebook: /^[A-Za-z0-9.]{5,50}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  vk: /^[A-Za-z0-9_.]{2,32}$/,
  ok: /^[A-Za-z0-9._]{2,50}$/,
  linkedin: /^[A-Za-z0-9-]{3,64}$/,
};

/** A Telegram number: +992 and the rest, or any country's in full. */
const PHONE = /^\+\d{7,15}$/;

export type ReadAccount = { ok: true; handle: string } | { ok: false; error: "empty" | "invalid" | "otherService" };

/**
 * What was typed, read as a name on the service: "@name", "name", the page's
 * address copied from the app, or — for Telegram — a phone number.
 */
export function readAccount(platform: SocialPlatform, typed: string): ReadAccount {
  let value = typed.trim();
  if (!value) return { ok: false, error: "empty" };
  if (/^(https?:\/\/|www\.|t\.me\/)/i.test(value)) {
    const found = platformOf(/^https?:/i.test(value) ? value : `https://${value}`);
    if (!found) return { ok: false, error: "invalid" };
    if (found.platform !== platform) return { ok: false, error: "otherService" };
    if (!found.handle) return { ok: false, error: "invalid" };
    value = found.handle;
  }
  value = value.replace(/^@/, "");
  if (platform === "telegram") {
    const digits = value.replace(/[\s()-]/g, "");
    if (/^\+?\d{7,15}$/.test(digits)) {
      const phone = digits.startsWith("+") ? digits : digits.length === 9 ? `+992${digits}` : `+${digits}`;
      return PHONE.test(phone) ? { ok: true, handle: phone } : { ok: false, error: "invalid" };
    }
  }
  return NAME[platform].test(value) ? { ok: true, handle: value } : { ok: false, error: "invalid" };
}

/** The account's page on its service. */
export function accountUrl(account: SocialAccount): string {
  const h = encodeURIComponent(account.handle.replace(/^\+/, ""));
  switch (account.platform) {
    case "instagram":
      return `https://www.instagram.com/${h}/`;
    case "telegram":
      return PHONE.test(account.handle) ? `https://t.me/+${h}` : `https://t.me/${h}`;
    case "snapchat":
      return `https://www.snapchat.com/add/${h}`;
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "youtube":
      return `https://www.youtube.com/@${h}`;
    case "facebook":
      return `https://www.facebook.com/${h}`;
    case "x":
      return `https://x.com/${h}`;
    case "vk":
      return `https://vk.com/${h}`;
    case "ok":
      return /^\d+$/.test(account.handle) ? `https://ok.ru/profile/${h}` : `https://ok.ru/${h}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${h}`;
  }
}

/** How the account reads under the service's name: @name, or the number. */
export function accountLabel(account: SocialAccount): string {
  if (PHONE.test(account.handle)) return account.handle;
  return account.platform === "facebook" || account.platform === "vk" || account.platform === "ok" || account.platform === "linkedin"
    ? account.handle
    : `@${account.handle}`;
}

export function platformName(platform: SocialPlatform): string {
  return PLATFORM_NAME[platform];
}
