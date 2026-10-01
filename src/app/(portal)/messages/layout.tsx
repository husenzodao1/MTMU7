import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConversationList, type ConversationSummary } from "@/features/messages/conversation-list";
import { MessagesFrame } from "@/features/messages/messages-frame";
import { NewConversationButton } from "@/features/messages/new-conversation";
import { can, hasRole } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const access = await requireModule("messages");
  if (!can(access, "messages.use")) redirect("/access-denied");
  const t = await getTranslations("portal.messages");
  const supabase = await createClient();

  const [{ data: conversations }, { data: school }] = await Promise.all([
    supabase.rpc("list_my_conversations", { p_limit: 200 }),
    supabase.from("schools").select("settings").eq("id", access.school!.id).maybeSingle(),
  ]);
  const settings = (school?.settings ?? {}) as Record<string, unknown>;
  const isStaff = access.roles.some((r) => !["student", "parent"].includes(r.slug));
  const canCreateGroup = isStaff || (hasRole(access, "student") && settings.messaging_students_create_groups === true);

  return (
    <MessagesFrame
      sidebar={
        <>
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h1 className="text-lg font-semibold text-ink">{t("title")}</h1>
            <NewConversationButton canCreateGroup={canCreateGroup} />
          </div>
          <ConversationList
            conversations={(conversations ?? []) as unknown as ConversationSummary[]}
            currentUserId={access.userId}
            timeZone={access.school!.timezone}
          />
        </>
      }
    >
      {children}
    </MessagesFrame>
  );
}
