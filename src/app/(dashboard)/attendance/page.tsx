import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";

export default async function AttendancePage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");
  const t = await getTranslations();

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("modules.attendance")}</h1>
      <EmptyState
        icon={<ClipboardCheck className="h-16 w-16" />}
        title={t("modules.attendance")}
        description={t("modules.comingSoon")}
      />
    </div>
  );
}
