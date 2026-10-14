"use client";

import { announceMessage } from "@/features/push/client";
import { OUTBOX_EVENT } from "@/features/messages/events";
import { dbErrorKey } from "@/lib/actions/db-error-key";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Messages on their way, kept on the device until the server has them.
 *
 * Every message is written with an id made here (a UUID), so sending it again
 * after an answer that never came cannot make two: the second write is told
 * the row exists (23505), and that is "sent". With no line, or a line too slow
 * to answer, a message keeps its clock and goes again — when the line is back,
 * or after a growing pause — in the order it was written. Words and places are
 * kept across a restart of the app and go out by themselves once there is a
 * line (flushOutbox, from the app's frame), whether or not their conversation
 * is open; photos, files and recordings go while the app is open.
 *
 * The list of conversations shows each one's waiting message, clock and all
 * (conversation-list.tsx): it is told of every change (OUTBOX_EVENT).
 */

/** Where the waiting words are kept on the device; another tab hears of a change to it. */
export const OUTBOX_KEY = "chat-outbox-v1";
const KEY = OUTBOX_KEY;

export interface OutgoingRow {
  id: string;
  conversation_id: string;
  school_id: string;
  sender_id: string;
  content: string;
  type: string;
  reply_to_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  media_path?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
  media_duration?: number | null;
  created_at?: string;
}

function read(): OutgoingRow[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as OutgoingRow[]) : [];
  } catch {
    return [];
  }
}

function write(rows: OutgoingRow[]) {
  try {
    if (rows.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(rows.slice(-200)));
  } catch {
    // Storage full or off: the message still goes while the app is open.
  }
}

/**
 * Everything on its way from this page, photos, files and recordings too —
 * which are not kept across a restart, so the list shows their clocks only
 * while the app stays open.
 */
const onTheWay = new Map<string, OutgoingRow>();

function tell(sent?: OutgoingRow) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: sent ? { sent } : {} }));
}

/** Kept until sent: words and places only (a photo's bytes are not kept across a restart). */
export function keepOutgoing(row: OutgoingRow) {
  const stamped = { ...row, created_at: row.created_at ?? new Date().toISOString() };
  onTheWay.set(row.id, stamped);
  if (row.type === "text" || row.type === "location") write([...read().filter((r) => r.id !== row.id), stamped]);
  tell();
}

/** Signing out: one person's unsent words are not sent as the next. */
export function forgetOutbox() {
  onTheWay.clear();
  write([]);
  tell();
}

/** No longer waiting: `sent` when the server has it, which the list shows at once, ticked. */
export function dropOutgoing(id: string, sent = false) {
  const rows = read();
  const row = onTheWay.get(id) ?? rows.find((r) => r.id === id);
  onTheWay.delete(id);
  if (rows.some((r) => r.id === id)) write(rows.filter((r) => r.id !== id));
  if (row) tell(sent ? row : undefined);
}

/** Every message still on its way from this device, whatever its conversation. */
export function waitingRows(): OutgoingRow[] {
  const rows = new Map(read().map((r) => [r.id, r]));
  for (const [id, row] of onTheWay) rows.set(id, row);
  return [...rows.values()];
}

/** What this person has waiting for a conversation, oldest first. */
export function outgoingFor(conversationId: string, senderId: string): OutgoingRow[] {
  return read().filter((r) => r.conversation_id === conversationId && r.sender_id === senderId);
}

/** No answer from the database at all, or one that says try again: the line, not the message. */
function transient(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (!error.code) return true;
  return /^(08|53|57P|57014|PGRST00)/.test(error.code);
}

export type SendResult = { sent: true } | { again: true } | { failed: string };

/** One try at writing the row. */
export async function sendRow(row: OutgoingRow): Promise<SendResult> {
  const { created_at: _createdAt, ...fields } = row;
  void _createdAt;
  try {
    const { error } = await getBrowserClient()
      .from("messages")
      .insert(fields)
      .select("id")
      // A request that never answers would hold every later message behind it.
      .abortSignal(AbortSignal.timeout(25_000))
      .single();
    if (!error || error.code === "23505") return { sent: true };
    if (transient(error)) return { again: true };
    return { failed: dbErrorKey(error) ?? "errors.unexpected" };
  } catch {
    return { again: true };
  }
}

/** Waits `ms`, or until the line comes back, whichever is first. */
export function waitForLine(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    window.addEventListener("online", done, { once: true });
  });
}

let flushing = false;

/**
 * Sends whatever is waiting, oldest first, and stops at the first that cannot
 * go yet (to keep the order); called as the app opens and when the line
 * comes back.
 */
export async function flushOutbox(): Promise<string[]> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return [];
  flushing = true;
  const sent: string[] = [];
  try {
    for (const row of read()) {
      // Already going, from its conversation on this page (thread.tsx): not sent twice.
      if (onTheWay.has(row.id)) continue;
      const result = await sendRow(row);
      if ("again" in result) break;
      dropOutgoing(row.id, "sent" in result);
      if ("sent" in result) {
        sent.push(row.id);
        announceMessage(row.id);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
