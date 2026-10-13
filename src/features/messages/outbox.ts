"use client";

import { announceMessage } from "@/features/push/client";
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
 */

const KEY = "chat-outbox-v1";

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

/** Kept until sent: words and places only (a photo's bytes are not kept across a restart). */
export function keepOutgoing(row: OutgoingRow) {
  if (row.type !== "text" && row.type !== "location") return;
  write([...read().filter((r) => r.id !== row.id), { ...row, created_at: row.created_at ?? new Date().toISOString() }]);
}

/** Signing out: one person's unsent words are not sent as the next. */
export function forgetOutbox() {
  write([]);
}

export function dropOutgoing(id: string) {
  const rows = read();
  if (rows.some((r) => r.id === id)) write(rows.filter((r) => r.id !== id));
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
      const result = await sendRow(row);
      if ("again" in result) break;
      dropOutgoing(row.id);
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
