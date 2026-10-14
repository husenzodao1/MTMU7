"use client";

import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Pinning, unpinning and deleting a chat (for oneself), from the list's long
 * press (conversation-list.tsx): done on this device at once, kept here, per
 * person, until the server has it — with no line, it goes once there is one.
 * A delete carries the moment it was made, so what was said after it, while
 * the phone had no line, is not deleted with it (clear_conversation_for_me, 00098).
 */

export type ListOp = { userId: string; conversationId: string; kind: "pin" | "unpin" | "clear"; at: string };

const KEY = "chat-list-ops-v1";
/** Chats deleted for oneself, per person: still listened to, so a new message brings one back at once. */
const CLEARED_KEY = "chat-cleared-v1";
/** Where each chat deleted for oneself starts again, per person: kept after the chat comes back (thread.tsx). */
const CUTOFFS_KEY = "chat-cutoffs-v1";
export const LIST_OPS_EVENT = "mtmu7:list-ops";

function read(): ListOp[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as ListOp[]) : [];
  } catch {
    return [];
  }
}

function write(ops: ListOp[]) {
  try {
    if (ops.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(ops.slice(-200)));
  } catch {
    // Done while the app is open all the same.
  }
  window.dispatchEvent(new Event(LIST_OPS_EVENT));
}

/** What this person has done to the list that the server may not have yet. */
export function pendingListOps(userId: string): ListOp[] {
  return read().filter((op) => op.userId === userId);
}

/** Done now on this device; sent at once, or once there is a line. A later choice replaces an earlier one. */
export function queueListOp(op: ListOp) {
  const others = read().filter((o) => !(o.userId === op.userId && o.conversationId === op.conversationId && (op.kind === "clear" || o.kind !== "clear")));
  write([...others, op]);
  void flushListOps(op.userId);
}

let flushing = false;

export async function flushListOps(userId: string): Promise<void> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  try {
    const supabase = getBrowserClient();
    for (const op of pendingListOps(userId)) {
      const { data, error } = await (op.kind === "clear"
        ? supabase.rpc("clear_conversation_for_me", { p_conversation_id: op.conversationId, p_up_to: op.at })
        : supabase.rpc("set_conversation_pinned", { p_conversation_id: op.conversationId, p_pinned: op.kind === "pin" })
      ).then(
        (answer) => answer,
        () => ({ data: null, error: { code: "", message: "network" } })
      );
      // No line: kept, and the rest after it wait their turn.
      if (error && (!error.code || /^(08|53|57P|PGRST00)/.test(error.code))) break;
      // The server's own moment, which a phone's wrong clock cannot move, replaces the device's.
      if (op.kind === "clear" && !error && typeof data === "string") setClearedUpTo(userId, op.conversationId, data);
      // Done — or refused for good, which no retry would change.
      write(read().filter((o) => o !== op && !(o.userId === op.userId && o.conversationId === op.conversationId && o.kind === op.kind && o.at === op.at)));
    }
  } finally {
    flushing = false;
  }
}

/** The chats this person deleted for themselves, and when (conversation-list.tsx listens for their new messages). */
export type Cleared = { id: string; at: string };

export function clearedChats(userId: string): Cleared[] {
  try {
    const value = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? "{}") as Record<string, Cleared[]>;
    return Array.isArray(value[userId]) ? value[userId]! : [];
  } catch {
    return [];
  }
}

export function setClearedChats(userId: string, chats: Cleared[]) {
  try {
    const value = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? "{}") as Record<string, Cleared[]>;
    if (chats.length === 0) delete value[userId];
    else value[userId] = chats.slice(-100);
    localStorage.setItem(CLEARED_KEY, JSON.stringify(value));
  } catch {
    // Brought back by the next list instead.
  }
}

/** Every chat this person deleted for themselves on this device, and up to when. */
export function clearedCutoffs(userId: string): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(CUTOFFS_KEY) ?? "{}") as Record<string, Record<string, string>>;
    return Object.fromEntries(Object.entries(value[userId] ?? {}).map(([id, at]) => [id, Date.parse(at) || 0]));
  } catch {
    return {};
  }
}

/** When this person last deleted a chat for themselves, as a time; 0 if never (here). */
export function clearedUpTo(userId: string, conversationId: string): number {
  try {
    const value = JSON.parse(localStorage.getItem(CUTOFFS_KEY) ?? "{}") as Record<string, Record<string, string>>;
    return Date.parse(value[userId]?.[conversationId] ?? "") || 0;
  } catch {
    return 0;
  }
}

export function setClearedUpTo(userId: string, conversationId: string, at: string) {
  try {
    const value = JSON.parse(localStorage.getItem(CUTOFFS_KEY) ?? "{}") as Record<string, Record<string, string>>;
    value[userId] = { ...value[userId], [conversationId]: at };
    localStorage.setItem(CUTOFFS_KEY, JSON.stringify(value));
  } catch {
    // The server's mark still hides it, once the thread hears it.
  }
  window.dispatchEvent(new Event(LIST_OPS_EVENT));
}

/** Signing out: nothing of one person's is sent as the next. */
export function forgetListOps() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CLEARED_KEY);
    localStorage.removeItem(CUTOFFS_KEY);
  } catch {
    // Nothing kept.
  }
}
