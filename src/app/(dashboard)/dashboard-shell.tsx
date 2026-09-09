"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { createClient } from "@/lib/supabase/client";
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

export function DashboardShell({ user, enabledModules, notificationCount = 0, friendRequestCount, school, locale, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveCount, setLiveCount] = useState(notificationCount);
  const isAdmin = user.roles.some((r) => r.slug === "admin");

  // Keep liveCount in sync when server re-renders with a fresh count (after markAllAsRead etc.)
  const [prevNotifCount, setPrevNotifCount] = useState(notificationCount);
  if (prevNotifCount !== notificationCount) {
    setPrevNotifCount(notificationCount);
    setLiveCount(notificationCount);
  }

  // Realtime: increment badge whenever a new notification arrives for this user
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // RLS ensures we only get our own notifications, but double-check
          if (row.user_id !== user.id) return;
          setLiveCount((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.user_id !== user.id) return;
          // When a notification is marked as read, decrement if it was previously unread
          const old = payload.old as Record<string, unknown>;
          if (old.is_read === false && row.is_read === true) {
            setLiveCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user.id]);

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
        notificationCount={liveCount}
        friendRequestCount={friendRequestCount}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuToggle={handleMenuToggle} notificationCount={liveCount} locale={locale} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      <BottomNav
        notificationCount={liveCount}
        onMenuToggle={handleMenuToggle}
      />
    </div>
  );
}
