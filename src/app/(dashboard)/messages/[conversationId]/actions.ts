"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function getMessages(conversationId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return { messages: [], conversationName: "", conversationType: "direct" as const, members: [] };

  const supabase = await createServerClient();

  const { data: membership } = await supabase
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .single();

  if (!membership) return { messages: [], conversationName: "", conversationType: "direct" as const, members: [] };

  const { data: conv } = await supabase
    .from("conversations" as never)
    .select("name, type, class_id" as never)
    .eq("id" as never, conversationId)
    .single();

  const { data: messages } = await supabase
    .from("messages" as never)
    .select(`
      id, content, type, sender_id, reply_to_id,
      is_pinned, is_edited, is_deleted,
      created_at, edited_at,
      users:sender_id(first_name, last_name, avatar_url)
    ` as never)
    .eq("conversation_id" as never, conversationId)
    .order("created_at" as never, { ascending: true })
    .limit(100);

  const { data: members } = await supabase
    .from("conversation_members" as never)
    .select(`
      user_id, role,
      users!inner(first_name, last_name, avatar_url)
    ` as never)
    .eq("conversation_id" as never, conversationId);

  // Update last_read_at
  await supabase
    .from("conversation_members" as never)
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id);

  const convData = conv as Record<string, unknown> | null;
  let conversationName = (convData?.name as string) || "";
  if (!conversationName && convData?.type === "direct") {
    const otherMember = (members as Array<Record<string, unknown>> | null)?.find(
      (m) => m.user_id !== user.id
    );
    if (otherMember) {
      const u = otherMember.users as Record<string, unknown>;
      conversationName = `${u.first_name} ${u.last_name}`;
    }
  }

  const formattedMessages = ((messages as Array<Record<string, unknown>>) ?? []).map((msg) => {
    const sender = msg.users as Record<string, unknown> | null;
    return {
      id: msg.id as string,
      conversationId,
      senderId: msg.sender_id as string | null,
      senderName: sender ? `${sender.first_name} ${sender.last_name}` : "Система",
      senderAvatar: sender?.avatar_url as string | null,
      content: msg.content as string,
      type: msg.type as string,
      replyToId: msg.reply_to_id as string | null,
      isPinned: msg.is_pinned as boolean,
      isEdited: msg.is_edited as boolean,
      isDeleted: msg.is_deleted as boolean,
      createdAt: msg.created_at as string,
    };
  });

  const membersList = ((members as Array<Record<string, unknown>>) ?? []).map((m) => {
    const u = m.users as Record<string, unknown>;
    return {
      userId: m.user_id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      role: m.role as string,
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

  const canSend = await canPerformAction("messages", "messages.create");
  if (!canSend) return { error: "Дастрасӣ манъ аст" };

  const content = formData.get("content") as string;
  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) return { error: "Паём холӣ аст" };

  const supabase = await createServerClient();

  const { data: membership } = await supabase
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .single();

  if (!membership) return { error: "Шумо аъзои ин суҳбат нестед" };

  const { error } = await supabase
    .from("messages" as never)
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      school_id: user.schoolId,
      content: parsed.data.content,
      type: "text",
      reply_to_id: replyToId,
    } as never);

  if (error) return { error: "Хатои фиристодан" };

  await supabase
    .from("conversations" as never)
    .update({ updated_at: new Date().toISOString() } as never)
    .eq("id" as never, conversationId);

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
  if (!parsed.success) return { error: "Паём холӣ аст" };

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

  if (error) return { error: "Хатои таҳрир" };

  revalidatePath("/messages");
  return { error: null };
}

export async function deleteMessageAction(messageId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("messages" as never)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, messageId)
    .eq("sender_id" as never, user.id);

  revalidatePath("/messages");
}

export async function pinMessageAction(messageId: string, isPinned: boolean) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

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

  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

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

  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

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
