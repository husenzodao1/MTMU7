import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getConversations } from "./actions";
import { ConversationsList } from "./conversations-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function MessagesPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("messages");
  const conversations = await getConversations();

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex w-full flex-col border-r border-neutral-200 lg:w-80 xl:w-96">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h1 className="text-lg font-semibold text-neutral-900">
            {t("title")}
          </h1>
          <Link href="/messages/new">
            <Button size="sm" variant="default">
              {t("newConversation")}
            </Button>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationsList
            conversations={conversations}
            currentUserId={user.id}
          />
        </div>
      </div>

      <div className="hidden flex-1 items-center justify-center lg:flex">
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title={t("startConversation")}
          description={t("noConversationsDesc")}
        />
      </div>
    </div>
  );
}
