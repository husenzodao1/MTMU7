"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MessageSquare, BookOpen, Bell, Menu } from "lucide-react";
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
    { label: t("library"), href: "/library", icon: BookOpen },
    { label: t("notifications"), href: "/notifications", icon: Bell, badge: notificationCount },
  ];

  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-full border border-neutral-200/80 bg-white/90 p-1.5 shadow-lg backdrop-blur-lg pb-[calc(0.375rem+env(safe-area-inset-bottom))] lg:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center rounded-full py-1.5 text-[10px] font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale select-none",
                active ? "bg-neutral-900 text-white shadow-xs" : "text-neutral-500 hover:text-neutral-900"
              )}
            >
              <span className="relative">
                <Icon className={cn("h-4.5 w-4.5", active ? "text-white" : "text-neutral-500")} />
                {(item.badge ?? 0) > 0 && (
                  <span
                    className={cn(
                      "absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold",
                      active ? "bg-white text-neutral-900" : "bg-error-500 text-white"
                    )}
                  >
                    {item.badge! > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className="mt-0.5 truncate text-[10px]">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuToggle}
          className="flex flex-1 flex-col items-center justify-center rounded-full py-1.5 text-[10px] font-semibold text-neutral-500 transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:text-neutral-900 press-scale select-none cursor-pointer"
          type="button"
        >
          <Menu className="h-4.5 w-4.5 text-neutral-500" />
          <span className="mt-0.5 truncate text-[10px]">{t("menu")}</span>
        </button>
      </div>
    </nav>
  );
}
