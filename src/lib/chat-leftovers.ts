/**
 * What the portal's own messenger kept on a device, before it was retired:
 * kept conversations (one IndexedDB store per person), unsent messages,
 * drafts, read marks and list changes, the chosen text size and wallpaper.
 *
 * Nothing reads them any more; they are let go of when the portal starts and
 * when somebody signs out, so nobody's messages stay behind on a phone.
 */
const KEYS = [
  "chat-outbox-v1",
  "chat-reads-v1",
  "chat-marks-v1",
  "chat-list-ops-v1",
  "chat-cleared-v1",
  "chat-cutoffs-v1",
  "chat-wallpaper",
  "mtmu7:chat-text-size",
  "mtmu7:chat-stores",
];
const DRAFT_PREFIX = "chat-draft:";
const STORE_PREFIX = "mtmu7-chat-";

export async function forgetChat(): Promise<void> {
  const stores = new Set<string>();
  try {
    for (const name of JSON.parse(localStorage.getItem("mtmu7:chat-stores") ?? "[]") as string[]) stores.add(name);
  } catch {
    // Listed below where the browser can.
  }
  try {
    for (const key of KEYS) localStorage.removeItem(key);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing kept.
  }
  if (typeof indexedDB === "undefined") return;
  try {
    const listed = (await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.()) ?? [];
    for (const db of listed) if (db.name?.startsWith(STORE_PREFIX)) stores.add(db.name);
  } catch {
    // Only the remembered ones, then.
  }
  await Promise.all(
    [...stores].map(
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
