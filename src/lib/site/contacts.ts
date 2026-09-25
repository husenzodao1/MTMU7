/**
 * Platform-level contact accounts, shown in the footer when the school itself
 * has not supplied its own. A school's `social_links` always wins, so once a
 * school fills these in on its own profile its accounts replace these.
 */
export interface SocialContacts {
  telegram?: string;
  instagram?: string;
  whatsapp?: string;
  x?: string;
}

const TELEGRAM_HANDLE = "istaravshan_schools";
const INSTAGRAM_HANDLE = "mtmu7.social";
const X_HANDLE = "edu_system_tj";
/** Digits only, in international form; wa.me rejects spaces and punctuation. */
const WHATSAPP_NUMBER = "992179021717";

export const PLATFORM_CONTACTS: Required<SocialContacts> = {
  telegram: `https://t.me/${TELEGRAM_HANDLE}`,
  instagram: `https://instagram.com/${INSTAGRAM_HANDLE}`,
  whatsapp: `https://wa.me/${WHATSAPP_NUMBER}`,
  x: `https://x.com/${X_HANDLE}`,
};

/** School links first, platform accounts as the fallback for anything missing. */
export function resolveContacts(schoolLinks: Record<string, string> | undefined): Required<SocialContacts> {
  return {
    telegram: schoolLinks?.telegram || PLATFORM_CONTACTS.telegram,
    instagram: schoolLinks?.instagram || PLATFORM_CONTACTS.instagram,
    whatsapp: schoolLinks?.whatsapp || PLATFORM_CONTACTS.whatsapp,
    x: schoolLinks?.x || PLATFORM_CONTACTS.x,
  };
}
