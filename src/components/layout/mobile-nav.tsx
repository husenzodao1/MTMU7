"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems } from "./nav-items";
import { Button } from "@/components/ui/button";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  enabledModules: string[];
  isAdmin: boolean;
  school?: { name: string; logoUrl: string | null };
}

export function MobileNav({ isOpen, onClose, enabledModules, isAdmin, school }: MobileNavProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const overlayRef = useRef<HTMLDivElement>(null);

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

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

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
          "fixed inset-y-0 left-0 z-[201] w-72 bg-white shadow-xl transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4">
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
            <span className="font-semibold text-neutral-900">{school?.name ?? t("common.appName")}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {filteredMain.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary-600" : "text-neutral-400")} />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-neutral-200" />

          <ul className="space-y-1">
            {filteredBottom.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary-600" : "text-neutral-400")} />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
