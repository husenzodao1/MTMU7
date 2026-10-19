"use client";

import { ArrowLeft, Headset, Megaphone, Mic, Paperclip, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { FROM_LIST } from "@/features/messages/from-list";
import { keptMessages, keptThreads } from "@/features/messages/local-store";
import { Thread } from "@/features/messages/thread";
import { fetchNewest, fetchThreads, type ThreadBase, type ThreadProps } from "@/features/messages/thread-props";
import type { ThreadMessage } from "@/features/messages/types";
import { useWallpaper } from "@/features/messages/wallpaper";
import { cn } from "@/lib/utils/cn";

/** A conversation being opened: what its list row said about it (conversation-list.tsx, data-*). */
interface Opening {
  href: string;
  title: string;
  kind: string;
  avatar: string | null;
}

/** A conversation of the list, as the frame needs it to fetch its screen ahead. */
export interface FrameConversation {
  id: string;
  newestAt: string | null;
  memberCount: number | null;
}

const THREAD_PATH = /^\/messages\/([0-9a-f-]{36})$/;

/** Conversations whose screens are fetched ahead, from the top of the list. */
const AHEAD = 40;
/** And whose newest messages are fetched ahead, so they open with them with no line. */
const AHEAD_MESSAGES = 25;

/** A conversation opened from the device: its screen and what was kept of its messages. */
interface Opened {
  id: string;
  props: ThreadProps;
  messages: ThreadMessage[];
}

/**
 * Two-pane messenger: list + thread on desktop, one pane at a time on phones.
 * On a phone it runs edge to edge under the portal's header, down to the
 * bottom bar, like an app's own screen (globals.css, .msg-frame).
 *
 * It moves at the tap, as a messenger does. A conversation whose screen this
 * device has kept (thread-props.ts) opens from the device itself: the address
 * changes (history.pushState, which Next.js follows) and the thread is drawn
 * here from what was kept, with its kept messages — no page is asked of the
 * server at all, so it is the same with a good line, a slow one or none. The
 * thread then catches up with the server by itself, as it always does. Any
 * other conversation opens as a page, its header, wallpaper and composer at
 * once from what its row showed, its messages as they arrive. Back from a
 * conversation opened from the list is back to the list.
 *
 * The screens of the list's conversations, and their newest messages, are
 * fetched ahead while the list is open, so almost every tap is the first kind.
 */
export function MessagesFrame({
  sidebar,
  children,
  base,
  conversations,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  base: ThreadBase;
  conversations: FrameConversation[];
}) {
  const pathname = usePathname();
  // The conversation the server's page is drawing, if any (messages/[id]).
  const segment = useSelectedLayoutSegment();
  const router = useRouter();
  const t = useTranslations("portal.messages");
  const frame = useRef<HTMLDivElement>(null);
  const [going, setGoing] = useState<Opening | null>(null);
  // Arrived — or gone somewhere else, by the back button say: the tap is done.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setGoing(null);
  }

  // The screens kept on this device, by conversation (local-store.ts).
  const kept = useRef(new Map<string, ThreadProps>());
  const [opened, setOpened] = useState<Opened | null>(null);
  const userId = base.currentUserId;

  /** A kept conversation drawn here, its address in the history: a new place from the list, the same place from another conversation. */
  const openHere = useCallback(
    async (id: string, props: ThreadProps) => {
      const { run, messages } = await keptMessages(userId, id);
      // What was kept whole is the thread's first page; what lies after it the
      // thread lays on itself, to be checked with the server (thread.tsx).
      const whole = run ? messages.filter((m) => Date.parse(m.created_at) >= run.from && Date.parse(m.created_at) <= run.to) : [];
      setOpened({ id, props, messages: whole });
      const path = `/messages/${id}`;
      if (window.location.pathname === path) return;
      const inThread = THREAD_PATH.test(window.location.pathname);
      const fromList = inThread ? Boolean((window.history.state as Record<string, unknown> | null)?.[FROM_LIST]) : true;
      // A fresh object, so Next.js lays its own state on it and follows the address.
      if (inThread) window.history.replaceState({ [FROM_LIST]: fromList }, "", path);
      else window.history.pushState({ [FROM_LIST]: true }, "", path);
    },
    [userId]
  );

  // The kept screens, then those of the list fetched ahead (a fresher copy of
  // the kept ones too), then the newest messages of the top of the list.
  const listKey = conversations
    .slice(0, AHEAD)
    .map((c) => `${c.id}:${c.newestAt ?? ""}`)
    .join(",");
  const labels = {
    supportTitle: t("supportTitle"),
    supportSubtitle: t("supportSubtitle"),
    supportDeskSubtitle: t("supportDeskSubtitle"),
    unknownUser: t("unknownUser"),
  };
  const labelsKey = JSON.stringify(labels);
  useEffect(() => {
    let live = true;
    void keptThreads<ThreadProps>(userId).then((found) => {
      if (!live) return;
      for (const [id, props] of found) if (!kept.current.has(id)) kept.current.set(id, props);
    });
    const ahead = () => {
      if (!navigator.onLine) return;
      const top = listKey ? listKey.split(",").map((pair) => pair.slice(0, 36)) : [];
      const counts = new Map(conversations.map((c) => [c.id, c.memberCount]));
      void fetchThreads(base, top, JSON.parse(labelsKey) as typeof labels).then((fetched) => {
        if (!live || !fetched) return;
        for (const props of fetched) {
          // A conversation whose members did not all come (a very large one)
          // is left to its page, which has them all.
          const count = counts.get(props.conversation.id);
          if (typeof count === "number" && props.members.length < count) {
            kept.current.delete(props.conversation.id);
            continue;
          }
          kept.current.set(props.conversation.id, props);
        }
        void fetchNewest(
          userId,
          conversations.slice(0, AHEAD_MESSAGES).map((c) => ({ id: c.id, newestAt: c.newestAt }))
        );
      });
    };
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 600));
    idle(ahead);
    window.addEventListener("online", ahead);
    return () => {
      live = false;
      window.removeEventListener("online", ahead);
    };
    // The list's conversations by value (listKey), not by the array's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, listKey, labelsKey]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self")) return;
      // The lift after a long press on a row opens its actions, not the conversation (conversation-list.tsx).
      if (anchor.dataset.held) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/messages(\/|$)/.test(url.pathname) || url.pathname === window.location.pathname) return;
      // Back to the list from a conversation opened from it: the list is the place before.
      if (url.pathname === "/messages" && !url.search && THREAD_PATH.test(window.location.pathname)) {
        const state = window.history.state as Record<string, unknown> | null;
        if (state?.[FROM_LIST]) {
          event.preventDefault();
          event.stopPropagation();
          window.history.back();
          return;
        }
      }
      const id = url.search ? null : THREAD_PATH.exec(url.pathname)?.[1];
      const props = id ? kept.current.get(id) : undefined;
      if (id && props) {
        // Opened from the device: Next.js's link is not followed.
        event.preventDefault();
        event.stopPropagation();
        void openHere(id, props);
        return;
      }
      setGoing({
        href: url.pathname,
        title: anchor.dataset.title ?? "",
        kind: anchor.dataset.kind ?? "group",
        avatar: anchor.dataset.avatar || null,
      });
    };
    element.addEventListener("click", onClick, true);
    return () => element.removeEventListener("click", onClick, true);
  }, [openHere]);

  // A tap that led nowhere (no connection, say) is let go of after a while.
  useEffect(() => {
    if (!going) return;
    const giveUp = window.setTimeout(() => setGoing(null), 25_000);
    return () => window.clearTimeout(giveUp);
  }, [going]);

  // A conversation reached as a page from the list: its place is marked as
  // opened from the list, as one opened from the device is.
  const wentFromList = useRef(false);
  useEffect(() => {
    if (going?.href && THREAD_PATH.test(going.href) && !THREAD_PATH.test(window.location.pathname)) wentFromList.current = true;
  }, [going]);
  useEffect(() => {
    if (!THREAD_PATH.test(pathname)) {
      wentFromList.current = false;
      return;
    }
    if (!wentFromList.current) return;
    wentFromList.current = false;
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    // Next.js's own state is in it already, so the address stays as it is.
    if (!state[FROM_LIST]) window.history.replaceState({ ...state, [FROM_LIST]: true }, "");
  }, [pathname]);

  // The address names a conversation the server's page is not drawing: one
  // opened from the device, or come back to (the back and forward buttons).
  const pathId = THREAD_PATH.exec(pathname)?.[1] ?? null;
  const local = pathId && segment !== pathId ? pathId : null;
  const shown = local && opened?.id === local ? opened : null;
  useEffect(() => {
    if (!local || opened?.id === local) return;
    let live = true;
    void (async () => {
      const props = kept.current.get(local) ?? (await keptThreads<ThreadProps>(userId)).get(local);
      if (!live) return;
      // Nothing kept of it after all: the server's page.
      if (!props) router.refresh();
      else void openHere(local, props);
    })();
    return () => {
      live = false;
    };
  }, [local, opened, openHere, router, userId]);

  const target = going?.href ?? pathname;
  const inThread = target.startsWith("/messages/");
  const opening = going && going.href !== "/messages" ? going : null;
  return (
    <div ref={frame} className="msg-frame grid overflow-hidden bg-surface lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", inThread ? "hidden" : "flex")}>{sidebar}</aside>
      <section className={cn("min-h-0 min-w-0 flex-col lg:flex", inThread ? "flex" : "hidden")}>
        {opening ? <ThreadOpening opening={opening} /> : shown ? <Thread key={shown.id} {...shown.props} initialMessages={shown.messages} /> : null}
        <div hidden={Boolean(opening) || Boolean(local)} className="contents">
          {local ? null : children}
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
