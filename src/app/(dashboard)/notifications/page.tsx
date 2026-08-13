import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getNotifications } from "./actions";
import { NotificationList } from "./notification-list";

export default async function NotificationsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("notifications");
  const notifications = await getNotifications();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
