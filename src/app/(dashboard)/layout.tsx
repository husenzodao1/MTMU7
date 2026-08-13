import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { getEnabledModulesForUser } from "@/lib/modules/get-enabled";
import { getUnreadCount } from "./notifications/actions";
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

  const [enabledModules, notificationCount] = await Promise.all([
    getEnabledModulesForUser(),
    getUnreadCount(),
  ]);

  return (
    <DashboardShell user={user} enabledModules={enabledModules} notificationCount={notificationCount}>
      {children}
    </DashboardShell>
  );
}
