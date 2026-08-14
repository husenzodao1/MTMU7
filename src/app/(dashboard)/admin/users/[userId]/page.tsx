import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { UserDetail } from "./user-detail";
import { notFound } from "next/navigation";

async function getUserDetail(userId: string) {
  const supabase = await createServerClient();

  const { data: user } = await supabase
    .from("users" as never)
    .select(
      "id, public_id, first_name, last_name, middle_name, email, phone, is_active, avatar_url" as never
    )
    .eq("id" as never, userId)
    .single();

  if (!user) return null;

  const { data: userRoles } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(id, slug, name_tg, is_system)" as never)
    .eq("user_id" as never, userId);

  const { data: allRoles } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg" as never)
    .order("level" as never, { ascending: true });

  const row = user as Record<string, unknown>;
  return {
    user: {
      id: row.id as string,
      publicId: row.public_id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      middleName: (row.middle_name as string) ?? null,
      email: row.email as string,
      phone: (row.phone as string) ?? null,
      isActive: row.is_active as boolean,
      avatarUrl: (row.avatar_url as string) ?? null,
      assignedRoles: (
        (userRoles ?? []) as Array<Record<string, unknown>>
      ).map((ur) => {
        const r = ur.roles as Record<string, unknown>;
        return {
          id: r.id as string,
          slug: r.slug as string,
          nameTg: r.name_tg as string,
          isSystem: r.is_system as boolean,
        };
      }),
    },
    availableRoles: (
      (allRoles ?? []) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      nameTg: r.name_tg as string,
    })),
  };
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const data = await getUserDetail(userId);

  if (!data) notFound();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <UserDetail user={data.user} availableRoles={data.availableRoles} />
      </div>
    </div>
  );
}
