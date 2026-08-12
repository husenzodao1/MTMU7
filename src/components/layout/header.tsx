"use client";

import { Bell, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import type { UserWithRole } from "@/types/auth";

interface HeaderProps {
  user: UserWithRole;
  onMenuToggle?: () => void;
  notificationCount?: number;
}

export function Header({ user, onMenuToggle, notificationCount = 0 }: HeaderProps) {
  const t = useTranslations();

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuToggle}
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="lg:hidden flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-xs font-bold text-white">
            М
          </div>
          <span className="font-semibold text-neutral-900 text-sm">МТМУ №7</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.notifications")}>
          <Bell className="h-5 w-5 text-neutral-500" />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white animate-scale-in">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
