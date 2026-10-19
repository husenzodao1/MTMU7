"use client";

import type { ThreadMessage } from "@/features/messages/types";

/**
 * The messenger's own copy of what it has seen, on this device: every
 * message a conversation has shown or sent from here, the list as the server
 * last gave it, and the photos and files still waiting to be sent. In
 * IndexedDB, one database per person, so one account never reads another's,
 * and emptied when they sign out (app-shell.tsx).
 *
 * It is what a conversation opens from before the network has answered, and
 * what it falls back on with no line at all; the server's answers are laid
 * over it by message id, and nothing the server has confirmed is ever taken
 * away from it because an older answer did not have it (thread.tsx).
 *
 * Every call fails soft: with no IndexedDB (a private window, a full disk) the
 * messenger works as it would with nothing kept.
 */

const VERSION = 2;
/** Photos of conversations kept on the device, newest looked at first; older ones come from the server again. */
const KEEP_PHOTOS = 400;
const PREFIX = "mtmu7-chat-";
/** The databases made on this device, so signing out can empty every one of them. */
const NAMES_KEY = "mtmu7:chat-stores";
/** Kept per conversation, newest first; older ones come from the server when scrolled to. */
const KEEP_PER_CONVERSATION = 500;

/** A message as kept: what the server said, and its time as a number for ordering. */
type Kept = ThreadMessage & { t: number };

/**
 * The stretch of a conversation, by time, of which every message is kept —
 * nothing missing in between. What is kept outside it (a message sent from
 * the list's outbox while its thread was closed) is shown, but not trusted to
 * have nothing missing before it (thread.tsx).
 */
export type KeptRun = { from: number; to: number };
type RunRow = KeptRun & { key: string };
const runKey = (conversationId: string) => `run:${conversationId}`;

export interface KeptBlob {
  id: string;
  blob: Blob;
  mime: string;
  width?: number | null;
  height?: number | null;
  extension?: string;
}

const opened = new Map<string, Promise<IDBDatabase | null>>();

function remember(name: string) {
  try {
    const names = new Set<string>(JSON.parse(localStorage.getItem(NAMES_KEY) ?? "[]") as string[]);
    if (names.has(name)) return;
    names.add(name);
    localStorage.setItem(NAMES_KEY, JSON.stringify([...names]));
  } catch {
    // Forgotten by name prefix where the browser can list its databases.
  }
}

function open(userId: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined" || !userId) return Promise.resolve(null);
  const existing = opened.get(userId);
  if (existing) return existing;
  const name = `${PREFIX}${userId}`;
  const opening = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("messages")) {
        const messages = db.createObjectStore("messages", { keyPath: "id" });
        messages.createIndex("conversation", ["conversation_id", "t"]);
      }
      if (!db.objectStoreNames.contains("lists")) db.createObjectStore("lists", { keyPath: "key" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "path" }).createIndex("at", "at");
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading, or signing out deleting it: let go at once.
      db.onversionchange = () => {
        db.close();
        opened.delete(userId);
      };
      remember(name);
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  opened.set(userId, opening);
  void opening.then((db) => {
    if (!db) opened.delete(userId);
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

function asked<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

const time = (value: string) => {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
};

/** What is kept of a message: only what the server said. */
function kept(message: ThreadMessage): Kept {
  const { local_preview: _preview, pending: _pending, failed: _failed, ...rest } = message;
  void _preview;
  void _pending;
  void _failed;
  return { ...rest, t: time(message.created_at) };
}

function shown({ t: _t, ...message }: Kept): ThreadMessage {
  void _t;
  return message;
}

function range(conversationId: string) {
  return IDBKeyRange.bound([conversationId, -Infinity], [conversationId, Infinity]);
}

/**
 * Keeps messages the server has (never one still on its way: those live in
 * the outbox). A copy already kept is replaced only by one at least as new:
 * an older answer arriving late cannot undo an edit or a deletion.
 */
export async function keepMessages(userId: string, messages: ThreadMessage[]): Promise<void> {
  const rows = messages.filter((m) => !m.id.startsWith("local:") && !m.pending && !m.failed);
  if (rows.length === 0) return;
  const db = await open(userId);
  if (!db) return;
  try {
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    // Each read and its write within the one transaction, nothing awaited in
    // between (an await would let the transaction commit under it).
    for (const row of rows) {
      const request = store.get(row.id) as IDBRequest<Kept | undefined>;
      request.onsuccess = () => {
        const was = request.result;
        if (was && newerThan(was, row)) return;
        store.put(kept(row));
      };
    }
    await done(tx);
  } catch {
    return;
  }
  for (const conversationId of new Set(rows.map((r) => r.conversation_id))) void trim(db, conversationId);
}

/** The kept copy says more than the incoming one: deleted, or edited later. */
function newerThan(was: ThreadMessage, incoming: ThreadMessage): boolean {
  if (was.is_deleted && !incoming.is_deleted) return true;
  if (was.edited_at && (!incoming.edited_at || time(was.edited_at) > time(incoming.edited_at))) return true;
  return false;
}

/** The oldest go past the limit; the stretch kept whole starts no earlier than what is left. */
async function trim(db: IDBDatabase, conversationId: string) {
  try {
    const tx = db.transaction(["messages", "lists"], "readwrite");
    const index = tx.objectStore("messages").index("conversation");
    const lists = tx.objectStore("lists");
    const count = (await asked(index.count(range(conversationId)))) ?? 0;
    let extra = count - KEEP_PER_CONVERSATION;
    if (extra > 0) {
      const cursor = index.openCursor(range(conversationId));
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at) return;
        if (extra > 0) {
          at.delete();
          extra -= 1;
          at.continue();
          return;
        }
        const oldest = (at.value as Kept).t;
        const request = lists.get(runKey(conversationId)) as IDBRequest<RunRow | undefined>;
        request.onsuccess = () => {
          const run = request.result;
          if (run && run.from < oldest) lists.put({ ...run, from: Math.min(oldest, run.to) });
        };
      };
    }
    await done(tx);
  } catch {
    // Trimmed next time.
  }
}

/**
 * Keeps what a thread shows that has nothing missing in between — every
 * message the conversation had from `from` to `to` — and records the
 * stretch. Joined to the stretch already kept where the two meet; newer and
 * apart from it, it takes its place, and what was kept before it goes, so
 * the device never holds two stretches with a hole between them.
 */
export async function keepRun(userId: string, conversationId: string, messages: ThreadMessage[], from: number, to: number): Promise<void> {
  const rows = messages.filter((m) => !m.id.startsWith("local:") && !m.pending && !m.failed);
  const db = await open(userId);
  if (!db || !(from <= to)) return;
  try {
    const tx = db.transaction(["messages", "lists"], "readwrite");
    const store = tx.objectStore("messages");
    const lists = tx.objectStore("lists");
    const request = lists.get(runKey(conversationId)) as IDBRequest<RunRow | undefined>;
    // Everything in callbacks of the one transaction (an await would let it commit).
    request.onsuccess = () => {
      const run = request.result;
      if (run && to < run.from) return; // Older than, and apart from, what is kept: kept as it is.
      if (run && from > run.to) {
        // Newer, with a hole between: what was kept before it goes.
        const older = store.index("conversation").openCursor(IDBKeyRange.bound([conversationId, -Infinity], [conversationId, from], false, true));
        older.onsuccess = () => {
          const at = older.result;
          if (!at) return;
          at.delete();
          at.continue();
        };
      }
      const joined = run && from <= run.to ? { from: Math.min(from, run.from), to: Math.max(to, run.to) } : { from, to };
      lists.put({ key: runKey(conversationId), ...joined });
      for (const row of rows) {
        const was = store.get(row.id) as IDBRequest<Kept | undefined>;
        was.onsuccess = () => {
          if (was.result && newerThan(was.result, row)) return;
          store.put(kept(row));
        };
      }
    };
    await done(tx);
  } catch {
    return;
  }
  void trim(db, conversationId);
}

/**
 * The newest kept messages of a conversation, oldest first, with the stretch
 * kept whole. Messages older than that stretch are left out (a hole may lie
 * between); newer ones are given, to be checked against the server.
 */
export async function keptMessages(userId: string, conversationId: string, limit = 200): Promise<{ run: KeptRun | null; messages: ThreadMessage[] }> {
  const db = await open(userId);
  if (!db) return { run: null, messages: [] };
  try {
    const tx = db.transaction(["messages", "lists"], "readonly");
    let run: KeptRun | null = null;
    const found: ThreadMessage[] = [];
    await new Promise<void>((resolve) => {
      const request = tx.objectStore("lists").get(runKey(conversationId)) as IDBRequest<RunRow | undefined>;
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const row = request.result;
        run = row ? { from: row.from, to: row.to } : null;
        // In the same callback: nothing awaited while the transaction is open.
        const cursor = tx
          .objectStore("messages")
          .index("conversation")
          .openCursor(IDBKeyRange.bound([conversationId, row ? row.from : -Infinity], [conversationId, Infinity]), "prev");
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at || found.length >= limit) return resolve();
          found.push(shown(at.value as Kept));
          at.continue();
        };
        cursor.onerror = () => resolve();
      };
    });
    return { run, messages: found.reverse() };
  } catch {
    return { run: null, messages: [] };
  }
}

/** The newest kept message of each conversation asked about. */
export async function newestKept(userId: string, conversationIds: string[]): Promise<Record<string, ThreadMessage>> {
  const db = await open(userId);
  const newest: Record<string, ThreadMessage> = {};
  if (!db || conversationIds.length === 0) return newest;
  try {
    const tx = db.transaction("messages", "readonly");
    const index = tx.objectStore("messages").index("conversation");
    await Promise.all(
      conversationIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const cursor = index.openCursor(range(id), "prev");
            cursor.onsuccess = () => {
              if (cursor.result) newest[id] = shown(cursor.result.value as Kept);
              resolve();
            };
            cursor.onerror = () => resolve();
          })
      )
    );
  } catch {
    // Nothing kept to say.
  }
  return newest;
}

/** Deleted for this person: gone from what is kept too. */
export async function forgetMessages(userId: string, ids: string[]): Promise<void> {
  const db = await open(userId);
  if (!db || ids.length === 0) return;
  try {
    const tx = db.transaction("messages", "readwrite");
    for (const id of ids) tx.objectStore("messages").delete(id);
    await done(tx);
  } catch {
    // Gone from the server all the same; the next answer leaves it out.
  }
}

/** Every kept message of a conversation, up to a moment (a chat deleted for oneself). */
export async function forgetConversation(userId: string, conversationId: string, upTo = Infinity): Promise<void> {
  const db = await open(userId);
  if (!db) return;
  try {
    const tx = db.transaction(["messages", "lists"], "readwrite");
    const cursor = tx.objectStore("messages").index("conversation").openCursor(IDBKeyRange.bound([conversationId, -Infinity], [conversationId, upTo]));
    cursor.onsuccess = () => {
      const at = cursor.result;
      if (!at) return;
      at.delete();
      at.continue();
    };
    // The stretch kept whole now starts after it, or there is none.
    const lists = tx.objectStore("lists");
    const request = lists.get(runKey(conversationId)) as IDBRequest<RunRow | undefined>;
    request.onsuccess = () => {
      const run = request.result;
      if (!run) return;
      if (run.to <= upTo) lists.delete(runKey(conversationId));
      else if (run.from <= upTo) lists.put({ ...run, from: upTo });
    };
    await done(tx);
  } catch {
    // The server leaves them out all the same.
  }
}

/** The conversation list as the server last gave it, and when. */
export async function keepList(userId: string, rows: unknown[]): Promise<void> {
  const db = await open(userId);
  if (!db) return;
  try {
    const tx = db.transaction("lists", "readwrite");
    tx.objectStore("lists").put({ key: "conversations", at: Date.now(), rows });
    await done(tx);
  } catch {
    // Kept the next time it is fetched.
  }
}

export async function keptList<T>(userId: string): Promise<{ at: number; rows: T[] } | null> {
  const db = await open(userId);
  if (!db) return null;
  try {
    const value = await asked(db.transaction("lists", "readonly").objectStore("lists").get("conversations"));
    const row = value as { at: number; rows: T[] } | null | undefined;
    return row && Array.isArray(row.rows) ? row : null;
  } catch {
    return null;
  }
}

/**
 * What a conversation's screen is drawn from apart from its messages — its
 * title, members, pins, who may write (thread-props.ts) — so it opens from
 * the device at the tap, with or without a line.
 */
export async function keepThread(userId: string, conversationId: string, props: unknown): Promise<void> {
  const db = await open(userId);
  if (!db) return;
  try {
    const tx = db.transaction("lists", "readwrite");
    tx.objectStore("lists").put({ key: `thread:${conversationId}`, at: Date.now(), props });
    await done(tx);
  } catch {
    // Kept the next time the conversation is opened.
  }
}

/** Every conversation's screen kept on this device, by conversation id. */
export async function keptThreads<T>(userId: string): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  const db = await open(userId);
  if (!db) return found;
  try {
    const rows = await asked(db.transaction("lists", "readonly").objectStore("lists").getAll(IDBKeyRange.bound("thread:", "thread:￿")));
    for (const row of (rows ?? []) as Array<{ key: string; props?: T }>) {
      if (row.props) found.set(row.key.slice("thread:".length), row.props);
    }
  } catch {
    // Opened from the server, as before.
  }
  return found;
}

/** A photo, file or recording still to be sent, kept with its bytes so a restart cannot lose it. */
export async function keepBlob(userId: string, value: KeptBlob): Promise<boolean> {
  const db = await open(userId);
  if (!db) return false;
  try {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(value);
    return await done(tx);
  } catch {
    return false;
  }
}

export async function keptBlob(userId: string, id: string): Promise<KeptBlob | null> {
  const db = await open(userId);
  if (!db) return null;
  try {
    return ((await asked(db.transaction("blobs", "readonly").objectStore("blobs").get(id))) as KeptBlob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function dropBlob(userId: string, id: string): Promise<void> {
  const db = await open(userId);
  if (!db) return;
  try {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").delete(id);
    await done(tx);
  } catch {
    // Taken next time.
  }
}

/**
 * A photo of a conversation, kept by its storage path: the bytes sent from
 * here, or those downloaded once. A conversation then shows it at once, with
 * no line too, instead of asking for a link and the picture again each time.
 */
export async function keepPhoto(userId: string, path: string, blob: Blob): Promise<void> {
  const db = await open(userId);
  if (!db || !path) return;
  try {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    store.put({ path, blob, at: Date.now() });
    // The oldest go once there are more than the limit.
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - KEEP_PHOTOS;
      if (extra <= 0) return;
      const cursor = store.index("at").openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at || extra <= 0) return;
        at.delete();
        extra -= 1;
        at.continue();
      };
    };
    await done(tx);
  } catch {
    // Downloaded again next time.
  }
}

export async function keptPhoto(userId: string, path: string): Promise<Blob | null> {
  const db = await open(userId);
  if (!db || !path) return null;
  try {
    const row = (await asked(db.transaction("photos", "readonly").objectStore("photos").get(path))) as { blob?: Blob } | undefined | null;
    return row?.blob instanceof Blob ? row.blob : null;
  } catch {
    return null;
  }
}

/** Signing out: nothing of one person's conversations is left for the next to read. */
export async function forgetChatStores(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  for (const [, db] of opened) void db.then((d) => d?.close());
  opened.clear();
  const names = new Set<string>();
  try {
    for (const name of JSON.parse(localStorage.getItem(NAMES_KEY) ?? "[]") as string[]) names.add(name);
    localStorage.removeItem(NAMES_KEY);
  } catch {
    // Listed below where the browser can.
  }
  try {
    const listed = (await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.()) ?? [];
    for (const db of listed) if (db.name?.startsWith(PREFIX)) names.add(db.name);
  } catch {
    // Only the remembered ones, then.
  }
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve) => {
          try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          } catch {
            resolve();
          }
        })
    )
  );
}
