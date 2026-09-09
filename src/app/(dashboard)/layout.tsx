import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { getEnabledModulesForUser } from "@/lib/modules/get-enabled";
import { getUnreadCount } from "./notifications/actions";
import { getPendingFriendCount } from "./friends/actions";
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

  // Status enforcement moved from middleware (caused timeout) to server component.
  if (user.status === "pending" || user.status === "rejected") {
    redirect("/pending");
  }

  const supabase = await createServerClient();
  const [enabledModules, notificationCount, friendRequestCount, schoolResult] = await Promise.all([
    getEnabledModulesForUser(),
    getUnreadCount(),
    getPendingFriendCount(),
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

  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "tg";

  return (
    <DashboardShell user={user} enabledModules={enabledModules} notificationCount={notificationCount} friendRequestCount={friendRequestCount} school={schoolInfo} locale={locale}>
      {children}
    </DashboardShell>
  );
}
