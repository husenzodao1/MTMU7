"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_MAX_LENGTH, REPORT_REASONS, type ContactResult, type ThreadMessage } from "@/features/messages/types";


async function requireMessaging() {
  const access = await getAccess();
  if (!access?.school) return null;
  return access;
}

export async function searchContactsAction(query: string): Promise<ActionResult<ContactResult[]>> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const term = z.string().trim().min(2).max(60).safeParse(query);
  if (!term.success) return success(undefined, []);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_message_contacts", { p_query: term.data, p_limit: 20 });
  if (error) return mapDbError(error);
  return success(undefined, (data ?? []) as unknown as ContactResult[]);
}

export async function startDirectConversationAction(userId: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  if (!uuid.safeParse(userId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_direct_conversation", { p_target_user_id: userId });
  if (error || !data) return mapDbError(error);
  revalidatePath("/messages", "layout");
  redirect(`/messages/${data}`);
}

export async function createGroupAction(name: string, memberIds: string[]): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z
    .object({ name: z.string().trim().min(1, "validation.required").max(100, "validation.too_big"), memberIds: z.array(uuid).min(1).max(300) })
    .safeParse({ name, memberIds });
  if (!parsed.success) return failure("errors.invalid_group_name");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group_conversation", { p_name: parsed.data.name, p_member_ids: parsed.data.memberIds });
  if (error || !data) return mapDbError(error);
  revalidatePath("/messages", "layout");
  redirect(`/messages/${data}`);
}

export async function editMessageAction(messageId: string, content: string): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  const parsed = z.object({ messageId: uuid, content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH) }).safeParse({ messageId, content });
  if (!parsed.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("messages")
    .update({ content: parsed.data.content }, { count: "exact" })
    .eq("id", parsed.data.messageId)
    .eq("sender_id", access.userId);
  if (error) return mapDbError(error);
  if (!count) return failure("errors.forbidden");
  return success();
}

export async function deleteMessageAction(messageId: string, scope: "everyone" | "me"): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  if (!uuid.safeParse(messageId).success || !["everyone", "me"].includes(scope)) return failure("errors.invalid");
  const supabase = await createClient();
  if (scope === "everyone") {
    const { error, count } = await supabase
      .from("messages")
      .update({ is_deleted: true }, { count: "exact" })
      .eq("id", messageId)
      .eq("sender_id", access.userId);
    if (error) return mapDbError(error);
    if (!count) return failure("errors.forbidden");
  } else {
    const { error } = await supabase.from("message_deletions").insert({ message_id: messageId, user_id: access.userId });
    if (error && error.code !== "23505") return mapDbError(error);
  }
  return success();
}

export async function toggleMessageFavoriteAction(messageId: string, favorite: boolean): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  if (!uuid.safeParse(messageId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = favorite
    ? await supabase.from("message_favorites").insert({ message_id: messageId, user_id: access.userId, school_id: access.school!.id })
    : await supabase.from("message_favorites").delete().eq("message_id", messageId).eq("user_id", access.userId);
  if (error && error.code !== "23505") return mapDbError(error);
  return success();
}

export async function setMessagePinnedAction(messageId: string, pinned: boolean): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  if (!uuid.safeParse(messageId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_message_pinned", { p_message_id: messageId, p_pinned: pinned });
  if (error) return mapDbError(error);
  return success();
}

export async function reportMessageAction(messageId: string, reason: string, details: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z
    .object({ messageId: uuid, reason: z.enum(REPORT_REASONS), details: z.string().trim().max(1000) })
    .safeParse({ messageId, reason, details });
  if (!parsed.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_message", {
    p_message_id: parsed.data.messageId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details || undefined,
  });
  if (error) return mapDbError(error);
  return success("portal.messages.reported");
}

export async function setBlockedAction(userId: string, blocked: boolean): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  if (!uuid.safeParse(userId).success || userId === access.userId) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = blocked
    ? await supabase.from("user_blocks").insert({ blocker_id: access.userId, blocked_id: userId, school_id: access.school!.id })
    : await supabase.from("user_blocks").delete().eq("blocker_id", access.userId).eq("blocked_id", userId);
  if (error && error.code !== "23505") return mapDbError(error);
  revalidatePath("/messages", "layout");
  return success(blocked ? "portal.messages.blocked" : "portal.messages.unblocked");
}

export async function loadOlderMessagesAction(conversationId: string, beforeCreatedAt: string, beforeId: string): Promise<ActionResult<ThreadMessage[]>> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z.object({ conversationId: uuid, beforeCreatedAt: z.string().datetime({ offset: true }), beforeId: uuid }).safeParse({ conversationId, beforeCreatedAt, beforeId });
  if (!parsed.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_conversation_messages", {
    p_conversation_id: parsed.data.conversationId,
    p_before_created_at: parsed.data.beforeCreatedAt,
    p_before_id: parsed.data.beforeId,
    p_limit: 50,
  });
  if (error) return mapDbError(error);
  return success(undefined, (data ?? []) as unknown as ThreadMessage[]);
}

export async function fetchMessageAction(conversationId: string, messageId: string): Promise<ActionResult<ThreadMessage | null>> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  if (!uuid.safeParse(conversationId).success || !uuid.safeParse(messageId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { data: row } = await supabase.from("messages").select("created_at").eq("id", messageId).maybeSingle();
  if (!row) return success(undefined, null);
  // The cursor is exclusive, so ask for the page just after this message and keep the exact match.
  const justAfter = new Date(new Date(row.created_at).getTime() + 1).toISOString();
  const { data, error } = await supabase.rpc("get_conversation_messages", {
    p_conversation_id: conversationId,
    p_before_created_at: justAfter,
    p_limit: 20,
  });
  if (error) return mapDbError(error);
  return success(undefined, ((data ?? []) as unknown as ThreadMessage[]).find((m) => m.id === messageId) ?? null);
}

export async function setMutedAction(conversationId: string, muted: boolean): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  if (!uuid.safeParse(conversationId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_members")
    .update({ is_muted: muted })
    .eq("conversation_id", conversationId)
    .eq("user_id", access.userId);
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  return success(muted ? "portal.messages.mutedToast" : "portal.messages.unmutedToast");
}

export async function renameGroupAction(conversationId: string, name: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z.object({ conversationId: uuid, name: z.string().trim().min(1).max(100) }).safeParse({ conversationId, name });
  if (!parsed.success) return failure("errors.invalid_group_name");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_conversation", { p_conversation_id: parsed.data.conversationId, p_name: parsed.data.name });
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  return success("common.saved");
}

export async function addGroupMembersAction(conversationId: string, memberIds: string[]): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z.object({ conversationId: uuid, memberIds: z.array(uuid).min(1).max(300) }).safeParse({ conversationId, memberIds });
  if (!parsed.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_conversation_members", { p_conversation_id: parsed.data.conversationId, p_member_ids: parsed.data.memberIds });
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  return success("portal.messages.membersAdded");
}

export async function removeGroupMemberAction(conversationId: string, userId: string): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  if (!uuid.safeParse(conversationId).success || !uuid.safeParse(userId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_conversation_member", { p_conversation_id: conversationId, p_user_id: userId });
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  if (userId === access.userId) redirect("/messages");
  return success("portal.messages.memberRemoved");
}

// ---------------------------------------------------------------- channels

export interface ChannelSummary {
  id: string;
  name: string;
  description: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_avatar_url: string | null;
  followers: number;
  is_member: boolean;
  is_admin: boolean;
  last_post_at: string | null;
}

export async function listChannelsAction(query: string): Promise<ActionResult<ChannelSummary[]>> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const term = z.string().trim().max(60).safeParse(query);
  if (!term.success) return success(undefined, []);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_school_channels", { p_query: term.data || undefined, p_limit: 60 });
  if (error) return mapDbError(error);
  return success(
    undefined,
    (data ?? []).map((c) => ({
      id: c.id ?? "",
      name: c.name ?? "",
      description: c.description,
      owner_first_name: c.owner_first_name,
      owner_last_name: c.owner_last_name,
      owner_avatar_url: c.owner_avatar_url,
      followers: Number(c.followers),
      is_member: Boolean(c.is_member),
      is_admin: Boolean(c.is_admin),
      last_post_at: c.last_post_at,
    }))
  );
}

export async function createChannelAction(name: string, description: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  const parsed = z
    .object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500) })
    .safeParse({ name, description });
  if (!parsed.success) return failure("errors.invalid_channel_name");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_channel", { p_name: parsed.data.name, p_description: parsed.data.description || undefined });
  if (error || !data) return mapDbError(error);
  revalidatePath("/messages", "layout");
  redirect(`/messages/${data}`);
}

export async function joinChannelAction(conversationId: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  if (!uuid.safeParse(conversationId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_channel", { p_conversation_id: conversationId });
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  redirect(`/messages/${conversationId}`);
}

export async function closeChannelAction(conversationId: string): Promise<ActionResult> {
  if (!(await requireMessaging())) return failure("errors.not_authenticated");
  if (!uuid.safeParse(conversationId).success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_channel", { p_conversation_id: conversationId });
  if (error) return mapDbError(error);
  revalidatePath("/messages", "layout");
  redirect("/messages");
}

// ----------------------------------------------------------------- stories

/**
 * An answer to somebody's story, sent to them as an ordinary message in the
 * conversation the two already have (or a new one), the way a reply to a
 * story arrives in any messenger. Stays on the story; does not navigate.
 */
export async function replyToStoryAction(authorId: string, text: string, quote: string): Promise<ActionResult> {
  const access = await requireMessaging();
  if (!access) return failure("errors.not_authenticated");
  const parsed = z
    .object({ authorId: uuid, text: z.string().trim().min(1).max(1000), quote: z.string().trim().max(80) })
    .safeParse({ authorId, text, quote });
  if (!parsed.success || parsed.data.authorId === access.userId) return failure("errors.invalid");
  const supabase = await createClient();
  const { data: conversationId, error } = await supabase.rpc("create_direct_conversation", { p_target_user_id: parsed.data.authorId });
  if (error || !conversationId) return mapDbError(error);
  const content = parsed.data.quote ? `↪ «${parsed.data.quote}»\n${parsed.data.text}` : parsed.data.text;
  const { error: sendError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: access.userId, school_id: access.school!.id, content, type: "text" });
  if (sendError) return mapDbError(sendError);
  return success("portal.messages.stories.replySent");
}
