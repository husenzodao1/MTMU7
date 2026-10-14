/**
 * What the messenger tells the rest of the page on this device, before (or
 * without) the server: a conversation read here (thread.tsx), the unread
 * count the list now adds up to (conversation-list.tsx), and the messages on
 * their way (outbox.ts) — so the list and the bar's badge are right at once,
 * online or not.
 */

/** `detail`: { conversationId, at } — read on this device at `at`. */
export const READ_EVENT = "mtmu7:read";
/** `detail`: the number of unread messages, as the bar's badge counts them. */
export const UNREAD_TOTAL_EVENT = "mtmu7:unread-total";
/**
 * What is waiting to be sent changed (outbox.ts). `detail`: { sent } — the
 * row that has just reached the server — or nothing.
 */
export const OUTBOX_EVENT = "mtmu7:outbox";
