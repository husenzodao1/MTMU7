import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PermissionsMatrix } from "./permissions-matrix";

async function getRolesAndPermissions() {
  const supabase = await createServerClient();

  const [rolesRes, permsRes, rpRes] = await Promise.all([
    supabase
      .from("roles" as never)
      .select("id, slug, name_tg, is_system" as never)
      .order("level" as never),
    supabase
      .from("permissions" as never)
      .select("id, slug, module, action, name_tg" as never)
      .order("module" as never),
    supabase
      .from("role_permissions" as never)
      .select("role_id, permission_id" as never),
  ]);

  return {
    roles: ((rolesRes.data ?? []) as Array<Record<string, unknown>>).map(
      (r) => ({
        id: r.id as string,
        slug: r.slug as string,
        nameTg: r.name_tg as string,
        isSystem: r.is_system as boolean,
      })
    ),
    permissions: (
      (permsRes.data ?? []) as Array<Record<string, unknown>>
    ).map((p) => ({
      id: p.id as string,
      slug: p.slug as string,
      module: p.module as string,
      action: p.action as string,
      nameTg: p.name_tg as string,
    })),
    rolePermissions: (
      (rpRes.data ?? []) as Array<Record<string, unknown>>
    ).map((rp) => ({
      roleId: rp.role_id as string,
      permissionId: rp.permission_id as string,
    })),
  };
}

export default async function RolesPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const data = await getRolesAndPermissions();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("permissionsMatrix")}
        </h1>
        <PermissionsMatrix {...data} />
      </div>
    </div>
  );
}
