"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MessageSquare, Bell, Newspaper, Menu } from "lucide-react";
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
      <div
        className="mx-4 mb-4 rounded-[24px] bg-white/95 backdrop-blur-2xl"
        style={{
          boxShadow: "0 4px 24px rgba(79, 70, 229, 0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
        }}
      >
        <div className="flex items-center justify-around px-1 py-2">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-1 select-none"
              >
                <span className="relative">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                      active
                        ? "shadow-[0_2px_12px_rgba(79,70,229,0.28)]"
                        : ""
                    )}
                    style={active ? {
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    } : {}}
                  >
                    <Icon
                      className={cn(
                        "transition-all duration-300",
                        active ? "h-[18px] w-[18px] text-white" : "h-5 w-5 text-slate-400"
                      )}
                    />
                  </span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white ring-2 ring-white">
                      {item.badge! > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-none transition-colors duration-300",
                    active ? "text-indigo-600" : "text-slate-400"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={onMenuToggle}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1 select-none cursor-pointer"
            type="button"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl">
              <Menu className="h-5 w-5 text-slate-400" />
            </span>
            <span className="text-[10px] font-semibold leading-none text-slate-400">
              {t("menu")}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}
