"use client";

import { READ_EVENT } from "@/features/messages/events";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * "Read up to here", for each conversation: told to the server as the
 * conversation's newest message actually on the screen (thread.tsx), never
 * as "everything until now" — a message that arrived a moment before the
 * mark, and was never seen, stays unread.
 *
 * A mark only ever moves forward, here and on the server
 * (mark_conversation_read, 00098), so a repeated or late one cannot undo a
 * newer one. Marks made with no line are kept on the device, per person, and
 * sent once there is one (flushReads, from the app's frame).
 */

const KEY = "chat-reads-v1";
/** One mark a second and a half per conversation: a busy group would otherwise write on every line. */
const COOLDOWN_MS = 1500;

type Waiting = Record<string, Record<string, string>>;

function read(): Waiting {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Waiting) : {};
  } catch {
    return {};
  }
}

function write(value: Waiting) {
  try {
    if (Object.keys(value).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Sent while the app is open all the same.
  }
}

const time = (value: string) => Date.parse(value) || 0;
/** The furthest mark made on this device, per conversation, so the list's count never comes back. */
const furthest = new Map<string, string>();
const cooling = new Map<string, number>();

/**
 * This person has seen the conversation up to `upTo` (a message's own time,
 * from the server). The list and the bar's count clear at once (READ_EVENT);
 * the server is told now, or once there is a line.
 */
export function markReadUpTo(userId: string, conversationId: string, upTo: string) {
  const was = furthest.get(conversationId);
  if (was && time(was) >= time(upTo)) return;
  furthest.set(conversationId, upTo);
  window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: { conversationId, at: upTo } }));
  const waiting = read();
  const mine = waiting[userId] ?? {};
  if (!mine[conversationId] || time(mine[conversationId]) < time(upTo)) {
    mine[conversationId] = upTo;
    waiting[userId] = mine;
    write(waiting);
  }
  if (cooling.has(conversationId)) return;
  cooling.set(
    conversationId,
    window.setTimeout(() => {
      cooling.delete(conversationId);
      void send(userId, conversationId);
    }, COOLDOWN_MS)
  );
  void send(userId, conversationId);
}

async function send(userId: string, conversationId: string): Promise<void> {
  const upTo = read()[userId]?.[conversationId];
  if (!upTo) return;
  const supabase = getBrowserClient();
  let { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId, p_up_to: upTo }).then(
    (answer) => answer,
    () => ({ error: { code: "", message: "network" } })
  );
  // A database from before 00098 knows only "read until now".
  if (error?.code === "PGRST202") ({ error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }));
  if (error && (!error.code || /^(08|53|57P|PGRST00)/.test(error.code))) return; // No line: kept, sent later.
  // Told (or refused for good, which no retry would change): no longer waiting —
  // unless a further mark was made meanwhile, which goes on its own.
  const waiting = read();
  const mine = waiting[userId];
  if (mine && mine[conversationId] && time(mine[conversationId]) <= time(upTo)) {
    delete mine[conversationId];
    if (Object.keys(mine).length === 0) delete waiting[userId];
    write(waiting);
  }
}

/** Marks made with no line, sent now (the app opening, the line coming back). */
export async function flushReads(userId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const mine = read()[userId] ?? {};
  await Promise.all(Object.keys(mine).map((conversationId) => send(userId, conversationId)));
}

/** Signing out: nothing of one person's is sent as the next. */
export function forgetReads() {
  furthest.clear();
  write({});
}
