"use client";

import { ArrowLeft, Headset, Megaphone, Mic, Paperclip, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { useWallpaper } from "@/features/messages/wallpaper";
import { cn } from "@/lib/utils/cn";

/** A conversation being opened: what its list row said about it (conversation-list.tsx, data-*). */
interface Opening {
  href: string;
  title: string;
  kind: string;
  avatar: string | null;
}

/**
 * Two-pane messenger: list + thread on desktop, one pane at a time on phones.
 * On a phone it runs edge to edge under the portal's header, down to the
 * bottom bar, like an app's own screen (globals.css, .msg-frame).
 *
 * It moves at the tap, as a messenger does: a conversation tapped in the list
 * opens at once — its header, its wallpaper and the composer, from what the
 * row already showed — and its messages come in as they arrive; the back
 * arrow shows the list at once. The shell's page skeleton stays out of it
 * (instant-nav.ts).
 */
export function MessagesFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const frame = useRef<HTMLDivElement>(null);
  const [going, setGoing] = useState<Opening | null>(null);
  // Arrived — or gone somewhere else, by the back button say: the tap is done.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setGoing(null);
  }

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/messages(\/|$)/.test(url.pathname) || url.pathname === window.location.pathname) return;
      setGoing({
        href: url.pathname,
        title: anchor.dataset.title ?? "",
        kind: anchor.dataset.kind ?? "group",
        avatar: anchor.dataset.avatar || null,
      });
    };
    element.addEventListener("click", onClick, true);
    return () => element.removeEventListener("click", onClick, true);
  }, []);

  // A tap that led nowhere (no connection, say) is let go of after a while.
  useEffect(() => {
    if (!going) return;
    const giveUp = window.setTimeout(() => setGoing(null), 25_000);
    return () => window.clearTimeout(giveUp);
  }, [going]);

  const target = going?.href ?? pathname;
  const inThread = target.startsWith("/messages/");
  const opening = going && going.href !== "/messages" ? going : null;
  return (
    <div ref={frame} className="msg-frame grid overflow-hidden bg-surface lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")}>{sidebar}</aside>
      <section className={cn("min-h-0 min-w-0 flex-col lg:flex", inThread ? "flex" : "hidden")}>
        {opening ? <ThreadOpening opening={opening} /> : null}
        <div hidden={Boolean(opening)} className="contents">
          {children}
        </div>
      </section>
    </div>
  );
}

/**
 * The conversation between the tap and its messages: the thread's own header,
 * wall and composer, so nothing moves when the real one takes over. After a
 * moment with nothing yet, three quiet dots on the wall.
 */
function ThreadOpening({ opening }: { opening: Opening }) {
  const t = useTranslations("portal.messages");
  const [wallpaper] = useWallpaper();
  return (
    <div className="chat chat-screen relative flex h-full min-h-0 flex-col" aria-busy="true">
      <header className="chat-header flex items-center gap-2 px-2.5 py-2 sm:px-4">
        <Link href="/messages" className={buttonClasses("ghost", "icon-sm", "lg:hidden")} aria-label={t("back")}>
          <ArrowLeft aria-hidden />
        </Link>
        {opening.kind === "direct" ? (
          <Avatar name={opening.title} src={opening.avatar} size="md" />
        ) : opening.kind === "channel" ? (
          <span className="chat-channel-mark inline-flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden>
            <Megaphone className="size-[1.125rem]" strokeWidth={1.75} />
          </span>
        ) : opening.kind === "support" ? (
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid" aria-hidden>
            <Headset className="size-5" />
          </span>
        ) : (
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary" aria-hidden>
            <Users className="size-5" />
          </span>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold leading-tight text-ink">{opening.title}</h1>
      </header>
      <div className="relative min-h-0 flex-1">
        <div data-wallpaper={wallpaper} className="chat-wall chat-opening absolute inset-0">
          <span className="chat-opening-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
      <footer className="chat-composer px-2 py-2 sm:px-3" aria-hidden>
        <div className="flex items-end gap-1.5">
          <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-3xl bg-surface px-1 shadow-xs ring-1 ring-line/60">
            <span className="my-1 ms-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted">
              <Paperclip className="size-5 -rotate-45" />
            </span>
            <span className="truncate px-2 text-[0.9375rem] text-ink-muted">{t("composerPlaceholder")}</span>
          </div>
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-on-solid shadow-sm">
            <Mic className="size-5" />
          </span>
        </div>
      </footer>
    </div>
  );
}
