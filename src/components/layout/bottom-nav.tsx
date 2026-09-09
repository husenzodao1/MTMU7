"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MessageSquare, BookOpen, Bell, Newspaper, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  notificationCount?: number;
  unreadMessages?: number;
  onMenuToggle: () => void;
}

export function BottomNav({ notificationCount = 0, unreadMessages = 0, onMenuToggle }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const items = [
    { label: t("dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { label: t("messages"), href: "/messages", icon: MessageSquare, badge: unreadMessages },
    { label: t("news"), href: "/news", icon: Newspaper },
    { label: t("notifications"), href: "/notifications", icon: Bell, badge: notificationCount },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-3 mb-3 rounded-2xl border border-neutral-100 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.10)] backdrop-blur-xl">
        <div className="flex items-end justify-around px-2 pt-2 pb-2">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 press-scale select-none"
              >
                <span className="relative flex flex-col items-center">
                  <span className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200",
                    active ? "bg-neutral-900" : "bg-transparent"
                  )}>
                    <Icon className={cn(
                      "h-5 w-5 transition-all duration-200",
                      active ? "text-white" : "text-neutral-400"
                    )} />
                  </span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-0.5 text-[9px] font-bold text-white ring-1.5 ring-white">
                      {item.badge! > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span className={cn(
                  "text-[10px] font-semibold leading-tight transition-colors duration-200",
                  active ? "text-neutral-900" : "text-neutral-400"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={onMenuToggle}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 press-scale select-none cursor-pointer"
            type="button"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl">
              <Menu className="h-5 w-5 text-neutral-400" />
            </span>
            <span className="text-[10px] font-semibold leading-tight text-neutral-400">
              {t("menu")}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}
