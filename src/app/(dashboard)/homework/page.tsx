import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";

export default async function HomeworkPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");
  const t = await getTranslations();

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("modules.homework")}</h1>
      <EmptyState
        icon={<FileText className="h-16 w-16" />}
        title={t("modules.homework")}
        description={t("modules.comingSoon")}
      />
    </div>
  );
}
