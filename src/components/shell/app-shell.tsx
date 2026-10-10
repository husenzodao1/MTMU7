"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, ChevronDown, CircleAlert, LogOut, Search, Settings, ShieldCheck, User, ArrowLeftRight } from "lucide-react";
import { signOutAction, setLocaleAction } from "@/app/actions/session";
import { forgetNativeToken } from "@/features/native/bridge";
import { NavIcon } from "@/components/shell/nav-icon";
import type { NavGroup, NavItem } from "@/components/shell/navigation";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { DevicePermissions } from "@/features/push/device-permissions";
import { appPlugin } from "@/features/native/bridge";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

export interface ShellUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

export interface ShellSchool {
  name: string;
  /** The official name, as the drawer shows it at the top. */
  fullName: string;
  logoUrl: string | null;
}

interface ShellProps {
  variant: "portal" | "admin";
  school: ShellSchool;
  user: ShellUser;
  groups: NavGroup[];
  mobileBar?: NavItem[];
  unreadNotifications: number;
  unreadMessages: number;
  locale: string;
  switchHref?: { href: string; label: string } | null;
  children: ReactNode;
  /** Rendered under the content — the portal passes the site footer here. */
  footer?: ReactNode;
}

function isActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
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
 * The foot of the phone's menu: a small "!" and "About the app". It opens the
 * version of the app and who made it, in a small table set in a typewriter
 * face.
 */
function DrawerFooter() {
  const t = useTranslations("nav");
  const version = useAppVersion();
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <div className="flex items-center justify-center px-4 py-2.5">
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
            <DialogPrimitive.Close className="mt-4 inline-flex h-9 min-w-24 items-center justify-center rounded-full bg-brand-solid px-5 text-xs font-semibold text-brand-on-solid hover:bg-brand-solid-hover">
              {t("aboutClose")}
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
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
  const normalized = filter.trim().toLowerCase();
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !normalized || t(item.labelKey).toLowerCase().includes(normalized)) }))
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
 * On a phone the menu also opens with a swipe to the right anywhere on the
 * page, and closes with a swipe back to the left — except where the finger is
 * on something that moves sideways itself: a horizontal list, a ribbon, a
 * text field, a slider.
 */
function useSwipeMenu(open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    let start: { x: number; y: number; at: number } | null = null;
    const movesSideways = (target: EventTarget | null) => {
      for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
        if (el.matches("input, textarea, select, [contenteditable='true'], [role='slider'], [data-swipe='own']")) return true;
        const style = getComputedStyle(el);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
      }
      return false;
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.innerWidth >= 1024) {
        start = null;
        return;
      }
      const touch = event.touches[0]!;
      start = movesSideways(event.target) ? null : { x: touch.clientX, y: touch.clientY, at: performance.now() };
    };
    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0]!;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = performance.now() - start.at < 700;
      start = null;
      if (!quick || Math.abs(dy) > 45 || Math.abs(dx) < 70) return;
      if (dx > 0 && !open) setOpen(true);
      if (dx < 0 && open) setOpen(false);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [open, setOpen]);
}

export function AppShell({ variant, school, user, groups, mobileBar, unreadNotifications, unreadMessages, locale, switchHref, children, footer }: ShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useSwipeMenu(drawerOpen, setDrawerOpen);
  const [filter, setFilter] = useState("");
  const [notifications, setNotifications] = useState(unreadNotifications);

  const [prevCount, setPrevCount] = useState(unreadNotifications);
  if (prevCount !== unreadNotifications) {
    setPrevCount(unreadNotifications);
    setNotifications(unreadNotifications);
  }

  // Realtime badge: RLS delivers only this user's notification rows.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        setNotifications((n) => n + 1);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user.id]);

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
    const channel = supabase
      .channel(`unread-messages:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `user_id=eq.${user.id}` }, recountMessages)
      .subscribe();
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
      <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface pt-[var(--strip-h)] lg:flex print:hidden">
          <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
            <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="min-w-0 rounded-md">
              <SchoolMark school={school} subtitle={subtitle} />
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidebar()}</div>
        </aside>

        {/* As tall as the screen at least, so the footer sits at the foot of a
            short page; on a phone it ends where the bottom bar begins, so the
            bar never covers it. */}
        <div className={cn("flex min-h-dvh min-w-0 flex-col", mobileBar && mobileBar.length > 0 && "shell-over-bar")}>
          {/* The phone's status bar is above it (--strip-h), so it pads itself below. */}
          <header className="sticky top-0 z-30 flex h-[calc(3.5rem+var(--strip-h))] items-center gap-1.5 border-b border-line bg-surface/95 px-2.5 pt-[var(--strip-h)] backdrop-blur-[2px] sm:px-5 print:hidden">
            <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DialogPrimitive.Trigger asChild>
                <button type="button" className="shell-icon lg:hidden" aria-label={t("nav.openMenu")} aria-expanded={drawerOpen}>
                  <span className="burger" data-open={drawerOpen || undefined} aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </DialogPrimitive.Trigger>
              <Overlay.DrawerContent title={school.fullName || school.name} closeLabel={t("common.close")} bare footer={<DrawerFooter />}>
                {sidebar(() => setDrawerOpen(false))}
              </Overlay.DrawerContent>
            </DialogPrimitive.Root>

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
                    // In the phone app this phone stops getting this person's
                    // notifications first; in a browser it returns at once.
                    await forgetNativeToken();
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

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[84rem] flex-1 px-4 pb-8 pt-5 focus:outline-none sm:px-6 sm:pt-7">
            {children}
          </main>
          {footer}
        </div>

        <DevicePermissions locale={locale} userId={user.id} />

        {mobileBar && mobileBar.length > 0 ? (
          <nav aria-label={t("nav.quick")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden safe-bottom print:hidden">
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileBar.length}, minmax(0, 1fr))` }}>
              {mobileBar.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs", active ? "font-semibold text-brand-text" : "text-ink-muted")}
                    >
                      <span className="relative">
                        <NavIcon name={item.icon} className="size-5" />
                        {item.key === "messages" ? <CountBadge count={messagesUnread} label={t("nav.messagesUnread", { count: messagesUnread })} /> : null}
                      </span>
                      <span className="max-w-full truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>
    </>
  );
}
