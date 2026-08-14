import { getTranslations } from "next-intl/server";
import { Users, MessageSquare, BookOpen, Bell } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { getDashboardStats } from "./actions";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const t = await getTranslations();
  const stats = await getDashboardStats();

  if (!stats) redirect("/login");

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">
        {t("nav.dashboard")}
      </h1>

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
    </div>
  );
}
