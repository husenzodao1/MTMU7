"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A row that drifts on its own and is moved by hand.
 *
 * Its content is drawn twice side by side and shifted by up to one copy's
 * width, so the loop never shows a seam. A finger (or the mouse) on it holds
 * it still; dragging moves it with the finger, and a quick flick throws it on
 * a little before it settles back into its own pace. A tap that did not drag
 * is an ordinary click on whatever is under it — a card opens, a face goes to
 * the profile — even while the row is moving. Off screen, in a hidden tab or
 * with reduced motion it does not drift; it can still be dragged.
 *
 * `data-swipe="own"` keeps the portal's swipe-for-menu off it.
 */
export function DriftRow({
  children,
  direction,
  speed = 18,
  className,
  trackClassName,
}: {
  children: ReactNode;
  /** Which way it drifts on its own. */
  direction: "left" | "right";
  /** Pixels a second. */
  speed?: number;
  className?: string;
  trackClassName?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = row.current;
    const strip = track.current;
    if (!box || !strip) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sign = direction === "left" ? -1 : 1;

    let width = strip.scrollWidth / 2;
    let x = direction === "left" ? 0 : -width;
    let velocity = 0; // extra pixels a second from a flick, decaying
    let held = false;
    let dragged = false;
    let visible = true;
    let startX = 0;
    let lastX = 0;
    let lastAt = 0;
    let frame = 0;
    let before = performance.now();

    const wrap = () => {
      if (width <= 0) return;
      while (x <= -width) x += width;
      while (x > 0) x -= width;
    };
    const paint = () => {
      strip.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - before) / 1000);
      before = now;
      if (!held) {
        x += (still ? 0 : sign * speed) * dt + velocity * dt;
        velocity *= Math.pow(0.04, dt); // a flick dies away in about a second
        if (Math.abs(velocity) < 2) velocity = 0;
        wrap();
        paint();
      }
      frame = visible && (!still || velocity !== 0) ? requestAnimationFrame(tick) : 0;
    };
    const run = () => {
      if (!frame) {
        before = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      held = true;
      dragged = false;
      velocity = 0;
      startX = lastX = event.clientX;
      lastAt = performance.now();
    };
    const move = (event: PointerEvent) => {
      if (!held) return;
      const dx = event.clientX - lastX;
      if (!dragged && Math.abs(event.clientX - startX) > 6) {
        dragged = true;
        box.setPointerCapture?.(event.pointerId);
      }
      if (!dragged) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastAt) / 1000;
      velocity = velocity * 0.6 + (dx / dt) * 0.4;
      lastX = event.clientX;
      lastAt = now;
      x += dx;
      wrap();
      paint();
    };
    const up = () => {
      if (!held) return;
      held = false;
      // A finger that stopped before lifting throws nothing.
      if (performance.now() - lastAt > 120) velocity = 0;
      velocity = Math.max(-2500, Math.min(2500, velocity));
      run();
    };
    // A drag is not a tap: the link under the finger does not open.
    const click = (event: MouseEvent) => {
      if (dragged) {
        event.preventDefault();
        event.stopPropagation();
        dragged = false;
      }
    };

    const measure = new ResizeObserver(() => {
      width = strip.scrollWidth / 2;
      wrap();
      paint();
    });
    measure.observe(strip);
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting) && document.visibilityState === "visible";
      if (visible) run();
    });
    seen.observe(box);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) run();
    };

    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("pointerleave", up);
    box.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", onVisibility);
    paint();
    run();

    return () => {
      cancelAnimationFrame(frame);
      measure.disconnect();
      seen.disconnect();
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      box.removeEventListener("pointerleave", up);
      box.removeEventListener("click", click, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [direction, speed]);

  return (
    <div ref={row} className={cn("drift-row", className)} data-swipe="own">
      <div ref={track} className={cn("drift-track", trackClassName)}>
        <div className="drift-set">{children}</div>
        <div className="drift-set" aria-hidden inert>
          {children}
        </div>
      </div>
    </div>
  );
}
