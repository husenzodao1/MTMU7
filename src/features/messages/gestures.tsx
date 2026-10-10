"use client";

import { CornerUpLeft } from "lucide-react";
import { useRef, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils/cn";

/** How far a bubble must travel before letting go means "reply". */
const REPLY_AT = 56;
const MAX_TRAVEL = 84;
const HOLD_MS = 420;

/**
 * The two gestures of a messenger, on one message:
 *
 * - swipe it towards the middle to reply to it, with the arrow appearing
 *   behind it as it goes and a tick of the phone when it is far enough;
 * - hold it (or right-click it) for the menu with the reactions.
 *
 * Vertical movement is left entirely to the browser (touch-action: pan-y), so
 * scrolling the conversation never catches on a bubble. The bubble is moved
 * through its style directly rather than through React state: sixty renders
 * a second of a whole thread for a finger's journey would be felt.
 */
export function MessageGestures({
  children,
  enabled,
  onReply,
  onHold,
  className,
}: {
  children: ReactNode;
  enabled: boolean;
  onReply: () => void;
  onHold: () => void;
  className?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const touch = useRef<{
    x: number;
    y: number;
    axis: "x" | "y" | null;
    travel: number;
    armed: boolean;
    held: boolean;
    timer: number | null;
  } | null>(null);
  const lastHold = useRef(0);

  const hold = () => {
    lastHold.current = Date.now();
    navigator.vibrate?.(8);
    onHold();
  };

  const place = (travel: number, settle: boolean) => {
    const element = body.current;
    if (!element) return;
    const rtl = getComputedStyle(element).direction === "rtl";
    element.style.transition = settle ? "transform 180ms cubic-bezier(.2,.8,.2,1)" : "none";
    element.style.transform = travel ? `translateX(${rtl ? -travel : travel}px)` : "";
    if (arrow.current) {
      const shown = Math.min(1, travel / REPLY_AT);
      arrow.current.style.transition = element.style.transition;
      arrow.current.style.opacity = String(shown);
      arrow.current.style.transform = `scale(${0.6 + shown * 0.4})`;
    }
  };

  const end = (event: TouchEvent) => {
    const state = touch.current;
    touch.current = null;
    if (!state) return;
    if (state.timer) window.clearTimeout(state.timer);
    if (state.held) {
      // The finger lifting after a hold is not also a tap on what it held.
      event.preventDefault();
      return;
    }
    if (state.axis === "x") {
      if (state.travel >= REPLY_AT) onReply();
      place(0, true);
    }
  };

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div
      className={cn("relative touch-pan-y", className)}
      onTouchStart={(event) => {
        const point = event.touches[0];
        if (!point || event.touches.length > 1) return;
        const state = { x: point.clientX, y: point.clientY, axis: null, travel: 0, armed: false, held: false, timer: null } as NonNullable<typeof touch.current>;
        state.timer = window.setTimeout(() => {
          if (touch.current === state && state.axis === null) {
            state.held = true;
            hold();
          }
        }, HOLD_MS);
        touch.current = state;
      }}
      onTouchMove={(event) => {
        const state = touch.current;
        const point = event.touches[0];
        if (!state || !point || state.held) return;
        const rtl = body.current ? getComputedStyle(body.current).direction === "rtl" : false;
        const dx = (point.clientX - state.x) * (rtl ? -1 : 1);
        const dy = point.clientY - state.y;
        if (state.axis === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (state.timer) window.clearTimeout(state.timer);
          state.timer = null;
          state.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        }
        if (state.axis !== "x") return;
        const pull = Math.max(0, dx);
        // Free to the threshold, then heavier, so it is felt where it counts.
        const travel = Math.min(MAX_TRAVEL, pull < REPLY_AT ? pull : REPLY_AT + (pull - REPLY_AT) * 0.35);
        if (!state.armed && travel >= REPLY_AT) {
          state.armed = true;
          navigator.vibrate?.(10);
        } else if (state.armed && travel < REPLY_AT) {
          state.armed = false;
        }
        state.travel = travel;
        place(travel, false);
      }}
      onTouchEnd={end}
      onTouchCancel={end}
      onContextMenu={(event) => {
        // A right-click on a computer, a long press on Android: the menu,
        // once, rather than the browser's own.
        if ((event.target as HTMLElement).closest("a, audio, video")) return;
        event.preventDefault();
        if (Date.now() - lastHold.current > 600) hold();
      }}
    >
      <span
        ref={arrow}
        aria-hidden
        className="chat-swipe-arrow pointer-events-none absolute start-1 top-1/2 -mt-4 inline-flex size-8 items-center justify-center rounded-full opacity-0"
      >
        <CornerUpLeft className="size-4" />
      </span>
      <div ref={body} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
