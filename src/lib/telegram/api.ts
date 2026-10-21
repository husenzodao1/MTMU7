import "server-only";
import { serverEnv } from "@/lib/env.server";
import { type InlineKeyboard } from "@/lib/telegram/messages";

export { escapeHtml, type InlineButton, type InlineKeyboard } from "@/lib/telegram/messages";

/**
 * The thin part: everything this project needs from the Bot API and nothing
 * else.
 *
 * The token never appears in a log line, an error message or a returned value.
 * It goes into the URL Telegram requires and stays there; when a call fails,
 * what is reported is Telegram's own description, which never contains it.
 */

const API = "https://api.telegram.org";

export class TelegramError extends Error {
  readonly code: number;
  /** Set when Telegram says the chat is gone: blocked, deleted, or never was. */
  readonly gone: boolean;

  constructor(code: number, description: string) {
    super(description);
    this.name = "TelegramError";
    this.code = code;
    this.gone = code === 403 || (code === 400 && /chat not found/i.test(description));
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(serverEnv.TELEGRAM_BOT_TOKEN);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // A webhook has seconds, not minutes. A Telegram that is slow today must
    // not hold the outbox open.
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number }
    | null;

  if (!payload || !payload.ok) {
    throw new TelegramError(payload?.error_code ?? response.status, payload?.description ?? "telegram call failed");
  }
  return payload.result as T;
}

export function sendMessage(
  chatId: number,
  text: string,
  options: { keyboard?: InlineKeyboard; preview?: boolean } = {}
): Promise<{ message_id: number }> {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: options.preview !== true },
    ...(options.keyboard ? { reply_markup: { inline_keyboard: options.keyboard } } : {}),
  });
}

/**
 * A photograph with words under it. The photo is a URL Telegram fetches
 * itself, or a file_id it handed back from an earlier send — the second is
 * instant and costs nothing, so callers keep it.
 */
export function sendPhoto(
  chatId: number,
  photo: string,
  caption: string,
  options: { keyboard?: InlineKeyboard } = {}
): Promise<{ message_id: number; photo?: Array<{ file_id: string; width: number }> }> {
  return call("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    ...(options.keyboard ? { reply_markup: { inline_keyboard: options.keyboard } } : {}),
  });
}

/**
 * A picture the portal drew itself (the report card), uploaded with the
 * message rather than fetched by Telegram from a URL.
 */
export async function sendPhotoFile(
  chatId: number,
  png: Uint8Array,
  caption: string,
  options: { keyboard?: InlineKeyboard } = {}
): Promise<{ message_id: number }> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  if (options.keyboard) form.set("reply_markup", JSON.stringify({ inline_keyboard: options.keyboard }));
  form.set("photo", new Blob([png as BlobPart], { type: "image/png" }), "report.png");
  const response = await fetch(`${API}/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: { message_id: number }; description?: string; error_code?: number }
    | null;
  if (!payload || !payload.ok) {
    throw new TelegramError(payload?.error_code ?? response.status, payload?.description ?? "telegram call failed");
  }
  return payload.result as { message_id: number };
}

export function deleteMessage(chatId: number, messageId: number): Promise<unknown> {
  return call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard
): Promise<unknown> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/** Clears the spinner on a tapped button. Telegram shows one for ten seconds. */
export function answerCallback(id: string, text?: string): Promise<unknown> {
  return call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

/**
 * Whether somebody follows the school's channel.
 *
 * This needs the bot to be an administrator of that channel — Telegram will not
 * tell a stranger who its members are. If it is not, every answer is an error,
 * and an error here must not lock every parent out of the bot: the caller
 * treats "cannot tell" as "let them in" and the gate simply stops working until
 * the channel is fixed.
 */
export async function isChannelMember(channel: string, userId: number): Promise<boolean | null> {
  try {
    const member = await call<{ status: string }>("getChatMember", { chat_id: channel, user_id: userId });
    return ["creator", "administrator", "member", "restricted"].includes(member.status);
  } catch (error) {
    if (error instanceof TelegramError && error.code === 400 && /user not found/i.test(error.message)) {
      return false;
    }
    return null;
  }
}

export function setWebhook(url: string, secret: string): Promise<unknown> {
  return call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  });
}

export function getMe(): Promise<{ id: number; username: string }> {
  return call("getMe", {});
}

