import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { getEnabledModulesForUser } from "@/lib/modules/get-enabled";
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

  const enabledModules = await getEnabledModulesForUser();

  return (
    <DashboardShell user={user} enabledModules={enabledModules}>
      {children}
    </DashboardShell>
  );
}
