"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems } from "./nav-items";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { UserWithRole } from "@/types/auth";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  enabledModules: string[];
  isAdmin: boolean;
  school?: { name: string; logoUrl: string | null };
  user?: UserWithRole;
  notificationCount?: number;
  friendRequestCount?: number;
}

export function MobileNav({ isOpen, onClose, enabledModules, isAdmin, school, user, notificationCount = 0, friendRequestCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const handleLogout = () => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  };

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const primaryRole = user?.roles[0];

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={cn(
          "fixed inset-0 z-[200] bg-black/50 transition-opacity duration-[var(--duration-slow)] lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[201] flex w-72 flex-col bg-white shadow-xl transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* School header */}
        <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
          <div className="flex items-center gap-2">
            {school?.logoUrl ? (
              <img
                src={school.logoUrl}
                alt={school.name}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
                {t("common.appName").charAt(0)}
              </div>
            )}
            <span className="font-semibold text-neutral-900 text-sm">{school?.name ?? t("common.appName")}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* User info */}
        {user && (
          <div className="border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar
                src={user.avatarUrl}
                fallback={`${user.firstName[0]}${user.lastName[0]}`}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {user.firstName} {user.lastName}
                </p>
                {primaryRole && (
                  <p className="truncate text-xs text-neutral-500">{primaryRole.nameTg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {filteredMain.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              const badge = item.href === "/notifications" ? notificationCount : item.href === "/friends" ? friendRequestCount : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
                    <span className="flex-1">{t(item.label)}</span>
                    {badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1.5 text-[10px] font-medium text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-2 border-t border-neutral-200" />

          <ul className="space-y-0.5">
            {filteredBottom.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary-600" : "text-neutral-400")} />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="border-t border-neutral-200 p-3">
          <button
            onClick={handleLogout}
            disabled={isPending}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <LogOut className="h-5 w-5 shrink-0 text-neutral-400" />
            {t("auth.logout")}
          </button>
        </div>
      </div>
    </>
  );
}
