import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { getMessages } from "./actions";
import { getConversations } from "../actions";
import { ConversationView } from "./conversation-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const [messageData, conversations, canManage] = await Promise.all([
    getMessages(conversationId),
    getConversations(),
    canPerformAction("messages", "messages.manage"),
  ]);

  return (
    <ConversationView
      conversationId={conversationId}
      currentUserId={user.id}
      messages={messageData.messages}
      conversationName={messageData.conversationName}
      conversationType={messageData.conversationType}
      members={messageData.members}
      conversations={conversations}
      canManage={canManage}
    />
  );
}
