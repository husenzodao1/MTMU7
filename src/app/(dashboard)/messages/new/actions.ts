"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";

export async function searchContacts(query: string) {
  const user = await getUserWithRole();
  if (!user) return [];

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return [];

  if (!query || query.length < 2) return [];

  const sanitized = query.replace(/[%_\\]/g, "");
  if (!sanitized) return [];

  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select(
      `
      id, first_name, last_name, avatar_url,
      user_roles(
        roles:role_id(name_tg, slug)
      )
    ` as never
    )
    .neq("id" as never, user.id)
    .eq("is_active" as never, true)
    .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%` as never)
    .limit(20);

  return ((users as Array<Record<string, unknown>>) ?? []).map((u) => {
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
    };
  });
}

export async function createDirectConversation(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canCreate = await canPerformAction("messages", "messages.create");
  if (!canCreate) redirect("/messages?error=forbidden");

  const supabase = await createServerClient();

  // Check for existing direct conversation
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

    if (
      directConvs &&
      (directConvs as Array<Record<string, unknown>>).length > 0
    ) {
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
