"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { revalidatePath } from "next/cache";

export async function sendFriendRequest(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) return { error: "unauthorized" };
  if (targetUserId === user.id) return { error: "cannotAddSelf" };

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("users" as never)
    .select("id, school_id, is_active" as never)
    .eq("id" as never, targetUserId)
    .single();

  const t = target as Record<string, unknown> | null;
  if (!t) return { error: "userNotFound" };
  if (!t.is_active) return { error: "userInactive" };
  if (t.school_id !== user.schoolId) return { error: "differentSchool" };

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("friend_requests" as never)
    .select("id, status" as never)
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})` as never)
    .in("status" as never, ["pending", "accepted"])
    .limit(1)
    .single();

  if (existing) return { error: "alreadyExists", status: "pending_sent" };

  // Clean up old rejected/cancelled rows before re-inserting
  await supabase
    .from("friend_requests" as never)
    .delete()
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})` as never)
    .in("status" as never, ["rejected", "cancelled"]);

  const { error } = await supabase
    .from("friend_requests" as never)
    .insert({
      school_id: user.schoolId,
      sender_id: user.id,
      receiver_id: targetUserId,
      status: "pending",
    } as never);

  if (error) return { error: error.message };

  await admin.from("notifications" as never).insert({
    user_id: targetUserId,
    school_id: user.schoolId,
    type: "friend",
    module: "friends",
    title: `${user.firstName} ${user.lastName}`,
    body: "sent you a friend request",
    data: { senderId: user.id },
  } as never);

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

  const admin = createAdminClient();
  await admin.from("notifications" as never).insert({
    user_id: senderUserId,
    school_id: user.schoolId,
    type: "friend",
    module: "friends",
    title: `${user.firstName} ${user.lastName}`,
    body: "accepted your friend request",
    data: { accepterId: user.id },
  } as never);

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

  // Change to cancelled instead of delete — the new RLS only allows updating to cancelled (sender) or rejected (receiver)
  // We need to handle both directions: user could be sender or receiver
  const { error: senderError } = await supabase
    .from("friend_requests" as never)
    .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
    .eq("sender_id" as never, user.id)
    .eq("receiver_id" as never, targetUserId)
    .eq("status" as never, "accepted");

  const { error: receiverError } = await supabase
    .from("friend_requests" as never)
    .update({ status: "rejected", updated_at: new Date().toISOString() } as never)
    .eq("sender_id" as never, targetUserId)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "accepted");

  if (senderError && receiverError) return { error: senderError.message };

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

export async function getPendingFriendCount(): Promise<number> {
  const user = await getUserWithRole();
  if (!user) return 0;

  const supabase = await createServerClient();

  const { count } = await supabase
    .from("friend_requests" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "pending");

  return count ?? 0;
}
