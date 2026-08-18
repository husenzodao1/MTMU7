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
}

export function Sidebar({ enabledModules, isAdmin, school }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations();

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-6">
        {school?.logoUrl ? (
          <img
            src={school.logoUrl}
            alt={school.name}
            className="h-8 w-8 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
            {(school?.name ?? "М").charAt(0)}
          </div>
        )}
        <span className="font-semibold text-neutral-900">{school?.name ?? "МТМУ №7"}</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {filteredMain.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} />
          ))}
        </ul>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-neutral-200 p-3">
        <ul className="space-y-1">
          {filteredBottom.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function NavLink({ item, isActive, t }: { item: NavItem; isActive: boolean; t: ReturnType<typeof useTranslations> }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale",
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-600" : "text-neutral-400")} />
        {t(item.label)}
      </Link>
    </li>
  );
}
