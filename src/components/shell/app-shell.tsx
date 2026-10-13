"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, ChevronDown, CircleAlert, LogOut, Search, Settings, ShieldCheck, User, ArrowLeftRight } from "lucide-react";
import { signOutAction, setLocaleAction } from "@/app/actions/session";
import { forgetNativeToken } from "@/features/native/bridge";
import { BarIcon } from "@/components/shell/bar-icons";
import { useInstantNavigation } from "@/components/shell/instant-nav";
import { PullToRefresh } from "@/components/shell/pull-to-refresh";
import { useWarmPages } from "@/components/shell/warm-pages";
import { MenuDrawer } from "@/components/shell/menu-drawer";
import { NavIcon } from "@/components/shell/nav-icon";
import type { NavGroup, NavItem } from "@/components/shell/navigation";
import { SOCIAL_LINE } from "@/components/site/social-lines";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { DevicePermissions } from "@/features/push/device-permissions";
import { forgetWebPush } from "@/features/push/client";
import { UNREAD_TOTAL_EVENT } from "@/features/messages/events";
import { flushOutbox, forgetOutbox } from "@/features/messages/outbox";
import { appPlugin } from "@/features/native/bridge";
import { forgetKeptPages } from "@/lib/kept-pages";
import { getBrowserClient, listen } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";
import { fold } from "@/lib/search/fold";

export interface ShellUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

export interface ShellSocial {
  key: keyof typeof SOCIAL_LINE;
  href: string;
  label: string;
}

export interface ShellSchool {
  name: string;
  /** The official name, as the drawer shows it at the top. */
  fullName: string;
  logoUrl: string | null;
}

interface ShellProps {
  /** When the server drew this page (rendered-at.ts). */
  renderedAt?: number;
  variant: "portal" | "admin";
  school: ShellSchool;
  user: ShellUser;
  groups: NavGroup[];
  mobileBar?: NavItem[];
  unreadNotifications: number;
  unreadMessages: number;
  locale: string;
  switchHref?: { href: string; label: string } | null;
  /** The school's networks, at the foot of the menu above "About the app". */
  socials?: ShellSocial[];
  children: ReactNode;
  /** Rendered under the content — the portal passes the site footer here. */
  footer?: ReactNode;
}

/** Pages that belong under another menu item: an article lights up "News". */
const ALSO_UNDER: Record<string, string[]> = {
  "/updates": ["/news", "/announcements", "/events"],
  "/admin/accounts": ["/admin/guardians", "/admin/users"],
};

function isActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/dashboard") return pathname === href;
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return under(href) || (ALSO_UNDER[href] ?? []).some(under);
}

/** The emblem of the Republic, shipped with the build. */
const EMBLEM = "/gov/emblem-tj.svg";

/**
 * Top left on every page a signed-in person opens: the emblem of the
 * Republic, and beside it the school's short name in a small wide face whose
 * figures stand on the line with the letters — "МТМУ №7" in one row — with
 * what this part of the portal is under it.
 */
function SchoolMark({ school, subtitle }: { school: ShellSchool; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- the state emblem, a static SVG */}
      <img src={EMBLEM} alt="" aria-hidden width={36} height={36} className="size-9 shrink-0 object-contain" />
      <div className="min-w-0">
        <p className="shell-mark truncate">{school.name}</p>
        <p className="mt-0.5 truncate text-[0.5625rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/** Who made it, in the "about" dialog. */
const MAKERS = [
  {
    name: "Носирзода Меҳровар",
    latin: "Nosirzoda Mehrovar",
    roles: "Cybersecurity Specialist, Systems Troubleshooter, Backend Developer, IT Manager",
    level: "Senior Developer",
  },
  {
    name: "Ҷӯраев Илёс",
    latin: "Juraev Ilyos",
    roles: "UX Designer, Company Director, System Integration Engineer, Infrastructure Engineer",
    level: "Pre-Junior Developer",
  },
  {
    name: "Ҳусейнзода Руслан",
    latin: "Huseynzoda Ruslan",
    roles: "UI/UX Designer, Fullstack Developer, AI Prompter, System Engineer, Network Engineer",
    level: "Pre-Junior Developer",
  },
] as const;

/**
 * The foot of the menu, on the phone and in the sidebar alike: the school's
 * four networks as bare hairline marks, a line, and under it a small "!" and
 * "About the app", which opens the version of the app and who made it, in a
 * small table set in a typewriter face.
 */
function MenuFoot({ socials }: { socials: ShellSocial[] }) {
  const t = useTranslations("nav");
  const version = useAppVersion();
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <div>
      {socials.length > 0 ? (
        <nav className="menu-socials" aria-label={t("socials")}>
          {socials.map(({ key, href, label }) => {
            const Icon = SOCIAL_LINE[key];
            return (
              <a key={key} href={href} rel="noopener noreferrer" target="_blank" aria-label={label} title={label} className="menu-social" data-instant="off">
                <Icon />
              </a>
            );
          })}
        </nav>
      ) : null}
      <div className="flex items-center justify-center border-t border-line px-4 py-2.5">
        <DialogPrimitive.Root open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogPrimitive.Trigger asChild>
            <button type="button" className="shell-about inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <CircleAlert className="size-3.5" aria-hidden />
              {t("about")}
            </button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/40 data-[state=open]:animate-fade" />
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-surface p-5 text-center shadow-overlay focus:outline-none">
              {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, a small static SVG */}
              <img src="/brand/app-icon.svg" alt="" width={48} height={48} className="mx-auto size-12 rounded-xl shadow-sm" />
              <DialogPrimitive.Title className="mt-3 text-sm font-semibold text-ink">{t("aboutTitle")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs text-ink-secondary">{t("aboutBody")}</DialogPrimitive.Description>
              <p className="mt-2 font-mono text-[0.6875rem] text-ink-muted tabular">{t("appVersion", { version })}</p>
              <p className="mt-4 text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-ink-muted">{t("makers")}</p>
              <table className="makers mt-2 w-full text-left">
                <tbody>
                  {MAKERS.map((maker) => (
                    <tr key={maker.latin}>
                      <td>
                        <span className="block font-semibold text-ink">{maker.name}</span>
                        <span className="block text-ink-muted">{maker.latin}</span>
                      </td>
                      <td>
                        <span className="block text-ink-secondary">{maker.roles}</span>
                        <span className="makers-level">{maker.level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DialogPrimitive.Close className="mt-4 inline-flex h-9 min-w-24 items-center justify-center rounded-md bg-brand-solid px-5 text-xs font-semibold text-brand-on-solid hover:bg-brand-solid-hover">
                {t("aboutClose")}
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </div>
  );
}

/**
 * "Version …": the site's build, and inside the phone app the app's own
 * version beside it — two things that update separately, so both are shown.
 */
function useAppVersion(): string {
  const t = useTranslations("nav");
  const site = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
  const [app, setApp] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void appPlugin().then(async (plugin) => {
      const info = await plugin?.getInfo().catch(() => null);
      if (live && info?.version) setApp(info.version);
    });
    return () => {
      live = false;
    };
  }, []);
  return app ? t("versionInApp", { app, site }) : t("version", { site });
}

function NavList({ groups, pathname, onNavigate, filter }: { groups: NavGroup[]; pathname: string; onNavigate?: () => void; filter: string }) {
  const t = useTranslations();
  const normalized = fold(filter.trim());
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !normalized || fold(t(item.labelKey)).includes(normalized)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5 px-3 py-4">
      {visibleGroups.map((group) => (
        <div key={group.key}>
          {group.labelKey ? <p className="mb-1.5 px-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted">{t(group.labelKey)}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-brand-50 font-semibold text-brand-text-strong" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
                    )}
                  >
                    <span className={cn(active ? "text-brand-text" : "text-ink-muted")}>
                      <NavIcon name={item.icon} />
                    </span>
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {visibleGroups.length === 0 ? <p className="px-2.5 text-sm text-ink-muted">{t("common.noResults")}</p> : null}
    </div>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-danger-600 px-1 text-center text-[0.6875rem] font-semibold leading-[1.125rem] text-ink-inverse tabular" aria-label={label}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * The phone's bottom bar. A soft, rounded light sits under the chosen
 * section's icon and glides to the next one when another is tapped — at
 * once, before the page has answered — with a little squash on the way, and
 * each icon plays its own small act as it is chosen (bar-icons.tsx). Nothing
 * moves on the first paint: only a choice moves things.
 */
function BottomBar({ items, pathname, goingTo, messagesUnread }: { items: NavItem[]; pathname: string; goingTo: string | null; messagesUnread: number }) {
  const t = useTranslations();
  const current = items.findIndex((item) => isActive(pathname, item.href));
  // A tap is believed while its page is on its way, and only then: a page
  // that never came leaves the light where the page in front is.
  const going = goingTo ? items.findIndex((item) => isActive(goingTo, item.href)) : -1;
  const active = going >= 0 ? going : current;
  const [moves, setMoves] = useState(0);
  const [lastActive, setLastActive] = useState(active);
  if (lastActive !== active) {
    setLastActive(active);
    setMoves((n) => n + 1);
  }
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <nav
      aria-label={t("nav.quick")}
      className="bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden safe-bottom print:hidden"
      data-ready={ready || undefined}
      style={{ "--n": items.length, "--i": Math.max(active, 0) } as React.CSSProperties}
    >
      <span className="bar-pill" data-hidden={active < 0 || undefined} data-move={moves > 0 ? (moves % 2 ? "a" : "b") : undefined} aria-hidden />
      <ul className="relative grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item, index) => {
          const on = index === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn("bar-item flex min-h-14 flex-col items-center justify-start gap-0.5 px-1 pb-1 pt-1.5 text-xs", on ? "font-semibold text-brand-text" : "text-ink-muted")}
              >
                <span className="flex h-8 w-[3.75rem] items-center justify-center">
                  <span className="relative">
                    <BarIcon name={item.icon} />
                    {item.key === "messages" ? <CountBadge count={messagesUnread} label={t("nav.messagesUnread", { count: messagesUnread })} /> : null}
                  </span>
                </span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A page drawn longer ago than this was opened from the device, and is refreshed behind itself. */
const KEPT_COPY_MS = 15_000;
/** Back in the app after this long away, the page in front is refreshed. */
const AWAY_MS = 5 * 60_000;

export function AppShell({ variant, school, user, groups, mobileBar, unreadNotifications, unreadMessages, locale, switchHref, socials = [], children, footer, renderedAt }: ShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  // Opened from what the device kept (public/sw.js): on screen at once, and
  // fresh a moment later — as soon as there is a line to ask on.
  useEffect(() => {
    if (!renderedAt || Date.now() - renderedAt < KEPT_COPY_MS) return;
    const refresh = () => router.refresh();
    if (navigator.onLine) {
      const timer = window.setTimeout(refresh, 300);
      return () => window.clearTimeout(timer);
    }
    window.addEventListener("online", refresh, { once: true });
    return () => window.removeEventListener("online", refresh);
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Messages written with no line go out by themselves once there is one,
  // whichever page is open (outbox.ts).
  useEffect(() => {
    const flush = () => void flushOutbox();
    const first = window.setTimeout(flush, 2500);
    window.addEventListener("online", flush);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", flush);
    };
  }, []);
  // Back after a while away: the page in front is asked for again.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS && navigator.onLine) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const appRoot = useRef<HTMLDivElement>(null);
  const burger = useRef<HTMLButtonElement>(null);
  // A link in the menu, the back button, a notification: wherever the page
  // goes, the menu does not come along.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setDrawerOpen(false);
  }
  const [filter, setFilter] = useState("");
  const [notifications, setNotifications] = useState(unreadNotifications);
  // The page a tap is going to, drawn at once as its loading screen.
  const closeMenu = useCallback(() => setDrawerOpen(false), []);
  const goingTo = useInstantNavigation(pathname, closeMenu);
  // Every section of the menu and the bar kept on the device, ready before
  // it is tapped (warm-pages.ts).
  const warm = [...(mobileBar ?? []).map((item) => item.href), ...groups.flatMap((group) => group.items.map((item) => item.href))].slice(0, 18);
  useWarmPages(warm, pathname);

  const [prevCount, setPrevCount] = useState(unreadNotifications);
  if (prevCount !== unreadNotifications) {
    setPrevCount(unreadNotifications);
    setNotifications(unreadNotifications);
  }

  // "I am here, and what was sent to me has reached me" (00094): the second
  // tick on the sender's side, and "last seen" under this person's name. Told
  // when the portal opens, when it comes back to the screen or leaves it, and
  // when a message arrives — its notification is what this portal hears of
  // it, wherever in the portal the person is. Folded into one call a second.
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMessenger = useCallback((now = false) => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    const send = () => {
      touchTimer.current = null;
      getBrowserClient()
        .rpc("touch_messenger")
        .then(
          () => undefined,
          () => undefined
        );
    };
    if (now) send();
    else touchTimer.current = setTimeout(send, 1000);
  }, []);

  useEffect(() => {
    touchMessenger(true);
    const onVisibility = () => touchMessenger(true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (touchTimer.current) clearTimeout(touchTimer.current);
    };
  }, [touchMessenger]);

  // Realtime badge: RLS delivers only this user's notification rows.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = listen(
      supabase
        .channel(`notifications:${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
          setNotifications((n) => n + 1);
          if ((payload.new as { type?: string }).type === "message") touchMessenger();
        })
        // A burst of messages from one conversation updates its one unread
        // notification instead of adding another.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
          const row = payload.new as { type?: string; is_read?: boolean };
          if (row.type === "message" && !row.is_read) touchMessenger();
        })
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user.id, touchMessenger]);

  // The unread messages on the bar's Messages button. The layout counts them
  // once, and layouts are not rendered again on navigation, so a conversation
  // read here left the old number standing until a reload. Asked again when
  // this person reads a conversation anywhere (their membership row changes),
  // when the tab comes back, and on the way into or out of the messages.
  const tracksMessages = Boolean(mobileBar?.some((item) => item.key === "messages"));
  const [messagesUnread, setMessagesUnread] = useState(unreadMessages);
  const [prevMessages, setPrevMessages] = useState(unreadMessages);
  if (prevMessages !== unreadMessages) {
    setPrevMessages(unreadMessages);
    setMessagesUnread(unreadMessages);
  }
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recountMessages = useCallback(() => {
    if (recountTimer.current) clearTimeout(recountTimer.current);
    recountTimer.current = setTimeout(() => {
      getBrowserClient()
        .rpc("get_unread_message_count")
        .then(({ data, error }) => {
          if (!error && data !== null) setMessagesUnread(Number(data));
        });
    }, 300);
  }, []);
  useEffect(() => {
    if (!tracksMessages) return;
    const supabase = getBrowserClient();
    const channel = listen(
      supabase
        .channel(`unread-messages:${user.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${user.id}` }, recountMessages)
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") recountMessages();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (recountTimer.current) clearTimeout(recountTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [tracksMessages, user.id, recountMessages]);
  // In the messenger the list knows best, and knows at once (events.ts).
  useEffect(() => {
    const onTotal = (event: Event) => setMessagesUnread(Number((event as CustomEvent<number>).detail) || 0);
    window.addEventListener(UNREAD_TOTAL_EVENT, onTotal);
    return () => window.removeEventListener(UNREAD_TOTAL_EVENT, onTotal);
  }, []);
  const inMessages = pathname.startsWith("/messages");
  const wasInMessages = useRef(inMessages);
  useEffect(() => {
    if (wasInMessages.current === inMessages) return;
    wasInMessages.current = inMessages;
    if (tracksMessages) recountMessages();
  }, [inMessages, tracksMessages, recountMessages]);

  const subtitle = variant === "admin" ? t("admin.nav.title") : t("common.platformShort");
  const searchable = variant === "admin";

  const sidebar = (onNavigate?: () => void) => (
    <>
      {searchable ? (
        <div className="px-3 pt-3">
          <label htmlFor={onNavigate ? "nav-filter-mobile" : "nav-filter"} className="sr-only">
            {t("admin.nav.search")}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              id={onNavigate ? "nav-filter-mobile" : "nav-filter"}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("admin.nav.search")}
              className="h-9 w-full rounded-md border border-line bg-surface-muted pl-8 pr-2 text-sm placeholder:text-ink-muted focus:border-brand-600 focus:bg-surface focus:outline-none"
            />
          </div>
        </div>
      ) : null}
      <nav aria-label={variant === "admin" ? t("admin.nav.title") : t("nav.main")}>
        <NavList groups={groups} pathname={pathname} onNavigate={onNavigate} filter={filter} />
      </nav>
      {switchHref ? (
        <div className="border-t border-line px-3 py-3">
          <Link
            href={switchHref.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink"
          >
            {variant === "admin" ? <ArrowLeftRight className="size-[18px] text-ink-muted" aria-hidden /> : <ShieldCheck className="size-[18px] text-ink-muted" aria-hidden />}
            {switchHref.label}
          </Link>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div ref={appRoot} className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface pt-[var(--strip-h)] lg:flex print:hidden">
          <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
            <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="min-w-0 rounded-md">
              <SchoolMark school={school} subtitle={subtitle} />
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidebar()}</div>
          <div className="shrink-0">
            <MenuFoot socials={socials} />
          </div>
        </aside>

        {/* As tall as the screen at least, so the footer sits at the foot of a
            short page; on a phone it ends where the bottom bar begins, so the
            bar never covers it. */}
        <div className={cn("flex min-h-dvh min-w-0 flex-col", mobileBar && mobileBar.length > 0 && "shell-over-bar")}>
          {/* The phone's status bar is above it (--strip-h), so it pads itself below. */}
          <header className="sticky top-0 z-30 flex h-[calc(3.5rem+var(--strip-h))] items-center gap-1.5 border-b border-line bg-surface/95 px-2.5 pt-[var(--strip-h)] backdrop-blur-[2px] sm:px-5 print:hidden">
            <button
              ref={burger}
              type="button"
              className="shell-icon lg:hidden"
              aria-label={t("nav.openMenu")}
              aria-expanded={drawerOpen}
              aria-controls="menu-drawer"
              onClick={() => setDrawerOpen((was) => !was)}
            >
              <span className="burger" data-open={drawerOpen || undefined} aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>

            <div className="min-w-0 flex-1 lg:hidden">
              <SchoolMark school={school} subtitle={subtitle} />
            </div>
            <div className="hidden flex-1 lg:block" />

            {/* The bell, the avatar and the emblem share one centre line: each
                sits in a box of the same height. */}
            <Link
              href="/notifications"
              className="shell-icon relative"
              aria-label={notifications > 0 ? t("nav.notificationsUnread", { count: notifications }) : t("nav.notifications")}
            >
              <Bell className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
              <CountBadge count={notifications} label={t("nav.notificationsUnread", { count: notifications })} />
            </Link>

            <Overlay.DropdownMenu>
              <Overlay.DropdownMenuTrigger asChild>
                <button type="button" className="flex h-10 items-center gap-2 rounded-full px-0.5 hover:bg-surface-muted sm:pr-2" aria-label={t("nav.accountMenu")}>
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-40 truncate text-xs font-medium text-ink">{user.name}</span>
                    <span className="block max-w-40 truncate text-[0.6875rem] text-ink-muted">{user.roleLabel}</span>
                  </span>
                  <ChevronDown className="hidden size-4 text-ink-muted sm:block" aria-hidden />
                </button>
              </Overlay.DropdownMenuTrigger>
              <Overlay.DropdownMenuContent>
                <Overlay.DropdownMenuLabel>{user.name}</Overlay.DropdownMenuLabel>
                <Overlay.DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User aria-hidden />
                    {t("nav.profile")}
                  </Link>
                </Overlay.DropdownMenuItem>
                <Overlay.DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings aria-hidden />
                    {t("nav.settings")}
                  </Link>
                </Overlay.DropdownMenuItem>
                <Overlay.DropdownMenuSeparator />
                <Overlay.DropdownMenuLabel>{t("nav.language")}</Overlay.DropdownMenuLabel>
                <div className="flex gap-1 px-2 pb-1.5">
                  {(["tg", "ru", "en"] as const).map((code) => (
                    <form key={code} action={setLocaleAction}>
                      <input type="hidden" name="locale" value={code} />
                      <button
                        type="submit"
                        aria-pressed={locale === code}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium",
                          locale === code ? "border-brand-600 bg-brand-50 text-brand-text-strong" : "border-line text-ink-secondary hover:bg-surface-muted"
                        )}
                      >
                        {t(`common.locales.${code}`)}
                      </button>
                    </form>
                  ))}
                </div>
                <Overlay.DropdownMenuSeparator />
                <form
                  action={async () => {
                    // At once, whatever the network: the page dims and says it
                    // is on its way out (html[data-leaving], globals.css).
                    document.documentElement.setAttribute("data-leaving", "");
                    // This phone or browser stops getting this person's
                    // notifications first (a second or two at most).
                    forgetOutbox();
                    await Promise.all([forgetNativeToken(), forgetWebPush(), forgetKeptPages()]);
                    await signOutAction();
                  }}
                >
                  <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-danger-700 hover:bg-danger-50">
                    <LogOut className="size-4" aria-hidden />
                    {t("nav.signOut")}
                  </button>
                </form>
              </Overlay.DropdownMenuContent>
            </Overlay.DropdownMenu>
          </header>

          {/* The page on its way: a thin line along the top, the page in front still there. */}
          <div className="nav-progress" data-on={goingTo ? "" : undefined} aria-hidden />
          <PullToRefresh disabled={pathname.startsWith("/messages")} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[84rem] flex-1 px-4 pb-8 pt-5 focus:outline-none sm:px-6 sm:pt-7" aria-busy={goingTo ? true : undefined}>
            {children}
          </main>
          {footer}
        </div>

        <DevicePermissions locale={locale} userId={user.id} />

        {mobileBar && mobileBar.length > 0 ? <BottomBar items={mobileBar} pathname={pathname} goingTo={goingTo} messagesUnread={messagesUnread} /> : null}
      </div>
      <MenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} label={school.fullName || school.name} appRoot={appRoot} trigger={burger} footer={<MenuFoot socials={socials} />}>
        {sidebar(() => setDrawerOpen(false))}
      </MenuDrawer>
    </>
  );
}
