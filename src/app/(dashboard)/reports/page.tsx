"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { ReportsView } from "./reports-view";

async function getReportData() {
  const supabase = await createServerClient();
  const admin = await requireAdmin();

  const [
    usersResult,
    classesResult,
    subjectsResult,
    libraryResult,
    messagesResult,
    conversationsResult,
    notificationsResult,
  ] = await Promise.all([
    supabase
      .from("users" as never)
      .select("id, is_active, created_at" as never)
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("classes" as never)
      .select("id, name, grade_level, is_active" as never)
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("subjects" as never)
      .select("id, is_active" as never)
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("library_items" as never)
      .select("id, is_published" as never)
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("messages" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("conversations" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, admin.schoolId),
    supabase
      .from("notifications" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, admin.schoolId),
  ]);

  const users = (usersResult.data ?? []) as Array<Record<string, unknown>>;
  const classes = (classesResult.data ?? []) as Array<Record<string, unknown>>;
  const subjects = (subjectsResult.data ?? []) as Array<Record<string, unknown>>;
  const library = (libraryResult.data ?? []) as Array<Record<string, unknown>>;

  // Get role counts
  const { data: userRolesData } = await supabase
    .from("user_roles" as never)
    .select("user_id, roles:role_id(slug)" as never);
  const userRoles = (userRolesData ?? []) as Array<Record<string, unknown>>;

  const roleCounts: Record<string, number> = {};
  for (const ur of userRoles) {
    const role = ur.roles as Record<string, unknown>;
    const slug = role?.slug as string;
    if (slug) roleCounts[slug] = (roleCounts[slug] ?? 0) + 1;
  }

  return {
    users: {
      total: users.length,
      active: users.filter((u) => u.is_active === true).length,
      inactive: users.filter((u) => u.is_active !== true).length,
    },
    roles: roleCounts,
    classes: {
      total: classes.length,
      active: classes.filter((c) => c.is_active === true).length,
      byGrade: classes.reduce<Record<number, number>>(
        (acc, c) => {
          const grade = c.grade_level as number;
          acc[grade] = (acc[grade] ?? 0) + 1;
          return acc;
        },
        {}
      ),
    },
    subjects: {
      total: subjects.length,
      active: subjects.filter((s) => s.is_active === true).length,
    },
    library: {
      total: library.length,
      published: library.filter((l) => l.is_published === true).length,
    },
    messages: {
      total: messagesResult.count ?? 0,
    },
    conversations: {
      total: conversationsResult.count ?? 0,
    },
    notifications: {
      total: notificationsResult.count ?? 0,
    },
  };
}

export default async function ReportsPage() {
  await requireAdmin();
  const t = await getTranslations();
  const data = await getReportData();

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("reports.title")}</h1>
      <ReportsView data={data} />
    </div>
  );
}
