"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems, type NavItem } from "./nav-items";

interface SidebarProps {
  enabledModules: string[];
  isAdmin: boolean;
  school?: { name: string; logoUrl: string | null };
  friendRequestCount?: number;
}

export function Sidebar({ enabledModules, isAdmin, school, friendRequestCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations();

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-neutral-200/70 lg:bg-[#EEF2F8]/95 lg:backdrop-blur-sm">
      {/* Brand Identity / Logo Header */}
      <div className="flex h-20 items-center gap-3 px-6">
        <img
          src={school?.logoUrl ?? "/school.png"}
          alt={school?.name ?? "МТМУ №7"}
          className="h-10 w-10 shrink-0 rounded-2xl object-cover ring-2 ring-white/80 shadow-xs"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-bold text-neutral-900 text-sm tracking-tight">
            {school?.name ?? "МТМУ №7"}
          </span>
          <span className="block text-[11px] font-medium text-neutral-500 tracking-normal">
            Digital Platform
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-2">
        <ul className="space-y-1.5">
          {filteredMain.map((item) => {
            const badge = item.href === "/friends" ? friendRequestCount : 0;
            return (
              <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} badge={badge} />
            );
          })}
        </ul>
      </nav>

      {/* Bottom Navigation / Settings / Admin */}
      <div className="border-t border-neutral-200/60 p-3.5">
        <ul className="space-y-1.5">
          {filteredBottom.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function NavLink({ item, isActive, t, badge = 0 }: { item: NavItem; isActive: boolean; t: ReturnType<typeof useTranslations>; badge?: number }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale select-none",
          isActive
            ? "bg-neutral-900 text-white shadow-sm font-semibold"
            : "text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900"
        )}
      >
        <Icon className={cn("h-4.5 w-4.5 shrink-0 transition-colors", isActive ? "text-white" : "text-neutral-500")} />
        <span className="flex-1 truncate">{t(item.label)}</span>
        {badge > 0 && (
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
              isActive ? "bg-white text-neutral-900" : "bg-error-500 text-white"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    </li>
  );
}
