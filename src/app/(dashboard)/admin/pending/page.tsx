import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PendingList } from "./pending-list";

async function getPendingRequests(schoolId: string) {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("registration_requests" as never)
    .select("*, roles:requested_role_id(name_tg, slug), classes:requested_class_id(name)" as never)
    .eq("school_id" as never, schoolId)
    .eq("status" as never, "pending")
    .order("created_at" as never, { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const role = r.roles as Record<string, unknown> | null;
    const cls = r.classes as Record<string, unknown> | null;
    return {
      id: r.id as string,
      email: r.email as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      middleName: (r.middle_name as string) ?? null,
      avatarUrl: (r.avatar_url as string) ?? null,
      requestedRoleId: r.requested_role_id as string,
      requestedRoleName: role ? (role.name_tg as string) : "—",
      requestedClassName: cls ? (cls.name as string) : null,
      requestedClassId: (r.requested_class_id as string) ?? null,
      enrollmentYear: (r.enrollment_year as number) ?? null,
      createdAt: r.created_at as string,
    };
  });
}

async function getRolesAndClasses(schoolId: string) {
  const supabase = await createServerClient();

  const { data: roles } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg" as never)
    .eq("school_id" as never, schoolId)
    .eq("is_active" as never, true)
    .gt("level" as never, 1)
    .order("level" as never, { ascending: true });

  const { data: classes } = await supabase
    .from("classes" as never)
    .select("id, name" as never)
    .eq("school_id" as never, schoolId)
    .eq("is_active" as never, true)
    .order("name" as never, { ascending: true });

  return {
    roles: ((roles ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      nameTg: r.name_tg as string,
      slug: r.slug as string,
    })),
    classes: ((classes ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      name: c.name as string,
    })),
  };
}

export default async function AdminPendingPage() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");

  const [requests, { roles, classes }] = await Promise.all([
    getPendingRequests(admin.schoolId),
    getRolesAndClasses(admin.schoolId),
  ]);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">{t("pendingUsers")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("pendingUsersDesc")}</p>
        </div>
        <PendingList requests={requests} roles={roles} classes={classes} />
      </div>
    </div>
  );
}
