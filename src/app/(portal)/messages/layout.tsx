import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ConversationList, type ConversationSummary } from "@/features/messages/conversation-list";
import { MessagesFrame } from "@/features/messages/messages-frame";
import type { StoryAuthor } from "@/features/messages/stories";
import { can, displayName, hasRole } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const access = await requireModule("messages");
  if (!can(access, "messages.use")) redirect("/access-denied");
  const supabase = await createClient();

  // The stories come with the list, in the same round. Before 00094 the
  // function is not there: no row of stories then, and nothing else changes.
  const [{ data: conversations }, { data: school }, feed] = await Promise.all([
    supabase.rpc("list_my_conversations", { p_limit: 200 }),
    supabase.from("schools").select("settings").eq("id", access.school!.id).maybeSingle(),
    supabase.rpc("get_story_feed"),
  ]);
  const settings = (school?.settings ?? {}) as Record<string, unknown>;
  const isStaff = access.roles.some((r) => !["student", "parent"].includes(r.slug));
  const canCreateGroup = isStaff || (hasRole(access, "student") && settings.messaging_students_create_groups === true);
  const ready = !feed.error;
  const rows = (conversations ?? []) as unknown as ConversationSummary[];

  return (
    <MessagesFrame
      base={{ currentUserId: access.userId, timeZone: access.school!.timezone, schoolId: access.school!.id, canMessage: true }}
      conversations={rows.map((c) => ({ id: c.id, newestAt: c.last_message_at, memberCount: c.member_count ?? null }))}
      sidebar={
        <ConversationList
          conversations={rows}
          currentUserId={access.userId}
          timeZone={access.school!.timezone}
          canCreateGroup={canCreateGroup}
          stories={ready ? ((feed.data ?? []) as unknown as StoryAuthor[]) : null}
          me={{ id: access.userId, name: displayName(access), avatarUrl: access.avatarUrl }}
          schoolId={access.school!.id}
          channelsEnabled={ready}
        />
      }
    >
      {children}
    </MessagesFrame>
  );
}
