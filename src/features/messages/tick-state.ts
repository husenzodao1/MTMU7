/** The marks after one's own message (ticks.tsx), apart so the rule can be tested without React. */
export type TickState = "sending" | "sent" | "delivered" | "read";

/** Which mark a message of one's own has earned, by when the others last caught up. */
export function tickState(createdAt: string, deliveredAt: number | null, readAt: number | null): TickState {
  const at = new Date(createdAt).getTime();
  if (readAt !== null && readAt >= at) return "read";
  if (deliveredAt !== null && deliveredAt >= at) return "delivered";
  return "sent";
}
