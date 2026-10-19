"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";

type Tab = "profile" | "settings";
const TABS: Tab[] = ["profile", "settings"];
const HREF: Record<Tab, string> = { profile: "/profile", settings: "/settings" };

/** The tab shown last, kept while the app is open, so the light slides from it to the new one. */
let lastTab: Tab | null = null;

/**
 * The top of one's own pages: the round photo, the name, and under them two
 * halves — Profile and Settings. A soft light sits under the one open and
 * slides to the other when it is pressed, overshooting a little and settling,
 * as the bottom bar's does.
 */
export function MeHeader({
  name,
  avatarUrl,
  detail,
  active,
  labels,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  detail?: ReactNode;
  active: Tab;
  labels: Record<Tab, string>;
  children?: ReactNode;
}) {
  // Drawn where the light was, then moved on the next frame.
  const [shown, setShown] = useState<Tab>(() => lastTab ?? active);
  useEffect(() => {
    lastTab = active;
    const frame = requestAnimationFrame(() => setShown(active));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <header className="me-head">
      <Avatar name={name} src={avatarUrl} size="lg" className="size-20 text-2xl" />
      <p className="mt-3 text-lg font-semibold leading-tight text-ink">{name}</p>
      {detail ? <div className="mt-1 text-sm text-ink-muted">{detail}</div> : null}
      {children}
      <nav className="me-tabs" style={{ "--i": TABS.indexOf(shown) } as React.CSSProperties}>
        <span className="me-tabs-pill" aria-hidden />
        {TABS.map((tab) => (
          <Link key={tab} href={HREF[tab]} aria-current={tab === active ? "page" : undefined} className={cn("me-tab", tab === shown && "me-tab-on")}>
            {labels[tab]}
          </Link>
        ))}
      </nav>
    </header>
  );
}
