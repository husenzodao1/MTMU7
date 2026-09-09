"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";

export async function searchContacts(query: string) {
  const user = await getUserWithRole();
  if (!user) return [];

  if (!query || query.length < 2) return [];

  const sanitized = query.replace(/[%_\\]/g, "");
  if (!sanitized) return [];

  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select("id, first_name, last_name, avatar_url" as never)
    .neq("id" as never, user.id)
    .eq("is_active" as never, true)
    .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%` as never)
    .limit(20);

  if (!users || (users as unknown[]).length === 0) return [];

  const userIds = (users as Array<Record<string, unknown>>).map((u) => u.id as string);
  const admin = createAdminClient();
  const { data: rolesData } = await admin
    .from("user_roles" as never)
    .select("user_id, roles:role_id(name_tg, slug)" as never)
    .in("user_id" as never, userIds);

  const rolesMap = new Map<string, string>();
  for (const row of (rolesData as Array<Record<string, unknown>>) ?? []) {
    const userId = row.user_id as string;
    if (!rolesMap.has(userId)) {
      const role = row.roles as Record<string, unknown> | null;
      if (role) rolesMap.set(userId, (role.name_tg as string) ?? "");
    }
  }

  return (users as Array<Record<string, unknown>>).map((u) => ({
    id: u.id as string,
    firstName: u.first_name as string,
    lastName: u.last_name as string,
    avatarUrl: u.avatar_url as string | null,
    roleName: rolesMap.get(u.id as string) ?? "",
  }));
}

export async function createGroupConversation(memberIds: string[], groupName: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");
  if (!groupName.trim() || memberIds.length === 0) redirect("/messages/new");

  const admin = createAdminClient();

  const { data: newConv, error: convError } = await admin
    .from("conversations" as never)
    .insert({
      school_id: user.schoolId,
      type: "group",
      name: groupName.trim(),
      created_by: user.id,
    } as never)
    .select("id" as never)
    .single();

  if (convError || !newConv) redirect("/messages?error=create_failed");

  const convId = (newConv as Record<string, unknown>).id as string;

  const allMembers = [user.id, ...memberIds.filter((id) => id !== user.id)];
  await admin.from("conversation_members" as never).insert(
    allMembers.map((uid, i) => ({
      conversation_id: convId,
      user_id: uid,
      school_id: user.schoolId,
      role: i === 0 ? "admin" : "member",
    })) as never
  );

  redirect(`/messages/${convId}`);
}

export async function createDirectConversation(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Check for existing direct conversation between these two users
  const { data: existingMemberships } = await admin
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, user.id)
    .eq("school_id" as never, user.schoolId);

  const myConvIds = ((existingMemberships as Array<Record<string, unknown>>) ?? []).map(
    (m) => m.conversation_id as string
  );

  if (myConvIds.length > 0) {
    const { data: targetMemberships } = await admin
      .from("conversation_members" as never)
      .select("conversation_id" as never)
      .eq("user_id" as never, targetUserId)
      .in("conversation_id" as never, myConvIds);

    const sharedConvIds = ((targetMemberships as Array<Record<string, unknown>>) ?? []).map(
      (m) => m.conversation_id as string
    );

    if (sharedConvIds.length > 0) {
      const { data: directConvs } = await admin
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
  }

  // RLS SELECT policy on conversations requires user to be in conversation_members,
  // but members don't exist yet at INSERT time — use admin client for atomic creation
  const { data: newConv, error: convError } = await admin
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

  await admin.from("conversation_members" as never).insert([
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
