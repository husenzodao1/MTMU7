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
    <nav className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-neutral-200/60 bg-white/95 shadow-xl backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-center justify-around px-1 py-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 transition-all duration-200 press-scale select-none",
                active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-600"
              )}
            >
              <span className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                active ? "bg-neutral-900 shadow-sm" : ""
              )}>
                <Icon className={cn("h-5 w-5", active ? "text-white" : "")} />
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-0.5 text-[9px] font-bold text-white ring-1 ring-white">
                    {item.badge! > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[10px] font-semibold tracking-tight", active ? "text-neutral-900" : "")}>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuToggle}
          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 px-1 text-neutral-400 transition-all duration-200 hover:text-neutral-600 press-scale select-none cursor-pointer"
          type="button"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl">
            <Menu className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-semibold tracking-tight">{t("menu")}</span>
        </button>
      </div>
    </nav>
  );
}
