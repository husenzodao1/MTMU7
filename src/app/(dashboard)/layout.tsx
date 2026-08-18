import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { getEnabledModulesForUser } from "@/lib/modules/get-enabled";
import { getUnreadCount } from "./notifications/actions";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserWithRole();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createServerClient();
  const [enabledModules, notificationCount, schoolResult] = await Promise.all([
    getEnabledModulesForUser(),
    getUnreadCount(),
    supabase
      .from("schools" as never)
      .select("short_name, logo_url" as never)
      .eq("id" as never, user.schoolId)
      .single(),
  ]);

  const schoolRow = schoolResult.data as Record<string, unknown> | null;
  const schoolInfo = {
    name: (schoolRow?.short_name as string) ?? "МТМУ №7",
    logoUrl: (schoolRow?.logo_url as string | null) ?? null,
  };

  return (
    <DashboardShell user={user} enabledModules={enabledModules} notificationCount={notificationCount} school={schoolInfo}>
      {children}
    </DashboardShell>
  );
}
