"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Two-pane messenger: list + thread on desktop, one pane at a time on phones.
 * On a phone it runs edge to edge under the portal's header, down to the
 * bottom bar, like an app's own screen (globals.css, .msg-frame).
 */
export function MessagesFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname.startsWith("/messages/");
  return (
    <div className="msg-frame grid overflow-hidden bg-surface lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")}>{sidebar}</aside>
      <section className={cn("min-h-0 min-w-0 flex-col lg:flex", inThread ? "flex" : "hidden")}>{children}</section>
    </div>
  );
}
