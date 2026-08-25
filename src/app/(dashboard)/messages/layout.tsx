import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserWithRole();
  if (!user) {
    const t = await getTranslations("messages");
    return <ErrorState title={t("moduleDisabled")} description="Not authenticated" />;
  }

  const admin = createAdminClient();

  // Step 1: Find the messages module
  const { data: mod, error: modError } = await admin
    .from("modules" as never)
    .select("id, slug" as never)
    .eq("slug" as never, "messages")
    .single();

  if (!mod || modError) {
    return <ErrorState title="Debug: Module not found" description={`modules table has no 'messages' entry. Error: ${modError?.message ?? 'null result'}`} />;
  }
  const moduleId = (mod as Record<string, unknown>).id as string;

  // Step 2: Check school_modules
  const { data: sm, error: smError } = await admin
    .from("school_modules" as never)
    .select("is_enabled, school_id" as never)
    .eq("module_id" as never, moduleId as never)
    .eq("school_id" as never, user.schoolId)
    .single();

  if (!sm || smError) {
    // Check if there are ANY school_modules for this module
    const { data: allSm } = await admin
      .from("school_modules" as never)
      .select("school_id, is_enabled" as never)
      .eq("module_id" as never, moduleId as never);

    return <ErrorState
      title="Debug: school_modules missing"
      description={`No school_modules entry for module_id=${moduleId} + school_id=${user.schoolId}. Error: ${smError?.message ?? 'null'}. All entries for this module: ${JSON.stringify(allSm)}`}
    />;
  }

  if ((sm as Record<string, unknown>).is_enabled !== true) {
    return <ErrorState title="Debug: Module disabled" description={`school_modules.is_enabled = false for school_id=${user.schoolId}`} />;
  }

  // Step 3: Check user roles
  const { data: userRoles } = await admin
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRoles as Array<Record<string, unknown>>) ?? []).map(
    (r) => r.role_id as string
  );

  if (roleIds.length === 0) {
    return <ErrorState title="Debug: No roles" description={`User ${user.id} has no entries in user_roles table`} />;
  }

  // Step 4: Check module_role_access
  const { data: access } = await admin
    .from("module_role_access" as never)
    .select("id, role_id, is_visible, school_id" as never)
    .eq("module_id" as never, moduleId as never)
    .in("role_id" as never, roleIds)
    .eq("is_visible" as never, true)
    .limit(1);

  if (!access || (access as unknown[]).length === 0) {
    // Get all module_role_access for this module for debugging
    const { data: allAccess } = await admin
      .from("module_role_access" as never)
      .select("role_id, is_visible, school_id" as never)
      .eq("module_id" as never, moduleId as never);

    const { data: roles } = await admin
      .from("roles" as never)
      .select("id, slug, name_tg" as never)
      .in("id" as never, roleIds);

    return <ErrorState
      title="Debug: No module_role_access"
      description={`User roles: ${JSON.stringify(roles)}. Module access entries: ${JSON.stringify(allAccess)}`}
    />;
  }

  return <>{children}</>;
}
