import "server-only";
import { cache } from "react";

/**
 * The clock reading for the current server request. Memoized per request so
 * every server component in one render agrees on "now" (for example when
 * deciding whether homework is overdue or which events are past).
 */
export const getRequestTime = cache((): number => Date.now());

/** ISO timestamp `milliseconds` before the request time. */
export function requestTimeMinus(milliseconds: number): string {
  return new Date(getRequestTime() - milliseconds).toISOString();
}
