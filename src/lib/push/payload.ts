/**
 * What a push notification says, in the reader's language.
 *
 * A push is written by the server for somebody who is not looking at the
 * portal, so there is no request and no next-intl context to borrow a locale
 * from: the language is the one the page was in when this device said yes,
 * stored with the subscription. The few words a notification needs live here,
 * side by side, like the parents' bot keeps its own.
 *
 * Pure, so it can be tested without a push service or a database.
 */

export type PushLocale = "tg" | "ru" | "en";

const WORDS: Record<PushLocale, { support: string; location: string; photo: string; attachment: string; someone: string }> = {
  tg: { support: "Дастгирии онлайн", location: "📍 Ҷойгиршавӣ", photo: "📷 Сурат", attachment: "📎 Файл", someone: "Паёми нав" },
  ru: { support: "Онлайн-поддержка", location: "📍 Местоположение", photo: "📷 Фото", attachment: "📎 Файл", someone: "Новое сообщение" },
  en: { support: "Online support", location: "📍 Location", photo: "📷 Photo", attachment: "📎 File", someone: "New message" },
};

export function asPushLocale(value: unknown): PushLocale {
  return value === "ru" || value === "en" ? value : "tg";
}

export interface MessagePushSource {
  message_id: string;
  conversation_id: string;
  conversation_type: string;
  conversation_name: string | null;
  requester_id: string | null;
  sender_id: string | null;
  type: string;
  preview: string;
  sender: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap takes them. Always a path on this site. */
  url: string;
  /** Collapses a burst from one conversation into one notification. */
  tag: string;
}

/**
 * One notification for one reader.
 *
 * A direct message is titled by who sent it; a group by its name, with the
 * sender in the body; the support desk by "Online support" for the person who
 * asked, and by that person's name for the desk.
 */
export function messagePush(source: MessagePushSource, readerId: string, locale: PushLocale): PushPayload {
  const w = WORDS[locale];
  const sender = source.sender?.trim() || w.someone;
  const text =
    source.type === "location"
      ? w.location + (source.preview.trim() ? ` · ${source.preview.trim()}` : "")
      : source.type === "image"
        ? w.photo + (source.preview.trim() ? ` · ${source.preview.trim()}` : "")
        : source.type === "file" || source.type === "audio"
        ? w.attachment
        : source.preview.trim();
  const body = shorten(text || w.someone, 140);

  const isSupport = source.conversation_type === "support";
  const readerAsked = isSupport && source.requester_id === readerId;
  const url = readerAsked ? "/support/chat" : `/messages/${source.conversation_id}`;
  const tag = `conversation:${source.conversation_id}`;

  if (isSupport) {
    return readerAsked
      ? { title: w.support, body: `${sender}: ${body}`, url, tag }
      : { title: `🎧 ${source.conversation_name?.trim() || sender}`, body, url, tag };
  }
  if (source.conversation_type === "direct") {
    return { title: sender, body, url, tag };
  }
  return { title: source.conversation_name?.trim() || sender, body: `${sender}: ${body}`, url, tag };
}

function shorten(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
