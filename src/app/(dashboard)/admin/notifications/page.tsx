import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { NotificationSettings } from "./notification-settings";
import { ErrorState } from "@/components/ui/error-state";

export default async function NotificationsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");

  const canManage = await hasPermission("notifications.manage");
  if (!canManage) {
    return (
      <div>
        <AdminNav />
        <ErrorState
          title={tErrors("forbidden")}
          description={tErrors("forbiddenDescription")}
        />
      </div>
    );
  }

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("notification_settings" as never)
    .select("id, type, is_enabled" as never)
    .order("type" as never);

  const settings = (
    (data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    isEnabled: row.is_enabled as boolean,
  }));

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("notifications")}
        </h1>
        <NotificationSettings settings={settings} />
      </div>
    </div>
  );
}
