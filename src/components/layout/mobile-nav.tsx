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
          "fixed inset-0 z-[200] bg-neutral-950/40 backdrop-blur-sm transition-opacity duration-[var(--duration-slow)] lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[201] flex w-80 max-w-[85vw] flex-col rounded-r-[28px] border-r border-neutral-200/80 bg-white/95 shadow-2xl backdrop-blur-md transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* School header */}
        <div className="flex flex-col items-center gap-2 border-b border-neutral-200/60 px-5 py-5">
          <div className="flex w-full items-start justify-end">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close menu">
              <X className="h-4.5 w-4.5" />
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl" style={{width:90,height:90}}>
            <img
              src={school?.logoUrl ?? "/school.png"}
              alt={school?.name ?? "МТМУ №7"}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="font-bold text-neutral-900 text-sm tracking-tight">{school?.name ?? t("common.appName")}</span>
        </div>

        {/* User Profile Summary */}
        {user && (
          <div className="border-b border-neutral-200/60 p-4 mx-2">
            <div className="flex items-center gap-3 rounded-2xl bg-[#EEF2F8]/70 p-3">
              <Avatar
                src={user.avatarUrl}
                fallback={`${user.firstName[0]}${user.lastName[0]}`}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-900">
                  {user.firstName} {user.lastName}
                </p>
                {primaryRole && (
                  <p className="truncate text-xs font-medium text-neutral-500">{primaryRole.nameTg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-3">
          <ul className="space-y-1">
            {filteredMain.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              const badge = item.href === "/notifications" ? notificationCount : item.href === "/friends" ? friendRequestCount : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale select-none",
                      active
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    <Icon className={cn("h-4.5 w-4.5 shrink-0", active ? "text-white" : "text-neutral-500")} />
                    <span className="flex-1 truncate">{t(item.label)}</span>
                    {badge > 0 && (
                      <span
                        className={cn(
                          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                          active ? "bg-white text-neutral-900" : "bg-error-500 text-white"
                        )}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-neutral-200/60" />

          <ul className="space-y-1">
            {filteredBottom.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale select-none",
                      active
                        ? "bg-neutral-900 text-white shadow-xs"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    <Icon className={cn("h-4.5 w-4.5 shrink-0", active ? "text-white" : "text-neutral-500")} />
                    <span className="truncate">{t(item.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout Footer */}
        <div className="border-t border-neutral-200/60 p-4">
          <button
            onClick={handleLogout}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-200/80 bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:bg-neutral-100 hover:text-neutral-900 press-scale cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-neutral-500" />
            <span>{t("auth.logout")}</span>
          </button>
        </div>
      </div>
    </>
  );
}
