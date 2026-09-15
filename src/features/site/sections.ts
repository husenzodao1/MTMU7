/**
 * Structured homepage sections (table site_sections). Each section stores
 * `content = { tg: {...}, ru: {...}, en: {...}, shared: {...} }`. Official
 * identity sections must be approved by an authorized person before they are
 * treated as final; nothing here provides default official wording.
 */

export type SectionKey =
  | "identity" | "hero" | "intro" | "principal_message" | "statistics" | "news" | "announcements"
  | "events" | "library" | "documents" | "links" | "contacts" | "footer";

export interface SectionField {
  name: string;
  kind: "text" | "textarea" | "lines";
  maxLength: number;
}

export interface SharedField {
  name: string;
  kind: "image" | "number" | "email" | "phone" | "url";
}

export interface SectionDefinition {
  localized: SectionField[];
  shared: SharedField[];
  /** Official content: shown with an "awaiting approval" notice until approved. */
  requiresApproval: boolean;
}

const title: SectionField = { name: "title", kind: "text", maxLength: 200 };
const body: SectionField = { name: "body", kind: "textarea", maxLength: 5000 };

export const SECTION_DEFINITIONS: Record<SectionKey, SectionDefinition> = {
  identity: { localized: [{ name: "name", kind: "text", maxLength: 300 }, { name: "authority", kind: "text", maxLength: 300 }], shared: [{ name: "logo_path", kind: "image" }], requiresApproval: true },
  hero: { localized: [title, { name: "body", kind: "textarea", maxLength: 1000 }], shared: [{ name: "image_path", kind: "image" }], requiresApproval: true },
  intro: { localized: [title, body], shared: [], requiresApproval: false },
  principal_message: { localized: [title, body, { name: "person", kind: "text", maxLength: 200 }, { name: "position", kind: "text", maxLength: 200 }], shared: [{ name: "image_path", kind: "image" }], requiresApproval: true },
  statistics: { localized: [title, { name: "items", kind: "lines", maxLength: 2000 }], shared: [], requiresApproval: false },
  news: { localized: [title], shared: [{ name: "limit", kind: "number" }], requiresApproval: false },
  announcements: { localized: [title], shared: [{ name: "limit", kind: "number" }], requiresApproval: false },
  events: { localized: [title], shared: [{ name: "limit", kind: "number" }], requiresApproval: false },
  library: { localized: [title], shared: [{ name: "limit", kind: "number" }], requiresApproval: false },
  documents: { localized: [title], shared: [{ name: "limit", kind: "number" }], requiresApproval: false },
  links: { localized: [title, { name: "items", kind: "lines", maxLength: 3000 }], shared: [], requiresApproval: false },
  contacts: {
    localized: [title, { name: "address", kind: "textarea", maxLength: 500 }, { name: "hours", kind: "text", maxLength: 300 }],
    shared: [{ name: "phone", kind: "phone" }, { name: "email", kind: "email" }, { name: "map_url", kind: "url" }],
    requiresApproval: true,
  },
  footer: { localized: [{ name: "body", kind: "textarea", maxLength: 1000 }], shared: [], requiresApproval: true },
};

export const SECTION_KEYS = Object.keys(SECTION_DEFINITIONS) as SectionKey[];

export function isSectionKey(value: string): value is SectionKey {
  return value in SECTION_DEFINITIONS;
}

export type SectionContent = Partial<Record<"tg" | "ru" | "en", Record<string, string>>> & { shared?: Record<string, string> };

export function readSectionContent(raw: unknown): SectionContent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const pickStrings = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>
      : undefined;
  return { tg: pickStrings(source.tg), ru: pickStrings(source.ru), en: pickStrings(source.en), shared: pickStrings(source.shared) };
}

/** "Label | value" lines → pairs (used by statistics and links). */
export function parseLines(text: string | undefined): Array<{ label: string; value: string }> {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
    .slice(0, 20)
    .map(([label, value]) => ({ label: label!, value: value! }));
}
