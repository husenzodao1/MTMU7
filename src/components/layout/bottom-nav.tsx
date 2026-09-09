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
        <div className="flex items-center justify-around px-2 py-1.5">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-1 select-none transition-transform duration-150 active:scale-[0.88]"
              >
                <span className="relative">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                    style={active ? {
                      background: "linear-gradient(145deg, #818cf8 0%, #4f46e5 100%)",
                      boxShadow: "0 3px 14px rgba(79,70,229,0.38), 0 1px 4px rgba(79,70,229,0.2)",
                    } : {}}
                  >
                    <Icon
                      className={cn(
                        "transition-colors duration-300",
                        active ? "h-[17px] w-[17px] text-white" : "h-[18px] w-[18px] text-slate-400"
                      )}
                    />
                  </span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white ring-2 ring-white">
                      {item.badge! > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[9.5px] font-bold leading-none tracking-tight transition-colors duration-300",
                    active ? "text-indigo-500" : "text-slate-400"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={onMenuToggle}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1 select-none cursor-pointer transition-transform duration-150 active:scale-[0.88]"
            type="button"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full">
              <Menu className="h-[18px] w-[18px] text-slate-400" />
            </span>
            <span className="text-[9.5px] font-bold leading-none tracking-tight text-slate-400">
              {t("menu")}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}
