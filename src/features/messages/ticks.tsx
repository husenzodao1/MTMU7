/**
 * The marks after one's own message, as in the messenger everybody knows:
 *
 *   a small clock   still on its way from this phone
 *   one tick        the server has it
 *   two ticks       it has reached the other side — their phone or browser
 *   two blue ticks  it has been read
 *
 * Drawn here rather than taken from the icon set: the set's checks are bold
 * and square-ended, and two of them do not overlap the way these do — the
 * second tick tucked behind the first, so the pair reads as one mark.
 */

import type { TickState } from "@/features/messages/tick-state";

export { tickState, type TickState } from "@/features/messages/tick-state";

export function Ticks({ state, label, className }: { state: TickState; label: string; className?: string }) {
  if (state === "sending") {
    return (
      <svg viewBox="0 0 16 16" className={className ?? "chat-ticks"} role="img" aria-label={label} data-state={state}>
        <title>{label}</title>
        <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.9V8l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" className={className ?? "chat-ticks"} role="img" aria-label={label} data-state={state}>
      <title>{label}</title>
      <g fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        {state === "sent" ? (
          <path d="M3.4 6.3 6.4 9.3 13.1 2.6" />
        ) : (
          <>
            <path d="M1.2 6.3 4.2 9.3 10.9 2.6" />
            <path d="M7.6 8.6 8.3 9.3 15 2.6" />
          </>
        )}
      </g>
    </svg>
  );
}
