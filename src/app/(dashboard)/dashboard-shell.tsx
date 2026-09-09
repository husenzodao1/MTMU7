"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import type { UserWithRole } from "@/types/auth";

interface SchoolInfo {
  name: string;
  logoUrl: string | null;
}

interface DashboardShellProps {
  user: UserWithRole;
  enabledModules: string[];
  notificationCount?: number;
  friendRequestCount?: number;
  school?: SchoolInfo;
  locale?: string;
  children: React.ReactNode;
}

export function DashboardShell({ user, enabledModules, notificationCount, friendRequestCount, school, locale, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user.roles.some((r) => r.slug === "admin");

  const handleMenuToggle = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F6F8FC]">
      <Sidebar enabledModules={enabledModules} isAdmin={isAdmin} school={school} friendRequestCount={friendRequestCount} />
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={handleMenuClose}
        enabledModules={enabledModules}
        isAdmin={isAdmin}
        school={school}
        user={user}
        notificationCount={notificationCount}
        friendRequestCount={friendRequestCount}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuToggle={handleMenuToggle} notificationCount={notificationCount} locale={locale} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      <BottomNav
        notificationCount={notificationCount}
        onMenuToggle={handleMenuToggle}
      />
    </div>
  );
}
