import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { ModuleManager } from "./module-manager";

async function getModulesData() {
  const supabase = await createServerClient();

  const [modulesRes, rolesRes, accessRes] = await Promise.all([
    supabase
      .from("school_modules" as never)
      .select(
        "is_enabled, module_id, modules!inner(id, slug, name_tg, name_ru, icon, is_system, sort_order)" as never
      ),
    supabase
      .from("roles" as never)
      .select("id, slug, name_tg, level" as never)
      .order("level" as never, { ascending: true }),
    supabase
      .from("module_role_access" as never)
      .select("module_id, role_id, is_visible" as never),
  ]);

  const modules = (
    (modulesRes.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => {
    const mod = row.modules as Record<string, unknown>;
    return {
      id: mod.id as string,
      slug: mod.slug as string,
      nameTg: mod.name_tg as string,
      nameRu: (mod.name_ru as string) ?? null,
      icon: (mod.icon as string) ?? "",
      isSystem: mod.is_system as boolean,
      isEnabled: row.is_enabled as boolean,
    };
  });

  const roles = (
    (rolesRes.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    nameTg: row.name_tg as string,
    level: row.level as number,
  }));

  const roleAccess = (
    (accessRes.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    moduleId: row.module_id as string,
    roleId: row.role_id as string,
    isVisible: row.is_visible as boolean,
  }));

  return { modules, roles, roleAccess };
}

export default async function ModulesPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const { modules, roles, roleAccess } = await getModulesData();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("modulesManagement")}
        </h1>
        <ModuleManager modules={modules} roles={roles} roleAccess={roleAccess} />
      </div>
    </div>
  );
}
