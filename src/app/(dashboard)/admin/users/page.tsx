import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { UsersTable } from "./users-table";

async function getUsers() {
  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, email, is_active" as never)
    .order("created_at" as never, { ascending: false });

  const usersArr = (users ?? []) as Array<Record<string, unknown>>;

  const withRoles = await Promise.all(
    usersArr.map(async (user) => {
      const { data: roles } = await supabase
        .from("user_roles" as never)
        .select("roles:role_id(name_tg)" as never)
        .eq("user_id" as never, user.id as never);

      const roleNames = (
        (roles ?? []) as Array<Record<string, unknown>>
      ).map((r) => {
        const role = r.roles as Record<string, unknown>;
        return role.name_tg as string;
      });

      return {
        id: user.id as string,
        publicId: user.public_id as string,
        firstName: user.first_name as string,
        lastName: user.last_name as string,
        email: user.email as string,
        isActive: user.is_active as boolean,
        roles: roleNames,
      };
    })
  );

  return withRoles;
}

export default async function UsersPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const users = await getUsers();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("users")}
        </h1>
        <UsersTable users={users} />
      </div>
    </div>
  );
}
