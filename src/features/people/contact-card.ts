import { isSocialPlatform, type SocialAccount } from "@/lib/social/accounts";
import type { ContactRequestStatus } from "@/features/people/contact-actions";

export interface ContactCard {
  rule: "open" | "ask" | "none";
  phone: string | null;
  request: ContactRequestStatus | null;
  accounts: SocialAccount[];
}

/** contact_card (00101) as the page uses it; a database without it reads as "nothing to show". */
export function readContactCard(raw: unknown): ContactCard {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rule = value.rule === "open" || value.rule === "ask" ? value.rule : "none";
  const request = value.request === "pending" || value.request === "approved" || value.request === "declined" ? value.request : null;
  const accounts = Array.isArray(value.accounts)
    ? value.accounts.flatMap((entry) => {
        const a = (entry ?? {}) as Record<string, unknown>;
        return isSocialPlatform(a.platform) && typeof a.handle === "string" ? [{ platform: a.platform, handle: a.handle }] : [];
      })
    : [];
  return { rule, phone: typeof value.phone === "string" ? value.phone : null, request, accounts };
}
