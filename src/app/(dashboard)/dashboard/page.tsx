import { getTranslations } from "next-intl/server";
import {
  Users,
  MessageSquare,
  BookOpen,
  Bell,
  GraduationCap,
  ClipboardList,
  School,
  UserCheck,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { getDashboardStats } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const t = await getTranslations();
  const stats = await getDashboardStats();

  if (!stats) redirect("/login");

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">
        {t("nav.dashboard")}
      </h1>

      {/* Admin / Director dashboard */}
      {stats.role === "admin" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("dashboard.totalUsers")}
              value={stats.totalUsers}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label={t("admin.totalClasses")}
              value={stats.totalClasses}
              icon={<School className="h-5 w-5" />}
            />
            <StatCard
              label={t("admin.pendingUsers")}
              value={stats.pendingRegistrations}
              icon={<ClipboardList className="h-5 w-5" />}
            />
            <StatCard
              label={t("dashboard.unreadNotifications")}
              value={stats.unreadNotifications}
              icon={<Bell className="h-5 w-5" />}
            />
          </div>
          {stats.pendingRegistrations > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-amber-800">
                  {stats.pendingRegistrations} {t("admin.pendingUsers")}
                </p>
                <Link
                  href="/admin/users?filter=pending"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  {t("admin.pendingUsersDesc")} →
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* Teacher dashboard */}
      {stats.role === "teacher" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("dashboard.totalUsers")}
            value={stats.totalUsers}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            label={t("dashboard.unreadNotifications")}
            value={stats.unreadNotifications}
            icon={<Bell className="h-5 w-5" />}
          />
          {stats.totalMessages !== null && (
            <StatCard
              label={t("dashboard.totalMessages")}
              value={stats.totalMessages}
              icon={<MessageSquare className="h-5 w-5" />}
            />
          )}
          {stats.totalLibraryItems !== null && (
            <StatCard
              label={t("dashboard.totalLibrary")}
              value={stats.totalLibraryItems}
              icon={<BookOpen className="h-5 w-5" />}
            />
          )}
        </div>
      )}

      {/* Student dashboard */}
      {stats.role === "student" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.studentClass && (
              <StatCard
                label={t("auth.selectClass")}
                value={stats.studentClass}
                icon={<GraduationCap className="h-5 w-5" />}
              />
            )}
            <StatCard
              label={t("dashboard.unreadNotifications")}
              value={stats.unreadNotifications}
              icon={<Bell className="h-5 w-5" />}
            />
            {stats.totalLibraryItems !== null && (
              <StatCard
                label={t("dashboard.totalLibrary")}
                value={stats.totalLibraryItems}
                icon={<BookOpen className="h-5 w-5" />}
              />
            )}
          </div>
        </>
      )}

      {/* Fallback for other roles */}
      {stats.role === "other" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("dashboard.totalUsers")}
            value={stats.totalUsers}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            label={t("dashboard.unreadNotifications")}
            value={stats.unreadNotifications}
            icon={<Bell className="h-5 w-5" />}
          />
          {stats.totalMessages !== null && (
            <StatCard
              label={t("dashboard.totalMessages")}
              value={stats.totalMessages}
              icon={<MessageSquare className="h-5 w-5" />}
            />
          )}
          {stats.totalLibraryItems !== null && (
            <StatCard
              label={t("dashboard.totalLibrary")}
              value={stats.totalLibraryItems}
              icon={<BookOpen className="h-5 w-5" />}
            />
          )}
        </div>
      )}
    </div>
  );
}
