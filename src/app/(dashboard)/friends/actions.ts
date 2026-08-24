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

async function fetchUserDetails(userIds: string[]): Promise<Map<string, { first_name: string; last_name: string; avatar_url: string | null; role_name: string }>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("users" as never)
    .select("id, first_name, last_name, avatar_url" as never)
    .in("id" as never, userIds);
  const { data: rolesData } = await admin
    .from("user_roles" as never)
    .select("user_id, roles:role_id(name_tg)" as never)
    .in("user_id" as never, userIds);

  const rolesMap = new Map<string, string>();
  for (const r of (rolesData as Array<Record<string, unknown>>) ?? []) {
    const uid = r.user_id as string;
    if (!rolesMap.has(uid)) {
      const role = r.roles as Record<string, unknown> | null;
      if (role) rolesMap.set(uid, (role.name_tg as string) ?? "");
    }
  }

  const result = new Map<string, { first_name: string; last_name: string; avatar_url: string | null; role_name: string }>();
  for (const u of (users as Array<Record<string, unknown>>) ?? []) {
    result.set(u.id as string, {
      first_name: u.first_name as string,
      last_name: u.last_name as string,
      avatar_url: u.avatar_url as string | null,
      role_name: rolesMap.get(u.id as string) ?? "",
    });
  }
  return result;
}

export async function getFriendsList(): Promise<FriendItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();

  const { data: sent } = await supabase
    .from("friend_requests" as never)
    .select("id, receiver_id" as never)
    .eq("sender_id" as never, user.id)
    .eq("status" as never, "accepted");

  const { data: received } = await supabase
    .from("friend_requests" as never)
    .select("id, sender_id" as never)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "accepted");

  const sentRows = (sent as Array<Record<string, unknown>>) ?? [];
  const receivedRows = (received as Array<Record<string, unknown>>) ?? [];
  const allUserIds = [
    ...sentRows.map((r) => r.receiver_id as string),
    ...receivedRows.map((r) => r.sender_id as string),
  ];

  const details = await fetchUserDetails(allUserIds);

  const friends: FriendItem[] = [];
  for (const row of sentRows) {
    const d = details.get(row.receiver_id as string);
    if (!d) continue;
    friends.push({ id: row.receiver_id as string, firstName: d.first_name, lastName: d.last_name, avatarUrl: d.avatar_url, roleName: d.role_name, requestId: row.id as string });
  }
  for (const row of receivedRows) {
    const d = details.get(row.sender_id as string);
    if (!d) continue;
    friends.push({ id: row.sender_id as string, firstName: d.first_name, lastName: d.last_name, avatarUrl: d.avatar_url, roleName: d.role_name, requestId: row.id as string });
  }
  return friends;
}

export async function getIncomingRequests(): Promise<FriendItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("friend_requests" as never)
    .select("id, sender_id" as never)
    .eq("receiver_id" as never, user.id)
    .eq("status" as never, "pending");

  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const userIds = rows.map((r) => r.sender_id as string);
  const details = await fetchUserDetails(userIds);

  return rows.map((row) => {
    const d = details.get(row.sender_id as string);
    return {
      id: row.sender_id as string,
      firstName: d?.first_name ?? "",
      lastName: d?.last_name ?? "",
      avatarUrl: d?.avatar_url ?? null,
      roleName: d?.role_name ?? "",
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
    .select("id, receiver_id" as never)
    .eq("sender_id" as never, user.id)
    .eq("status" as never, "pending");

  const rows = (data as Array<Record<string, unknown>>) ?? [];
  const userIds = rows.map((r) => r.receiver_id as string);
  const details = await fetchUserDetails(userIds);

  return rows.map((row) => {
    const d = details.get(row.receiver_id as string);
    return {
      id: row.receiver_id as string,
      firstName: d?.first_name ?? "",
      lastName: d?.last_name ?? "",
      avatarUrl: d?.avatar_url ?? null,
      roleName: d?.role_name ?? "",
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
