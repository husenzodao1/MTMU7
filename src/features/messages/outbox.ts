"use client";

import { announceMessage } from "@/features/push/client";
import { OUTBOX_EVENT } from "@/features/messages/events";
import { dropBlob, keepBlob, keepMessages, keptBlob } from "@/features/messages/local-store";
import { uploadMedia } from "@/features/messages/media";
import type { ThreadMessage } from "@/features/messages/types";
import { dbErrorKey } from "@/lib/actions/db-error-key";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Messages on their way, kept on the device until the server has them.
 *
 * Every message is written with an id made here (a UUID) and kept here before
 * anything is sent, so it is on the screen at once and survives leaving the
 * conversation, closing the app or losing the line. Sending it again after an
 * answer that never came cannot make two: the id is the row's primary key, so
 * the second write is told the row exists (23505), and that is "sent". With
 * no line, or a line too slow to answer, a message keeps its clock and goes
 * again — when the line is back, or after a growing pause — in the order it
 * was written, whether or not its conversation is open (flushOutbox, from the
 * app's frame). Photos, files and recordings are kept with their bytes
 * (local-store.ts), so they too survive a restart.
 *
 * A message the server refuses for good (no longer a member, a blocked
 * contact) is not thrown away: it stays, marked failed, with its words, until
 * its person sends it again or deletes it.
 *
 * Only the signed-in person's own messages are ever sent: what another
 * account left on the device waits for that account.
 *
 * The list of conversations shows each one's waiting message, clock and all
 * (conversation-list.tsx): it is told of every change (OUTBOX_EVENT).
 */

/** Where the waiting messages are kept on the device; another tab hears of a change to it. */
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
  /** Refused by the server for good: kept, not sent again by itself. */
  failed?: boolean;
  /** The photo, file or recording's bytes are kept on the device (local-store.ts). */
  bytes_kept?: boolean;
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

/** Everything on its way from this page, kept or not, by id. */
const onTheWay = new Map<string, OutgoingRow>();
/** Being written to the server right now, from this page: not written twice at once. */
const sending = new Set<string>();

function tell(sent?: OutgoingRow) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: sent ? { sent } : {} }));
}

const hasBytes = (row: OutgoingRow) => row.type !== "text" && row.type !== "location";

/**
 * Kept before anything is sent. A photo, file or recording is kept with its
 * bytes; if the device cannot keep them, the message still goes while the app
 * is open, as before.
 */
export function keepOutgoing(row: OutgoingRow, bytes?: { blob: Blob; mime: string; width?: number | null; height?: number | null }) {
  const stamped: OutgoingRow = { ...row, created_at: row.created_at ?? new Date().toISOString(), failed: false };
  onTheWay.set(row.id, stamped);
  if (!hasBytes(row)) {
    write([...read().filter((r) => r.id !== row.id), stamped]);
  } else if (bytes) {
    void keepBlob(row.sender_id, { id: row.id, blob: bytes.blob, mime: bytes.mime, width: bytes.width, height: bytes.height }).then((kept) => {
      if (!kept || !onTheWay.has(row.id)) return;
      const withBytes = { ...stamped, bytes_kept: true };
      onTheWay.set(row.id, withBytes);
      write([...read().filter((r) => r.id !== row.id), withBytes]);
    });
  }
  tell();
}

/** Signing out: one person's unsent messages are not sent as the next. */
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
  if (row && hasBytes(row)) void dropBlob(row.sender_id, id);
  if (row) tell(sent ? row : undefined);
}

/** Refused for good: kept with its words, marked, and not sent again until asked. */
export function failOutgoing(id: string) {
  const row = onTheWay.get(id) ?? read().find((r) => r.id === id);
  if (!row) return;
  const failed = { ...row, failed: true };
  onTheWay.set(id, failed);
  if (!hasBytes(row) || row.bytes_kept) write([...read().filter((r) => r.id !== id), failed]);
  tell();
}

/** Every message still on its way from this device (or refused), whatever its conversation. */
export function waitingRows(): OutgoingRow[] {
  const rows = new Map(read().map((r) => [r.id, r]));
  for (const [id, row] of onTheWay) rows.set(id, row);
  return [...rows.values()];
}

/** What this person has waiting (or refused) for a conversation, oldest first. */
export function outgoingFor(conversationId: string, senderId: string): OutgoingRow[] {
  return waitingRows()
    .filter((r) => r.conversation_id === conversationId && r.sender_id === senderId)
    .sort((a, b) => (Date.parse(a.created_at ?? "") || 0) - (Date.parse(b.created_at ?? "") || 0));
}

/** The kept bytes of a photo, file or recording on its way. */
export function outgoingBytes(row: OutgoingRow) {
  return row.bytes_kept ? keptBlob(row.sender_id, row.id) : Promise.resolve(null);
}

/** No answer from the database at all, or one that says try again: the line, not the message. */
function transient(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (!error.code) return true;
  return /^(08|53|57P|57014|PGRST00)/.test(error.code);
}

export type SendResult = { sent: true; createdAt: string | null } | { again: true } | { failed: string };

/** One try at writing the row: the server's own time comes back with it, for the order of the thread. */
export async function sendRow(row: OutgoingRow): Promise<SendResult> {
  const { created_at: _createdAt, failed: _failed, bytes_kept: _bytes, ...fields } = row;
  void _createdAt;
  void _failed;
  void _bytes;
  try {
    const { data, error } = await getBrowserClient()
      .from("messages")
      .insert(fields)
      .select("id, created_at")
      // A request that never answers would hold every later message behind it.
      .abortSignal(AbortSignal.timeout(25_000))
      .single();
    if (!error) return { sent: true, createdAt: (data as { created_at?: string } | null)?.created_at ?? null };
    // Already there: an earlier try did land, its answer did not.
    if (error.code === "23505") return { sent: true, createdAt: null };
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

/** A message as the thread shows it, from what was sent: kept on the device once the server has it. */
export function sentMessage(row: OutgoingRow, createdAt: string | null): ThreadMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_first_name: null,
    sender_last_name: null,
    sender_avatar_url: null,
    content: row.content,
    type: row.type,
    reply_to_id: row.reply_to_id,
    is_pinned: false,
    is_edited: false,
    is_deleted: false,
    is_favorite: false,
    created_at: createdAt ?? row.created_at ?? new Date().toISOString(),
    edited_at: null,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    media_path: row.media_path ?? null,
    media_width: row.media_width ?? null,
    media_height: row.media_height ?? null,
    media_name: row.media_name ?? null,
    media_size: row.media_size ?? null,
    media_mime: row.media_mime ?? null,
    media_duration: row.media_duration ?? null,
    reactions: [],
  };
}

/**
 * Writes one waiting row: its bytes first, if it has any, then the message.
 * Used by the thread for what it sends, and by flushOutbox for the rest.
 */
export async function sendWaiting(row: OutgoingRow, bytes?: { blob: Blob; mime: string } | null): Promise<SendResult> {
  if (hasBytes(row) && row.media_path) {
    const kept = bytes ?? (await outgoingBytes(row));
    if (!kept) return { failed: "portal.messages.fileFailed" };
    if (!(await uploadMedia(row.media_path, kept.blob, kept.mime))) return { again: true };
  }
  return sendRow(row);
}

/** After the server has a message: kept on the device as sent, and no longer waiting. */
export function settled(row: OutgoingRow, createdAt: string | null) {
  void keepMessages(row.sender_id, [sentMessage(row, createdAt)]);
  dropOutgoing(row.id, true);
  announceMessage(row.id);
}

/** Sending right now, from this page (thread.tsx marks its own): not sent twice at once. */
export function claimSending(id: string): boolean {
  if (sending.has(id)) return false;
  sending.add(id);
  return true;
}

export function releaseSending(id: string) {
  sending.delete(id);
}

let flushing = false;

/**
 * Sends whatever this person has waiting, oldest first, and stops at the
 * first that cannot go yet (to keep the order); called as the app opens and
 * when the line comes back. Another account's messages are left alone.
 */
export async function flushOutbox(userId: string): Promise<string[]> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine || !userId) return [];
  flushing = true;
  const sent: string[] = [];
  // Conversations with a message already going from elsewhere on this page:
  // the ones after it wait behind it, or they would land before it.
  const behind = new Set<string>();
  try {
    const rows = read().sort((a, b) => (Date.parse(a.created_at ?? "") || 0) - (Date.parse(b.created_at ?? "") || 0));
    for (const row of rows) {
      if (row.sender_id !== userId || row.failed || behind.has(row.conversation_id)) continue;
      // Already going, from its conversation on this page (thread.tsx), which sends the rest in turn.
      if (!claimSending(row.id)) {
        behind.add(row.conversation_id);
        continue;
      }
      try {
        const result = await sendWaiting(row);
        if ("again" in result) break;
        if ("failed" in result) {
          failOutgoing(row.id);
          continue;
        }
        settled(row, result.createdAt);
        sent.push(row.id);
      } finally {
        releaseSending(row.id);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
