"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, ShieldCheck, User, ArrowLeftRight } from "lucide-react";
import { signOutAction, setLocaleAction } from "@/app/actions/session";
import { forgetNativeToken } from "@/features/native/bridge";
import { NavIcon } from "@/components/shell/nav-icon";
import type { NavGroup, NavItem } from "@/components/shell/navigation";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { DevicePermissions } from "@/features/push/device-permissions";
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
  /** The ministry strip, sticky above everything (a server component). */
  strip?: ReactNode;
}

function isActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The school's own mark, top left, on every page a signed-in person opens.
 *
 * A crest rather than a thumbnail: the photograph of the school in a ring of
 * the theme's own colour — turned a little, so it catches the light like a
 * struck medal — with a hairline of the page between the two, and the name
 * beside it in a unicase, the way a name is cut into a seal. The ring follows
 * the theme, so the crest is gold on the school's own theme, blue on Ocean.
 */
function SchoolMark({ school, subtitle }: { school: ShellSchool; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="crest-ring relative flex size-12 shrink-0 items-center justify-center rounded-full p-[3px]">
        <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-surface p-[2px]">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- school logo from storage, small and fixed size
            <img src={school.logoUrl} alt="" className="size-full rounded-full object-cover" />
          ) : (
            <span className="crest-name flex size-full items-center justify-center rounded-full bg-brand-solid text-base text-brand-on-solid">
              {school.name.slice(0, 2)}
            </span>
          )}
        </span>
      </span>
      <div className="min-w-0">
        <p className="crest-name truncate text-[1.1875rem] leading-none text-ink">{school.name}</p>
        <p className="mt-1 truncate text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-brand-text">{subtitle}</p>
      </div>
    </div>
  );
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

export function AppShell({ variant, school, user, groups, mobileBar, unreadNotifications, unreadMessages, locale, switchHref, children, footer, strip }: ShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      {strip}
      <div className="min-h-[calc(100dvh-var(--strip-h))] lg:grid lg:grid-cols-[16.5rem_1fr]">
        <aside className="sticky top-[var(--strip-h)] hidden h-[calc(100dvh-var(--strip-h))] flex-col border-r border-line bg-surface lg:flex print:hidden">
          <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
            <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="min-w-0 rounded-md">
              <SchoolMark school={school} subtitle={subtitle} />
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidebar()}</div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-[var(--strip-h)] z-30 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur-[2px] sm:px-5 print:hidden">
            <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DialogPrimitive.Trigger asChild>
                <button
                  type="button"
                  className="rounded-md p-2 text-ink-secondary hover:bg-surface-muted hover:text-ink lg:hidden"
                  aria-label={t("nav.openMenu")}
                  aria-expanded={drawerOpen}
                >
                  <Menu className="size-5" aria-hidden />
                </button>
              </DialogPrimitive.Trigger>
              <Overlay.DrawerContent title={school.name} closeLabel={t("common.close")}>
                {sidebar(() => setDrawerOpen(false))}
              </Overlay.DrawerContent>
            </DialogPrimitive.Root>

            <div className="min-w-0 flex-1 lg:hidden">
              <SchoolMark school={school} subtitle={subtitle} />
            </div>
            <div className="hidden flex-1 lg:block" />

            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-ink-secondary hover:bg-surface-muted hover:text-ink"
              aria-label={notifications > 0 ? t("nav.notificationsUnread", { count: notifications }) : t("nav.notifications")}
            >
              <Bell className="size-5" aria-hidden />
              <CountBadge count={notifications} label={t("nav.notificationsUnread", { count: notifications })} />
            </Link>

            <Overlay.DropdownMenu>
              <Overlay.DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface-muted" aria-label={t("nav.accountMenu")}>
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-40 truncate text-sm font-medium text-ink">{user.name}</span>
                    <span className="block max-w-40 truncate text-xs text-ink-muted">{user.roleLabel}</span>
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

          <main id="main" tabIndex={-1} className={cn("mx-auto w-full max-w-[84rem] flex-1 px-4 py-5 focus:outline-none sm:px-6 sm:py-7", mobileBar && "pb-24 lg:pb-7")}>
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
                        {item.key === "messages" ? <CountBadge count={unreadMessages} label={t("nav.messagesUnread", { count: unreadMessages })} /> : null}
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
