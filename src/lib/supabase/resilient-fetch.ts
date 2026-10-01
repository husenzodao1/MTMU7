/**
 * The fetch every Supabase client in the portal goes through.
 *
 * On an ordinary day it does nothing but pass the request on. On the morning
 * the whole school opens the portal at once, two things go wrong that a person
 * should never see as an error page:
 *
 *   - A request that is never answered. Without a limit it holds the page
 *     until the platform kills the function; with one it fails in good time
 *     and the page can say so.
 *   - A gateway that answers 502, 503 or 504, or a connection reset, while the
 *     database is catching up. A read that asked once more a moment later
 *     would have succeeded.
 *
 * So: every request gets a time limit, and a read (GET or HEAD — nothing that
 * could write twice) that meets one of those answers is asked again, twice at
 * most, a little later each time and never all at the same instant.
 *
 * Pure apart from fetch and timers, so it can be tested with a fake fetch.
 */

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

export interface ResilienceOptions {
  /** How long one attempt may take before it is abandoned. */
  timeoutMs: number;
  /** The underlying fetch; the global one unless a test says otherwise. */
  fetchImpl?: typeof fetch;
  /** How long to wait before retry number `attempt` (1-based). */
  backoffMs?: (attempt: number) => number;
}

function defaultBackoff(attempt: number): number {
  // 250ms then 750ms, each with up to half again of jitter, so a thousand
  // browsers that failed together do not all come back together.
  const base = attempt === 1 ? 250 : 750;
  return base + Math.floor(Math.random() * base * 0.5);
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

/**
 * The caller's signal and our time limit as one. AbortSignal.any and
 * AbortSignal.timeout are recent (Safari 17.4 and 16), and a phone a few
 * years old must not lose the portal over them, so neither is relied on.
 */
function limitSignal(ms: number, caller: AbortSignal | null | undefined): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("The request took too long.", "TimeoutError")), ms);
  const onCallerAbort = () => controller.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener("abort", onCallerAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resilientFetch(options: ResilienceOptions): typeof fetch {
  const { timeoutMs } = options;
  const backoff = options.backoffMs ?? defaultBackoff;

  return async function fetchWithResilience(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const method = methodOf(input, init);
    const retriable = method === "GET" || method === "HEAD";

    for (let attempt = 0; ; attempt += 1) {
      const limit = limitSignal(timeoutMs, callerSignal);
      try {
        const response = await doFetch(input, { ...init, signal: limit.signal });
        if (retriable && attempt < MAX_RETRIES && RETRY_STATUSES.has(response.status)) {
          // Let go of the body we are not going to read before asking again.
          await response.body?.cancel().catch(() => undefined);
          limit.done();
          await sleep(backoff(attempt + 1));
          continue;
        }
        // Answered: the limit is for waiting on an answer, and the database
        // sends its answer whole.
        limit.done();
        return response;
      } catch (error) {
        limit.done();
        // The caller changed their mind: that is theirs to handle, as it was.
        if (callerSignal?.aborted) throw error;
        if (!retriable || attempt >= MAX_RETRIES) throw error;
        await sleep(backoff(attempt + 1));
      }
    }
  };
}
