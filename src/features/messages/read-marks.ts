"use client";

/**
 * How far the others in a conversation have read and received, as last heard
 * on this device, per person: a conversation opened from a page kept on the
 * phone shows the ticks it showed when it was last open, not the older ones
 * the kept page was made with, and the server's catch-up moves them on.
 */

const KEY = "chat-marks-v1";
/** Conversations remembered per person: the most recently opened. */
const KEEP = 60;

type Mark = { user_id: string; last_read_at: string | null; last_delivered_at: string | null };
type Kept = Record<string, Record<string, { at: number; marks: Mark[] }>>;

const time = (value: string | null | undefined) => (value ? Date.parse(value) || 0 : 0);

/** The later of two marks (either may be missing). */
export function laterMark(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}

function read(): Kept {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Kept) : {};
  } catch {
    return {};
  }
}

export function keptMarks(userId: string, conversationId: string): Mark[] {
  return read()[userId]?.[conversationId]?.marks ?? [];
}

export function rememberMarks(userId: string, conversationId: string, rows: Array<{ user_id: string; last_read_at?: string | null; last_delivered_at?: string | null }>) {
  if (rows.length === 0) return;
  try {
    const all = read();
    const mine = all[userId] ?? {};
    const byUser = new Map((mine[conversationId]?.marks ?? []).map((m) => [m.user_id, m]));
    for (const row of rows) {
      const was = byUser.get(row.user_id);
      byUser.set(row.user_id, {
        user_id: row.user_id,
        last_read_at: laterMark(was?.last_read_at, row.last_read_at),
        last_delivered_at: laterMark(was?.last_delivered_at, row.last_delivered_at),
      });
    }
    mine[conversationId] = { at: Date.now(), marks: [...byUser.values()] };
    const recent = Object.entries(mine)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, KEEP);
    all[userId] = Object.fromEntries(recent);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Heard again from the server next time.
  }
}

/** Signing out: nothing of one person's is left for the next. */
export function forgetMarks() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}
