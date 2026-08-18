import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { UsersTable } from "./users-table";

async function getUsers(schoolId: string) {
  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, email, is_active, avatar_url, status, created_at" as never)
    .eq("school_id" as never, schoolId)
    .order("created_at" as never, { ascending: false });

  const usersArr = (users ?? []) as Array<Record<string, unknown>>;

  const withDetails = await Promise.all(
    usersArr.map(async (user) => {
      const { data: roles } = await supabase
        .from("user_roles" as never)
        .select("roles:role_id(name_tg, slug)" as never)
        .eq("user_id" as never, user.id as never);

      const roleData = ((roles ?? []) as Array<Record<string, unknown>>).map((r) => {
        const role = r.roles as Record<string, unknown>;
        return { name: role.name_tg as string, slug: role.slug as string };
      });

      const { data: classAssignment } = await supabase
        .from("class_students" as never)
        .select("classes:class_id(name)" as never)
        .eq("student_id" as never, user.id as string)
        .limit(1)
        .single();

      const cls = classAssignment as Record<string, unknown> | null;
      const className = cls ? ((cls.classes as Record<string, unknown>).name as string) : null;

      return {
        id: user.id as string,
        publicId: user.public_id as string,
        firstName: user.first_name as string,
        lastName: user.last_name as string,
        middleName: (user.middle_name as string) ?? null,
        email: user.email as string,
        isActive: user.is_active as boolean,
        avatarUrl: (user.avatar_url as string) ?? null,
        status: (user.status as string) ?? "active",
        createdAt: user.created_at as string,
        roles: roleData,
        className,
      };
    })
  );

  return withDetails;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const { filter, q } = await searchParams;
  const users = await getUsers(admin.schoolId);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("users")}
        </h1>
        <UsersTable users={users} currentFilter={filter ?? "all"} searchQuery={q ?? ""} />
      </div>
    </div>
  );
}
