"use client";

import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UserMenu } from "./user-menu";
import type { UserWithRole } from "@/types/auth";

interface HeaderProps {
  user: UserWithRole;
  onMenuToggle?: () => void;
  notificationCount?: number;
  locale?: string;
}

export function Header({ user, onMenuToggle, notificationCount = 0, locale = "tg" }: HeaderProps) {
  const t = useTranslations();

  return (
    <header className="flex h-20 items-center justify-between border-b border-neutral-200/70 glass-header px-4 lg:px-8 z-20">
      {/* Left side: Mobile menu toggle + Context title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onMenuToggle}
          aria-label="Menu"
        >
          <Menu className="h-5 w-5 text-neutral-700" />
        </Button>
        <div className="lg:hidden flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-xs font-bold text-white shadow-xs">
            {t("common.appName").charAt(0)}
          </div>
          <span className="font-bold text-neutral-900 text-sm tracking-tight">{t("common.appName")}</span>
        </div>

        <div className="hidden lg:block">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{t("common.appName")}</p>
          <h2 className="text-base font-bold text-neutral-900 tracking-tight">
            {user.firstName} {user.lastName}
          </h2>
        </div>
      </div>

      {/* Middle: Integrated Pill Search Bar */}
      <div className="hidden md:flex flex-1 max-w-md mx-6">
        <Link
          href="/search"
          className="flex h-11 w-full items-center justify-between rounded-full border border-neutral-200/80 bg-white/90 px-4.5 text-sm text-neutral-400 shadow-2xs transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:border-neutral-300 hover:bg-white hover:text-neutral-600 press-scale select-none"
        >
          <div className="flex items-center gap-2.5">
            <Search className="h-4 w-4 text-neutral-400" />
            <span className="text-xs font-medium text-neutral-400">{t("nav.search")}...</span>
          </div>
          <kbd className="hidden sm:inline-flex h-5 items-center rounded-md border border-neutral-200 bg-neutral-100 px-1.5 font-mono text-[10px] font-medium text-neutral-500">
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Right Controls: Language, Notifications, User Profile */}
      <div className="flex items-center gap-2.5">
        <LocaleSwitcher current={locale} />

        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200/80 bg-white text-neutral-600 shadow-2xs transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 press-scale"
          aria-label={t("nav.notifications")}
        >
          <Bell className="h-4.5 w-4.5" />
          {notificationCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[9px] font-bold text-white ring-2 ring-white animate-scale-in"
              aria-live="polite"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Link>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
