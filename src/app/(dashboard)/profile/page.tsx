import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFullProfile } from "./actions";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("profile");
  const profile = await getFullProfile();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
