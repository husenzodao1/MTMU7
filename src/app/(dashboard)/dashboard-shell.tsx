"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { UserWithRole } from "@/types/auth";

interface DashboardShellProps {
  user: UserWithRole;
  enabledModules: string[];
  children: React.ReactNode;
}

export function DashboardShell({ user, enabledModules, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user.roles.some((r) => r.slug === "admin");

  const handleMenuToggle = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar enabledModules={enabledModules} isAdmin={isAdmin} />
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={handleMenuClose}
        enabledModules={enabledModules}
        isAdmin={isAdmin}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuToggle={handleMenuToggle} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
