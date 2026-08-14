import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserSettings } from "./actions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("settings");
  const settings = await getUserSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
