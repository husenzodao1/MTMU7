import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicProfile } from "../actions";
import { PublicProfileView } from "./public-profile-view";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const { id } = await params;

  if (id === user.id) {
    redirect("/profile");
  }

  const profile = await getPublicProfile(id);
  if (!profile) redirect("/dashboard");

  const t = await getTranslations("profile");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("userProfile")}</h1>
      <PublicProfileView profile={profile} currentUserId={user.id} />
    </div>
  );
}
