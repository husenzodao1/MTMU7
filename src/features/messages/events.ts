/**
 * What the messenger tells the rest of the page on this device, before (or
 * without) the server: a conversation read here (thread.tsx), and the unread
 * count the list now adds up to (conversation-list.tsx) — so the list and the
 * bar's badge are right at once, online or not.
 */

/** `detail`: { conversationId, at } — read on this device at `at`. */
export const READ_EVENT = "mtmu7:read";
/** `detail`: the number of unread messages, as the bar's badge counts them. */
export const UNREAD_TOTAL_EVENT = "mtmu7:unread-total";
