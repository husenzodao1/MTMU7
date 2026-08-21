import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFriendsList, getIncomingRequests, getOutgoingRequests } from "./actions";
import { FriendsView } from "./friends-view";

export default async function FriendsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("friends");

  const [friends, incoming, outgoing] = await Promise.all([
    getFriendsList(),
    getIncomingRequests(),
    getOutgoingRequests(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <FriendsView friends={friends} incoming={incoming} outgoing={outgoing} />
    </div>
  );
}
