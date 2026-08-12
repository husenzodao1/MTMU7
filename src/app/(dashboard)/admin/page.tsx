import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "./admin-nav";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  GraduationCap,
  BookOpen,
  Boxes,
  FileText,
  ScrollText,
} from "lucide-react";
import Link from "next/link";

async function getAdminStats() {
  const supabase = await createServerClient();

  const [users, classes, subjects, books, modules] = await Promise.all([
    supabase
      .from("users" as never)
      .select("id" as never, { count: "exact", head: true }),
    supabase
      .from("classes" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("is_active" as never, true),
    supabase
      .from("subjects" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("is_active" as never, true),
    supabase
      .from("library_items" as never)
      .select("id" as never, { count: "exact", head: true }),
    supabase
      .from("school_modules" as never)
      .select("module_id" as never, { count: "exact", head: true })
      .eq("is_enabled" as never, true),
  ]);

  return {
    totalUsers: users.count ?? 0,
    totalClasses: classes.count ?? 0,
    totalSubjects: subjects.count ?? 0,
    totalBooks: books.count ?? 0,
    activeModules: modules.count ?? 0,
  };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const stats = await getAdminStats();

  const quickActions = [
    { label: t("addUser"), href: "/admin/users", icon: Users },
    { label: t("manageModules"), href: "/admin/modules", icon: Boxes },
    { label: t("editContent"), href: "/admin/content", icon: FileText },
    { label: t("viewAuditLog"), href: "/admin/audit", icon: ScrollText },
  ];

  return (
    <div>
      <AdminNav />

      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">
          {t("dashboard")}
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label={t("totalUsers")}
            value={stats.totalUsers}
            icon={<Users className="h-6 w-6" />}
          />
          <StatCard
            label={t("totalClasses")}
            value={stats.totalClasses}
            icon={<GraduationCap className="h-6 w-6" />}
          />
          <StatCard
            label={t("totalSubjects")}
            value={stats.totalSubjects}
            icon={<BookOpen className="h-6 w-6" />}
          />
          <StatCard
            label={t("totalBooks")}
            value={stats.totalBooks}
            icon={<BookOpen className="h-6 w-6" />}
          />
          <StatCard
            label={t("activeModules")}
            value={stats.activeModules}
            icon={<Boxes className="h-6 w-6" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3"
                    >
                      <Icon className="h-4 w-4 text-primary-600" />
                      {action.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
