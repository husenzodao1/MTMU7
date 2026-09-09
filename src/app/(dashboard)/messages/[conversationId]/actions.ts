"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function getMessages(conversationId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .eq("school_id" as never, user.schoolId)
    .single();

  if (!membership) return { messages: [], conversationName: "", conversationType: "direct" as const, members: [] };

  const [convResult, messagesResult, membersResult] = await Promise.all([
    admin
      .from("conversations" as never)
      .select("name, type, class_id" as never)
      .eq("id" as never, conversationId)
      .single(),
    admin
      .from("messages" as never)
      .select("id, content, type, sender_id, reply_to_id, is_pinned, is_edited, is_deleted, created_at, edited_at" as never)
      .eq("conversation_id" as never, conversationId)
      .eq("is_deleted" as never, false)
      .order("created_at" as never, { ascending: true })
      .limit(100),
    admin
      .from("conversation_members" as never)
      .select("user_id, role, last_read_at" as never)
      .eq("conversation_id" as never, conversationId),
  ]);

  // Update last_read_at in background
  admin
    .from("conversation_members" as never)
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .then(() => {});

  const msgs = (messagesResult.data as Array<Record<string, unknown>>) ?? [];
  const memberRows = (membersResult.data as Array<Record<string, unknown>>) ?? [];

  const allUserIds = new Set<string>();
  for (const msg of msgs) {
    if (msg.sender_id) allUserIds.add(msg.sender_id as string);
  }
  for (const m of memberRows) {
    allUserIds.add(m.user_id as string);
  }

  const { data: usersData } = await admin
    .from("users" as never)
    .select("id, first_name, last_name, avatar_url" as never)
    .in("id" as never, Array.from(allUserIds));

  const usersMap = new Map<string, { first_name: string; last_name: string; avatar_url: string | null }>();
  for (const u of (usersData as Array<Record<string, unknown>>) ?? []) {
    usersMap.set(u.id as string, {
      first_name: u.first_name as string,
      last_name: u.last_name as string,
      avatar_url: u.avatar_url as string | null,
    });
  }

  const convData = convResult.data as Record<string, unknown> | null;
  let conversationName = (convData?.name as string) || "";
  if (!conversationName && convData?.type === "direct") {
    const otherMember = memberRows.find((m) => m.user_id !== user.id);
    if (otherMember) {
      const u = usersMap.get(otherMember.user_id as string);
      if (u) conversationName = `${u.first_name} ${u.last_name}`;
    }
  }

  // Fetch favorites and per-user deletions (requires migration 00021)
  const msgIds = msgs.map((m) => m.id as string);
  let favoritedIds = new Set<string>();
  let myDeletedIds = new Set<string>();
  if (msgIds.length > 0) {
    const [favResult, delResult] = await Promise.all([
      admin.from("message_favorites" as never).select("message_id" as never)
        .eq("user_id" as never, user.id).in("message_id" as never, msgIds),
      admin.from("message_deletions" as never).select("message_id" as never)
        .eq("user_id" as never, user.id).in("message_id" as never, msgIds),
    ]);
    favoritedIds = new Set(((favResult.data ?? []) as Array<{ message_id: string }>).map((f) => f.message_id));
    myDeletedIds = new Set(((delResult.data ?? []) as Array<{ message_id: string }>).map((d) => d.message_id));
  }

  const formattedMessages = msgs
    .filter((msg) => !myDeletedIds.has(msg.id as string))
    .map((msg) => {
    const sender = usersMap.get(msg.sender_id as string);
    return {
      id: msg.id as string,
      conversationId,
      senderId: msg.sender_id as string | null,
      senderName: sender ? `${sender.first_name} ${sender.last_name}` : "System",
      senderAvatar: sender?.avatar_url ?? null,
      content: msg.content as string,
      type: msg.type as string,
      replyToId: msg.reply_to_id as string | null,
      isPinned: msg.is_pinned as boolean,
      isEdited: msg.is_edited as boolean,
      isDeleted: msg.is_deleted as boolean,
      isFavorited: favoritedIds.has(msg.id as string),
      createdAt: msg.created_at as string,
    };
  });

  const membersList = memberRows.map((m) => {
    const u = usersMap.get(m.user_id as string);
    return {
      userId: m.user_id as string,
      firstName: u?.first_name ?? "",
      lastName: u?.last_name ?? "",
      avatarUrl: u?.avatar_url ?? null,
      role: m.role as string,
      lastReadAt: m.last_read_at as string | null,
    };
  });

  return {
    messages: formattedMessages,
    conversationName,
    conversationType: (convData?.type as string) ?? "direct",
    members: membersList,
  };
}

export async function sendMessageAction(
  conversationId: string,
  replyToId: string | null,
  _prev: { error: string | null },
  formData: FormData
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const content = formData.get("content") as string;
  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) return { error: "emptyMessage" };

  // Use admin client to bypass RLS for membership check and message insert
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .eq("school_id" as never, user.schoolId)
    .single();

  if (!membership) return { error: "notMember" };

  const [insertResult] = await Promise.all([
    admin
      .from("messages" as never)
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        school_id: user.schoolId,
        content: parsed.data.content,
        type: "text",
        reply_to_id: replyToId,
      } as never),
    admin
      .from("conversations" as never)
      .update({ updated_at: new Date().toISOString() } as never)
      .eq("id" as never, conversationId),
  ]);

  if (insertResult.error) return { error: "sendError" };

  // Create notifications for all other conversation members (best-effort)
  try {
    const { data: otherMembers } = await admin
      .from("conversation_members" as never)
      .select("user_id, school_id" as never)
      .eq("conversation_id" as never, conversationId)
      .neq("user_id" as never, user.id);
    if (otherMembers && (otherMembers as Array<Record<string, unknown>>).length > 0) {
      const senderName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "User";
      await admin.from("notifications" as never).insert(
        (otherMembers as Array<{ user_id: string; school_id: string }>).map((m) => ({
          user_id: m.user_id,
          school_id: m.school_id,
          type: "message",
          module: "messages",
          title: senderName,
          body: parsed.data.content.slice(0, 200),
          data: { conversation_id: conversationId },
        })) as never
      );
    }
  } catch {
    // Non-critical — message was sent, notification creation is best-effort
  }

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { error: null };
}

export async function editMessageAction(
  messageId: string,
  _prev: { error: string | null },
  formData: FormData
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const content = formData.get("content") as string;
  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) return { error: "emptyMessage" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("messages" as never)
    .update({
      content: parsed.data.content,
      is_edited: true,
      edited_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, messageId)
    .eq("sender_id" as never, user.id);

  if (error) return { error: "editError" };

  revalidatePath("/messages");
  return { error: null };
}

// Delete for everyone (only own messages) — sets is_deleted on the message row
export async function deleteMessageAction(messageId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  await admin
    .from("messages" as never)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, messageId)
    .eq("sender_id" as never, user.id);

  revalidatePath("/messages");
}

// Delete for me only — inserts into message_deletions (requires migration 00021)
export async function deleteForMeAction(messageId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  await admin
    .from("message_deletions" as never)
    .insert({ user_id: user.id, message_id: messageId } as never);
}

// Toggle favorite (requires migration 00021)
export async function toggleFavoriteAction(messageId: string, isFavorited: boolean) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  if (isFavorited) {
    await admin
      .from("message_favorites" as never)
      .delete()
      .eq("user_id" as never, user.id)
      .eq("message_id" as never, messageId);
  } else {
    await admin
      .from("message_favorites" as never)
      .insert({ user_id: user.id, message_id: messageId, school_id: user.schoolId } as never);
  }
}

export async function pinMessageAction(messageId: string, isPinned: boolean) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("messages" as never)
    .update({ is_pinned: isPinned } as never)
    .eq("id" as never, messageId);

  revalidatePath("/messages");
}

export async function addMemberAction(conversationId: string, userId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      school_id: user.schoolId,
      role: "member",
    } as never);

  revalidatePath("/messages");
}

export async function removeMemberAction(conversationId: string, userId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .delete()
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, userId);

  revalidatePath("/messages");
}

export async function leaveConversationAction(conversationId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .delete()
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id);

  redirect("/messages");
}
