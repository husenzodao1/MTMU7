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
    <nav className="fixed bottom-0 left-0 right-0 z-[100] border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary-600" : "text-neutral-400"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error-500 px-0.5 text-[9px] font-medium text-white">
                    {item.badge! > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuToggle}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-neutral-400 transition-colors active:text-neutral-600"
          type="button"
        >
          <Menu className="h-5 w-5" />
          <span>{t("menu")}</span>
        </button>
      </div>
    </nav>
  );
}
