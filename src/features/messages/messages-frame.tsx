"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Two-pane messenger: list + thread on desktop, one pane at a time on phones. */
export function MessagesFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname.startsWith("/messages/");
  return (
    <div className="-mx-1 grid h-[calc(100dvh-11rem-var(--strip-h))] min-h-[26rem] overflow-hidden rounded-xl border border-line bg-surface shadow-xs sm:mx-0 lg:h-[calc(100dvh-7.5rem-var(--strip-h))] lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")}>{sidebar}</aside>
      <section className={cn("min-h-0 min-w-0 flex-col lg:flex", inThread ? "flex" : "hidden")}>{children}</section>
    </div>
  );
}
