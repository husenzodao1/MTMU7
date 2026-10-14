"use client";

import { useEffect } from "react";

/**
 * Puts the page back the way it was after the phone's keyboard goes away.
 *
 * On some Android phones (the app's web view in particular) a form in a
 * dialog closed with the keyboard still up — Save or Cancel pressed while
 * typing — left the page laid out for the smaller, keyboard-sized screen:
 * half as tall, or squeezed. Two things prevent it here. The field loses
 * focus the moment a dialog starts to close, so the keyboard leaves while the
 * page still knows it is open; and when the visible screen grows back to its
 * full height the page is asked to lay itself out again.
 */
export function ViewportGuard() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let shrunk = false;

    const relayout = () => {
      requestAnimationFrame(() => {
        const { scrollX, scrollY } = window;
        // Reading a layout property and touching a style forces a fresh layout.
        document.documentElement.style.setProperty("--relayout", String(Date.now() % 1000));
        void document.body.offsetHeight;
        window.scrollTo(scrollX, scrollY);
        window.dispatchEvent(new Event("resize"));
      });
    };

    const onResize = () => {
      if (!viewport) return;
      const small = viewport.height < window.screen.height * 0.6;
      if (small) shrunk = true;
      else if (shrunk) {
        shrunk = false;
        relayout();
      }
    };

    // A dialog that starts to close takes the keyboard with it (Radix marks it data-state="closed").
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inDialog = target?.closest('[role="dialog"], [role="alertdialog"]');
      if (!inDialog) return;
      const button = target?.closest("button");
      if (!button) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== button && inDialog.contains(active) && active.matches("input, textarea, select, [contenteditable='true']")) {
        active.blur();
      }
    };

    viewport?.addEventListener("resize", onResize);
    document.addEventListener("click", onClick, true);
    return () => {
      viewport?.removeEventListener("resize", onResize);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
