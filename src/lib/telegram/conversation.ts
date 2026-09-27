import "server-only";
import { TELEGRAM_CHANNEL } from "@/lib/env.server";
import { answerCallback, deleteMessage, editMessage, isChannelMember, sendMessage, sendPhoto, sendPhotoFile, TelegramError } from "@/lib/telegram/api";
import { renderReportCard } from "@/lib/telegram/report-card";
import * as db from "@/lib/telegram/db";
import {
  asLocale,
  askForChild,
  askForCode,
  backKeyboard,
  childMenu,
  firstGreeting,
  languageMenu,
  linked,
  menu,
  reportCaption,
  reportMessage,
  startLanguage,
  stillNotSubscribed,
  welcome,
  words,
  type InlineKeyboard,
  type Loc,
} from "@/lib/telegram/messages";

/**
 * One update, start to finish.
 *
 * Two rules hold everywhere below. Nothing is shown to a chat that is not
 * following the school's channel, except the card that asks them to; and
 * nothing about a child is fetched with anything but the chat id, so the
 * database refuses a chat that asks about a pupil it was never given — a
 * callback button carries a pupil's id, and a button can be forged.
 */

export interface Update {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; language_code?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; language_code?: string };
    message?: { chat: { id: number }; message_id: number };
  };
  my_chat_member?: {
    chat: { id: number };
    new_chat_member: { status: string };
  };
}

/** Telegram's own two-letter code, when it happens to be one of ours. */
function preferred(code?: string): string | undefined {
  if (!code) return undefined;
  const short = code.slice(0, 2).toLowerCase();
  return short === "ru" || short === "en" || short === "tg" ? short : undefined;
}

async function gate(chat: number, user: number, locale: Loc, schoolName?: string | null): Promise<boolean> {
  const member = await isChannelMember(TELEGRAM_CHANNEL, user);
  if (member === null) {
    // The bot is not an administrator of the channel, or Telegram is having a
    // bad minute. Either way a parent must not be locked out of their child's
    // marks by a problem that is ours: the gate opens and the school is told by
    // the log.
    console.warn("Telegram channel membership unreadable", { channel: TELEGRAM_CHANNEL });
    await db.setSubscribed(chat, true);
    return true;
  }
  await db.setSubscribed(chat, member);
  if (!member) {
    const card = stillNotSubscribed(locale, TELEGRAM_CHANNEL);
    await sendMessage(chat, card.text, { keyboard: card.keyboard });
    void schoolName;
    return false;
  }
  return true;
}

/** Where the site is, for the school's photograph. Set per update by the webhook. */
export interface Context {
  siteUrl?: string | null;
}

// Telegram hands back an id for every photo it has fetched once. Reusing it
// is instant and does not make Telegram download the picture again, which on
// a busy first morning is the difference between one fetch and a thousand.
let schoolPhotoId: string | null = null;

/**
 * The school's photograph with the first greeting under it — what a parent
 * sees the moment the subscription is confirmed. If the picture cannot be
 * sent, the greeting still goes, as text: a parent is never left without it.
 */
async function sendFirstGreeting(chat: number, locale: Loc, hasChildren: boolean, context: Context): Promise<void> {
  const caption = firstGreeting(locale, { hasChildren });
  const photo = schoolPhotoId ?? (context.siteUrl ? `${context.siteUrl}/images/school-photo.png` : null);
  if (photo) {
    try {
      const sent = await sendPhoto(chat, photo, caption);
      const largest = sent.photo?.reduce((a, b) => (b.width > a.width ? b : a));
      if (largest?.file_id) schoolPhotoId = largest.file_id;
      return;
    } catch (error) {
      if (error instanceof TelegramError && error.gone) throw error;
      // A stale file id, or a site Telegram could not reach: forget the id and
      // fall through to the words alone.
      schoolPhotoId = null;
      console.warn("Telegram school photo could not be sent", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  await sendMessage(chat, caption);
}

async function showMenu(chat: number, state: db.ChatState): Promise<void> {
  const card = menu(state.locale, state.children);
  await sendMessage(chat, card.text, { keyboard: card.keyboard });
}

async function handleText(chat: number, user: number, text: string, languageCode?: string): Promise<void> {
  const state = await db.touchChat(chat, preferred(languageCode));
  const locale = asLocale(state.locale);
  const w = words(locale);
  const trimmed = text.trim();

  // A /start from a shared link carries a payload ("/start abc"); it is the
  // same beginning. The language comes first, before anything is said in one.
  if (trimmed === "/start" || trimmed.startsWith("/start ")) {
    const card = startLanguage();
    await sendMessage(chat, card.text, { keyboard: card.keyboard });
    return;
  }

  if (!(await gate(chat, user, locale))) return;

  switch (trimmed) {
    case "/menu":
      await showMenu(chat, await db.touchChat(chat));
      return;
    case "/add":
      await db.setState(chat, "awaiting_child");
      await sendMessage(chat, askForChild(locale));
      return;
    case "/lang": {
      const card = languageMenu(locale);
      await sendMessage(chat, card.text, { keyboard: card.keyboard });
      return;
    }
    case "/help":
      await sendMessage(chat, `ℹ️ ${w.help}`);
      return;
  }

  if (trimmed.startsWith("/")) {
    await sendMessage(chat, `🤔 ${w.unknown}`);
    return;
  }

  if (state.state === "awaiting_code") {
    const result = await db.confirmChild(chat, trimmed);
    if (result.ok && result.child) {
      await sendMessage(chat, linked(locale, result.child));
      await showMenu(chat, await db.touchChat(chat));
      return;
    }
    if (result.reason === "blocked") {
      await sendMessage(chat, `⏳ ${w.blocked}`);
      return;
    }
    if (result.reason === "no_pending") {
      await db.setState(chat, "awaiting_child");
      await sendMessage(chat, askForChild(locale));
      return;
    }
    await sendMessage(chat, `❌ ${w.wrongCode}`);
    return;
  }

  // Anything else typed at an idle chat, and everything typed at one waiting
  // for a name, is treated as a name. A parent who types their child's nickname
  // without pressing a button first should simply be understood.
  const found = await db.findChild(chat, trimmed);
  if (!found.found) {
    await sendMessage(chat, found.ambiguous ? `⚠️ ${w.ambiguous}` : `🔍 ${w.notFound}`);
    return;
  }
  if (found.noCode) {
    await sendMessage(chat, `📄 ${w.noCode}`);
    return;
  }
  await sendMessage(chat, askForCode(locale));
}

/**
 * Puts a menu card where the tapped message was. A report now arrives as a
 * picture, and a picture's text cannot be edited into a menu: that message is
 * replaced by a new one instead.
 */
async function showCard(chat: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
  try {
    await editMessage(chat, messageId, text, keyboard);
  } catch (error) {
    if (!(error instanceof TelegramError) || error.code !== 400 || /not modified/i.test(error.message)) throw error;
    await sendMessage(chat, text, keyboard ? { keyboard } : {});
    await deleteMessage(chat, messageId).catch(() => undefined);
  }
}

async function handleCallback(
  id: string,
  chat: number,
  user: number,
  messageId: number,
  data: string,
  languageCode: string | undefined,
  context: Context
): Promise<void> {
  const state = await db.touchChat(chat, preferred(languageCode));
  let locale = asLocale(state.locale);
  const w = words(locale);

  // The language chosen after /start: the same card turns into the welcome,
  // in that language, with the channel to follow and the button to check.
  if (data.startsWith("sl:")) {
    locale = asLocale(data.slice(3));
    await db.setLocale(chat, locale);
    await answerCallback(id, words(locale).languageSet);
    const card = welcome(locale, TELEGRAM_CHANNEL);
    await showCard(chat, messageId, card.text, card.keyboard);
    return;
  }

  if (data === "check") {
    const ok = await gate(chat, user, locale);
    await answerCallback(id);
    if (ok) {
      const fresh = await db.touchChat(chat);
      await sendFirstGreeting(chat, locale, fresh.children.length > 0, context);
      if (fresh.children.length > 0) {
        await showMenu(chat, fresh);
      } else {
        await db.setState(chat, "awaiting_child");
      }
    }
    return;
  }

  if (!(await gate(chat, user, locale))) {
    await answerCallback(id);
    return;
  }

  if (data === "menu") {
    const card = menu(locale, state.children);
    await showCard(chat, messageId, card.text, card.keyboard);
    await answerCallback(id);
    return;
  }

  if (data === "add") {
    await db.setState(chat, "awaiting_child");
    await answerCallback(id);
    await sendMessage(chat, askForChild(locale));
    return;
  }

  if (data === "lang") {
    const card = languageMenu(locale);
    await showCard(chat, messageId, card.text, card.keyboard);
    await answerCallback(id);
    return;
  }

  if (data.startsWith("l:")) {
    locale = asLocale(data.slice(2));
    await db.setLocale(chat, locale);
    await answerCallback(id, words(locale).languageSet);
    const fresh = await db.touchChat(chat);
    const card = menu(locale, fresh.children);
    await showCard(chat, messageId, card.text, card.keyboard);
    return;
  }

  if (data.startsWith("c:")) {
    const childId = data.slice(2);
    const child = state.children.find((one) => one.id === childId);
    if (!child) {
      await answerCallback(id, w.noChildren);
      return;
    }
    const card = childMenu(locale, child, childId);
    await showCard(chat, messageId, card.text, card.keyboard);
    await answerCallback(id);
    return;
  }

  if (data.startsWith("r:")) {
    const [, childId, kind] = data.split(":");
    if (!childId || !kind) {
      await answerCallback(id);
      return;
    }
    try {
      const body = await db.report(chat, childId, kind);
      const shape = kind === "week" ? "week" : kind === "timetable" ? "timetable" : "day";
      // A picture, which reads on a phone as the table never did; the menu
      // it came from gives way to it. The words, if it cannot be drawn.
      const picture = await renderReportCard(locale, body, shape);
      if (picture) {
        await sendPhotoFile(chat, picture, reportCaption(locale, body, shape), { keyboard: backKeyboard(locale, childId) });
        await deleteMessage(chat, messageId).catch(() => undefined);
      } else {
        await showCard(chat, messageId, reportMessage(locale, body, shape), backKeyboard(locale, childId));
      }
      await answerCallback(id);
    } catch {
      // The only way here is a forged button: the database refused a pupil this
      // chat was never given.
      await answerCallback(id, w.unknown);
    }
    return;
  }

  await answerCallback(id);
}

/** Returns nothing: Telegram only needs a 200, and a retry would double-send. */
export async function handleUpdate(update: Update, context: Context = {}): Promise<void> {
  try {
    if (update.my_chat_member) {
      const status = update.my_chat_member.new_chat_member.status;
      if (status === "kicked" || status === "left") {
        await db.forgetChat(update.my_chat_member.chat.id);
      }
      return;
    }

    if (update.callback_query) {
      const q = update.callback_query;
      if (!q.message || !q.data) {
        await answerCallback(q.id);
        return;
      }
      await handleCallback(q.id, q.message.chat.id, q.from.id, q.message.message_id, q.data, q.from.language_code, context);
      return;
    }

    const message = update.message;
    if (!message?.text || message.chat.type !== "private") return;
    await handleText(message.chat.id, message.from?.id ?? message.chat.id, message.text, message.from?.language_code);
  } catch (error) {
    if (error instanceof TelegramError && error.gone) {
      const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      if (chat) await db.forgetChat(chat).catch(() => {});
      return;
    }
    // Never rethrow: Telegram retries a failed webhook, and a retry of a
    // half-finished conversation is worse than a dropped update.
    console.error("Telegram update failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}
