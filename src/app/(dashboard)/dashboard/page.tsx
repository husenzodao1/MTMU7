import { getTranslations } from "next-intl/server";
import {
  MessageSquare,
  BookOpen,
  Bell,
  ClipboardList,
  School,
  ArrowUpRight,
  Sparkles,
  Newspaper,
  User,
  ShieldCheck,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDashboardStats } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const t = await getTranslations();
  const stats = await getDashboardStats();

  if (!stats) redirect("/login");

  return (
    <div className="space-y-8 animate-in pb-8">
      {/* Top Welcome Context */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
              {t("nav.dashboard")}
            </h1>
            <Badge variant="pill" className="font-semibold text-[11px]">
              2030 Edition
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 font-medium mt-0.5">
            {t("common.appName")} • {t("dashboard.welcomeSubtitle")}
          </p>
        </div>
      </div>

      {/* Main Hero Card + Quick Actions (Inspired by Reference Design) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Hero Highlight Card */}
        <div className="relative overflow-hidden rounded-[28px] border border-indigo-100/90 bg-gradient-to-br from-[#E8EEFB] via-[#EEF2FC] to-[#DBE7FC] p-6 sm:p-8 shadow-sm lg:col-span-7 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">
              {stats.role === "admin"
                ? t("admin.systemStatus")
                : stats.role === "student" && stats.studentClass
                ? t("auth.selectClass")
                : t("common.appName")}
            </span>
            <div className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-neutral-800 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-primary-600" />
              <span>{stats.role.toUpperCase()}</span>
            </div>
          </div>

          <div className="my-6">
            <p className="text-xs font-semibold text-neutral-500">{t("dashboard.overviewStatus")}</p>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 mt-1">
              {stats.role === "student" && stats.studentClass
                ? stats.studentClass
                : stats.totalUsers > 0
                ? `${stats.totalUsers} ${t("dashboard.totalUsers").toLowerCase()}`
                : t("common.appName")}
            </p>
          </div>

          {/* 4 Tactile Circular Action Buttons (Reference pattern) */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-black/[0.05]">
            <Link href="/messages" className="flex flex-col items-center gap-1.5 group select-none">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-transform duration-[var(--duration-fast)] group-hover:scale-105 group-active:scale-95">
                <MessageSquare className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-neutral-700 text-center truncate max-w-full">
                {t("nav.messages")}
              </span>
            </Link>

            <Link href="/library" className="flex flex-col items-center gap-1.5 group select-none">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-transform duration-[var(--duration-fast)] group-hover:scale-105 group-active:scale-95">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-neutral-700 text-center truncate max-w-full">
                {t("nav.library")}
              </span>
            </Link>

            <Link href="/news" className="flex flex-col items-center gap-1.5 group select-none">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-transform duration-[var(--duration-fast)] group-hover:scale-105 group-active:scale-95">
                <Newspaper className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-neutral-700 text-center truncate max-w-full">
                {t("nav.news")}
              </span>
            </Link>

            <Link href="/profile" className="flex flex-col items-center gap-1.5 group select-none">
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm transition-transform duration-[var(--duration-fast)] group-hover:scale-105 group-active:scale-95">
                <User className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-neutral-700 text-center truncate max-w-full">
                {t("nav.profile")}
              </span>
            </Link>
          </div>
        </div>

        {/* Secondary Info / Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
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
          {stats.role === "admin" && (
            <>
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
            </>
          )}
          {stats.totalMessages !== null && stats.role !== "admin" && (
            <StatCard
              label={t("dashboard.totalMessages")}
              value={stats.totalMessages}
              icon={<MessageSquare className="h-5 w-5" />}
            />
          )}
        </div>
      </div>

      {/* Admin Action Alert Banner */}
      {stats.role === "admin" && stats.pendingRegistrations > 0 && (
        <div className="relative overflow-hidden rounded-[22px] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/70 to-amber-100/40 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 font-bold">
                <ShieldCheck className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900">
                  {stats.pendingRegistrations} {t("admin.pendingUsers")}
                </p>
                <p className="text-xs text-neutral-500">
                  {t("admin.pendingUsersDesc")}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="default" className="shrink-0 self-start sm:self-auto">
              <Link href="/admin/users?filter=pending" className="flex items-center gap-1.5">
                <span>{t("common.viewAll")}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Role-specific Quick Navigation Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">
            {t("dashboard.quickAccess")}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-neutral-300">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF2F8] text-neutral-900">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-neutral-900">{t("nav.messages")}</p>
                  <p className="text-xs text-neutral-500 font-medium">{t("messages.startChat")}</p>
                </div>
              </div>
              <Button asChild variant="outline" size="icon-sm">
                <Link href="/messages" aria-label={t("nav.messages")}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-neutral-300">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF2F8] text-neutral-900">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-neutral-900">{t("nav.library")}</p>
                  <p className="text-xs text-neutral-500 font-medium">{t("library.searchBooks")}</p>
                </div>
              </div>
              <Button asChild variant="outline" size="icon-sm">
                <Link href="/library" aria-label={t("nav.library")}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-neutral-300">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF2F8] text-neutral-900">
                  <Newspaper className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-neutral-900">{t("nav.news")}</p>
                  <p className="text-xs text-neutral-500 font-medium">{t("news.latestArticles")}</p>
                </div>
              </div>
              <Button asChild variant="outline" size="icon-sm">
                <Link href="/news" aria-label={t("nav.news")}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
