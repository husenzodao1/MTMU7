"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { isModuleAccessible } from "@/lib/modules/check";

export interface DashboardStats {
  role: "student" | "teacher" | "admin" | "other";
  userName: string;
  unreadNotifications: number;
  totalMessages: number | null;
  totalLibraryItems: number | null;
  totalUsers: number;
  totalClasses: number;
  pendingRegistrations: number;
  studentClass: string | null;
  totalStudents: number;
  totalTeachers: number;
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();
  const roleSlugs = user.roles.map((r) => r.slug);
  const isAdmin = roleSlugs.includes("admin");
  const isTeacher = roleSlugs.includes("teacher");

  let role: DashboardStats["role"] = "other";
  if (isAdmin) role = "admin";
  else if (isTeacher) role = "teacher";
  else if (roleSlugs.includes("student")) role = "student";

  const [
    notificationsResult,
    canAccessMessages,
    canAccessLibrary,
    usersResult,
    classesResult,
  ] = await Promise.all([
    supabase
      .from("notifications" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("user_id" as never, user.id)
      .eq("is_read" as never, false),
    isModuleAccessible("messages"),
    isModuleAccessible("library"),
    supabase
      .from("users" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId)
      .eq("is_active" as never, true),
    supabase
      .from("classes" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId)
      .eq("is_active" as never, true),
  ]);

  let totalMessages: number | null = null;
  let totalLibraryItems: number | null = null;
  let pendingRegistrations = 0;
  let studentClass: string | null = null;

  const promises: Array<Promise<void>> = [];

  if (canAccessMessages) {
    promises.push(
      (async () => {
        const { count } = await supabase
          .from("messages" as never)
          .select("id" as never, { count: "exact", head: true })
          .eq("school_id" as never, user.schoolId);
        totalMessages = count ?? 0;
      })()
    );
  }

  if (canAccessLibrary) {
    promises.push(
      (async () => {
        const { count } = await supabase
          .from("library_items" as never)
          .select("id" as never, { count: "exact", head: true })
          .eq("school_id" as never, user.schoolId)
          .eq("is_published" as never, true);
        totalLibraryItems = count ?? 0;
      })()
    );
  }

  if (isAdmin) {
    promises.push(
      (async () => {
        const { count } = await supabase
          .from("users" as never)
          .select("id" as never, { count: "exact", head: true })
          .eq("school_id" as never, user.schoolId)
          .eq("status" as never, "pending");
        pendingRegistrations = count ?? 0;
      })()
    );
  }

  if (role === "student") {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from("student_classes" as never)
          .select("classes(name)" as never)
          .eq("student_id" as never, user.id)
          .eq("is_current" as never, true)
          .single();
        const row = data as Record<string, unknown> | null;
        const cls = row?.classes as Record<string, unknown> | null;
        studentClass = (cls?.name as string) ?? null;
      })()
    );
  }

  await Promise.all(promises);

  return {
    role,
    userName: user.firstName ?? "",
    unreadNotifications: notificationsResult.count ?? 0,
    totalMessages,
    totalLibraryItems,
    totalUsers: usersResult.count ?? 0,
    totalClasses: classesResult.count ?? 0,
    pendingRegistrations,
    studentClass,
    totalStudents: 0,
    totalTeachers: 0,
  };
}
