"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * A small closed box: a line of title with an arrow at its end, and what it
 * holds made only when it is opened — for what a page needs now and then,
 * not every time it is opened.
 */
export function Fold({ title, hint, children, className }: { title: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cn("rounded-xl border border-line bg-surface shadow-xs", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {hint ? <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="border-t border-line px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}
