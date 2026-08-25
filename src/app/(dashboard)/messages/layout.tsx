import { createAdminClient } from "@/lib/supabase/admin";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("messages");
  const user = await getUserWithRole();
  if (!user) {
    return <ErrorState title={t("moduleDisabled")} description={t("noAccess")} />;
  }

  const admin = createAdminClient();

  const { data: mod } = await admin
    .from("modules" as never)
    .select("id" as never)
    .eq("slug" as never, "messages")
    .single();

  if (!mod) {
    return <ErrorState title={t("moduleDisabled")} description={t("noAccess")} />;
  }
  const moduleId = (mod as Record<string, unknown>).id as string;

  const { data: sm } = await admin
    .from("school_modules" as never)
    .select("is_enabled" as never)
    .eq("module_id" as never, moduleId as never)
    .eq("school_id" as never, user.schoolId)
    .single();

  if ((sm as Record<string, unknown> | null)?.is_enabled !== true) {
    return <ErrorState title={t("moduleDisabled")} description={t("noAccess")} />;
  }

  const { data: userRoles } = await admin
    .from("user_roles" as never)
    .select("role_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRoles as Array<Record<string, unknown>>) ?? []).map(
    (r) => r.role_id as string
  );

  if (roleIds.length === 0) {
    return <ErrorState title={t("moduleDisabled")} description={t("noAccess")} />;
  }

  const { data: access } = await admin
    .from("module_role_access" as never)
    .select("role_id" as never)
    .eq("module_id" as never, moduleId as never)
    .in("role_id" as never, roleIds)
    .eq("is_visible" as never, true)
    .limit(1);

  if (!access || (access as unknown[]).length === 0) {
    return <ErrorState title={t("moduleDisabled")} description={t("noAccess")} />;
  }

  return <>{children}</>;
}
