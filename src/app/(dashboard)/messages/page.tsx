import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getConversations } from "./actions";
import { ConversationsList } from "./conversations-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";

export default async function MessagesPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("messages");
  const conversations = await getConversations();

  return (
    <div className="flex h-[calc(100vh-4rem-5rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white animate-in lg:h-[calc(100vh-4rem)]">
      <div className="flex w-full flex-col lg:w-80 xl:w-96">
        <ConversationsList
          conversations={conversations}
          currentUserId={user.id}
        />
      </div>

      <div className="hidden flex-1 items-center justify-center border-l border-neutral-200 lg:flex">
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title={t("startConversation")}
          description={t("noConversationsDesc")}
        />
      </div>
    </div>
  );
}
