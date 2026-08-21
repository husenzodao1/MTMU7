"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function sendFriendRequest(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };
  if (targetUserId === user.id) return { error: "cannotAddSelf" };

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("friend_requests" as never)
    .select("id, status" as never)
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})` as never)
    .in("status" as never, ["pending", "accepted"])
    .limit(1)
    .single();

  if (existing) return { error: "alreadyExists", status: "pending_sent" };

  const { error } = await supabase
    .from("friend_requests" as never)
    .insert({
      school_id: user.schoolId,
      sender_id: user.id,
      receiver_id: targetUserId,
      status: "pending",
    } as never);

  if (error) return { error: error.message };

  revalidatePath(`/profile/${targetUserId}`);
  revalidatePath("/friends");
  return { status: "pending_sent" };
}

export async function cancelFriendRequest(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("friend_requests" as never)
    .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
    .eq("sender_id" as never, user.id)
    .eq("receiver_id" as never, targetUserId)
    .eq("status" as never, "pending");

  if (error) return { error: error.message };

  revalidatePath(`/profile/${targetUserId}`);
  revalidatePath("/friends");
  return { status: "none" };
}

export async function acceptFriendRequest(senderUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("friend_requests" as never)
    .update({ status: "accepted", updated_at: new Date().toISOString() } as never)
    .eq("sender_id" as never, senderUserId)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "pending");

  if (error) return { error: error.message };

  revalidatePath(`/profile/${senderUserId}`);
  revalidatePath("/friends");
  return { status: "accepted" };
}

export async function rejectFriendRequest(senderUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("friend_requests" as never)
    .update({ status: "rejected", updated_at: new Date().toISOString() } as never)
    .eq("sender_id" as never, senderUserId)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "pending");

  if (error) return { error: error.message };

  revalidatePath(`/profile/${senderUserId}`);
  revalidatePath("/friends");
  return { status: "none" };
}

export async function removeFriend(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("friend_requests" as never)
    .delete()
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})` as never)
    .eq("status" as never, "accepted");

  if (error) return { error: error.message };

  revalidatePath(`/profile/${targetUserId}`);
  revalidatePath("/friends");
  return { status: "none" };
}

export interface FriendItem {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
  requestId: string;
}

export async function getFriendsList(): Promise<FriendItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();

  const { data: sent } = await supabase
    .from("friend_requests" as never)
    .select("id, receiver_id, users!friend_requests_receiver_id_fkey(id, first_name, last_name, avatar_url, user_roles(roles:role_id(name_tg)))" as never)
    .eq("sender_id" as never, user.id)
    .eq("status" as never, "accepted");

  const { data: received } = await supabase
    .from("friend_requests" as never)
    .select("id, sender_id, users!friend_requests_sender_id_fkey(id, first_name, last_name, avatar_url, user_roles(roles:role_id(name_tg)))" as never)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "accepted");

  const friends: FriendItem[] = [];

  for (const row of (sent as Array<Record<string, unknown>>) ?? []) {
    const u = row.users as Record<string, unknown>;
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    friends.push({
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
      requestId: row.id as string,
    });
  }

  for (const row of (received as Array<Record<string, unknown>>) ?? []) {
    const u = row.users as Record<string, unknown>;
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    friends.push({
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
      requestId: row.id as string,
    });
  }

  return friends;
}

export async function getIncomingRequests(): Promise<FriendItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("friend_requests" as never)
    .select("id, sender_id, users!friend_requests_sender_id_fkey(id, first_name, last_name, avatar_url, user_roles(roles:role_id(name_tg)))" as never)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "pending");

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const u = row.users as Record<string, unknown>;
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
      requestId: row.id as string,
    };
  });
}

export async function getOutgoingRequests(): Promise<FriendItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("friend_requests" as never)
    .select("id, receiver_id, users!friend_requests_receiver_id_fkey(id, first_name, last_name, avatar_url, user_roles(roles:role_id(name_tg)))" as never)
    .eq("sender_id" as never, user.id)
    .eq("status" as never, "pending");

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const u = row.users as Record<string, unknown>;
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
      requestId: row.id as string,
    };
  });
}

export async function startDirectMessage(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  const { data: existingMemberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, user.id);

  const { data: targetMemberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, targetUserId);

  const myConvIds = new Set(
    ((existingMemberships as Array<Record<string, unknown>>) ?? []).map(
      (m) => m.conversation_id as string
    )
  );
  const targetConvIds = (
    (targetMemberships as Array<Record<string, unknown>>) ?? []
  ).map((m) => m.conversation_id as string);
  const sharedConvIds = targetConvIds.filter((id) => myConvIds.has(id));

  if (sharedConvIds.length > 0) {
    const { data: directConvs } = await supabase
      .from("conversations" as never)
      .select("id" as never)
      .in("id" as never, sharedConvIds)
      .eq("type" as never, "direct")
      .eq("is_active" as never, true)
      .limit(1);

    if (directConvs && (directConvs as Array<Record<string, unknown>>).length > 0) {
      const existing = (directConvs as Array<Record<string, unknown>>)[0]!;
      redirect(`/messages/${existing.id}`);
    }
  }

  const { data: newConv, error: convError } = await supabase
    .from("conversations" as never)
    .insert({
      school_id: user.schoolId,
      type: "direct",
      created_by: user.id,
    } as never)
    .select("id" as never)
    .single();

  if (convError || !newConv) redirect("/messages?error=create_failed");

  const convId = (newConv as Record<string, unknown>).id as string;

  await supabase.from("conversation_members" as never).insert([
    {
      conversation_id: convId,
      user_id: user.id,
      school_id: user.schoolId,
      role: "admin",
    },
    {
      conversation_id: convId,
      user_id: targetUserId,
      school_id: user.schoolId,
      role: "member",
    },
  ] as never);

  redirect(`/messages/${convId}`);
}
