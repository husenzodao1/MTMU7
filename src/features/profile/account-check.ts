import "server-only";
import { accountUrl, type SocialAccount } from "@/lib/social/accounts";

/** What looking an account up on its service found. */
export type AccountCheck = "found" | "missing" | "unknown";

const LOOK_MS = 6000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  "Accept-Language": "en;q=0.9",
  Accept: "text/html",
};

/**
 * Whether the account is really there, asked of the service's public page
 * before it goes on a profile. Telegram, YouTube, TikTok and Snapchat say
 * plainly; Instagram mostly does; the rest (and Telegram by number) show
 * nothing to somebody not signed in, and are "unknown" — kept, but not
 * vouched for. Anything that does not answer in time is "unknown" too: a slow
 * service never stops anybody from saving their profile.
 */
export async function checkAccount(account: SocialAccount): Promise<AccountCheck> {
  if (account.platform === "telegram" && account.handle.startsWith("+")) return "unknown";
  if (!["telegram", "instagram", "youtube", "tiktok", "snapchat", "vk"].includes(account.platform)) return "unknown";
  let response: Response;
  try {
    response = await fetch(accountUrl(account), { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(LOOK_MS), cache: "no-store" });
  } catch {
    return "unknown";
  }
  if (response.status === 404 || response.status === 410) return "missing";
  if (!response.ok) return "unknown";
  const html = (await response.text().catch(() => "")).slice(0, 400_000);
  const name = account.handle.toLowerCase();
  switch (account.platform) {
    // t.me draws a title for a person, a group or a channel, and none for a name nobody holds.
    case "telegram":
      return /class="tgme_page_title"/.test(html) ? "found" : /tgme_page/.test(html) ? "missing" : "unknown";
    case "youtube":
      return "found";
    case "tiktok":
      if (html.toLowerCase().includes(`"uniqueid":"${name}"`)) return "found";
      return /"statusCode":\s*10221|user doesn't exist|couldn't find this account/i.test(html) ? "missing" : "unknown";
    case "snapchat":
      return html.toLowerCase().includes(name) ? "found" : "unknown";
    case "instagram":
      if (html.toLowerCase().includes(`"username":"${name}"`) || html.toLowerCase().includes(`(@${name})`)) return "found";
      return /page isn.t available|Sorry, this page/i.test(html) ? "missing" : "unknown";
    case "vk":
      return "unknown";
    default:
      return "unknown";
  }
}
