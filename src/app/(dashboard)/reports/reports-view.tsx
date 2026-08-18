"use client";

import { useTranslations } from "next-intl";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  GraduationCap,
  BookOpen,
  MessageSquare,
  Bell,
  UserCheck,
  UserX,
  Layers,
} from "lucide-react";

interface ReportData {
  users: { total: number; active: number; inactive: number };
  roles: Record<string, number>;
  classes: { total: number; active: number; byGrade: Record<number, number> };
  subjects: { total: number; active: number };
  library: { total: number; published: number };
  messages: { total: number };
  conversations: { total: number };
  notifications: { total: number };
}

export function ReportsView({ data }: { data: ReportData }) {
  const t = useTranslations();

  const roleLabels: Record<string, string> = {
    admin: t("admin.adminsFilter"),
    director: t("admin.directorsFilter"),
    vice_principal: t("admin.vicePrincipalsFilter"),
    teacher: t("admin.teachersFilter"),
    student: t("admin.studentsFilter"),
  };

  return (
    <div className="space-y-8">
      {/* Users Overview */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-800">
          {t("reports.usersReport")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("reports.totalCount")}
            value={data.users.total}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            label={t("reports.activeCount")}
            value={data.users.active}
            icon={<UserCheck className="h-5 w-5" />}
          />
          <StatCard
            label={t("reports.pendingCount")}
            value={data.users.inactive}
            icon={<UserX className="h-5 w-5" />}
          />
        </div>

        {/* Role breakdown */}
        {Object.keys(data.roles).length > 0 && (
          <div className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.roles")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(data.roles).map(([slug, count]) => (
                    <div
                      key={slug}
                      className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-neutral-700">
                        {roleLabels[slug] ?? slug}
                      </span>
                      <span className="text-lg font-semibold text-neutral-900">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Classes & Subjects */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-800">
          {t("reports.classesReport")} & {t("reports.teachersReport")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("admin.totalClasses")}
            value={data.classes.total}
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <StatCard
            label={t("admin.totalSubjects")}
            value={data.subjects.total}
            icon={<Layers className="h-5 w-5" />}
          />
        </div>

        {/* Grade breakdown */}
        {Object.keys(data.classes.byGrade).length > 0 && (
          <div className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("reports.classesReport")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {Object.entries(data.classes.byGrade)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([grade, count]) => (
                      <div
                        key={grade}
                        className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-2"
                      >
                        <span className="text-sm text-neutral-600">
                          {grade}-{t("admin.classes").toLowerCase()}
                        </span>
                        <span className="font-semibold text-neutral-900">{count}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Library */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-800">
          {t("reports.libraryReport")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("reports.totalCount")}
            value={data.library.total}
            icon={<BookOpen className="h-5 w-5" />}
          />
          <StatCard
            label={t("reports.activeCount")}
            value={data.library.published}
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      </section>

      {/* Communication */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-800">
          {t("reports.messagesReport")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("reports.messagesReport")}
            value={data.messages.total}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            label={t("messages.conversations")}
            value={data.conversations.total}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            label={t("notifications.title")}
            value={data.notifications.total}
            icon={<Bell className="h-5 w-5" />}
          />
        </div>
      </section>
    </div>
  );
}
