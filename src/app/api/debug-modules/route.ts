import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("users" as never)
    .select("id, school_id, first_name, last_name" as never)
    .eq("id" as never, user.id)
    .single();

  const { data: allModules } = await admin
    .from("modules" as never)
    .select("id, slug" as never);

  const { data: schoolModules } = await admin
    .from("school_modules" as never)
    .select("module_id, is_enabled, school_id" as never);

  const { data: userRoles } = await admin
    .from("user_roles" as never)
    .select("role_id, user_id" as never)
    .eq("user_id" as never, user.id);

  const roleIds = ((userRoles ?? []) as Array<Record<string, unknown>>).map(r => r.role_id as string);

  const { data: moduleAccess } = await admin
    .from("module_role_access" as never)
    .select("module_id, role_id, is_visible, school_id" as never)
    .in("role_id" as never, roleIds.length > 0 ? roleIds : ["none"]);

  const { data: roles } = await admin
    .from("roles" as never)
    .select("id, slug, name_tg, school_id" as never)
    .in("id" as never, roleIds.length > 0 ? roleIds : ["none"]);

  const messagesModule = ((allModules ?? []) as Array<Record<string, unknown>>).find(
    m => m.slug === "messages"
  );

  const messagesSchoolModule = ((schoolModules ?? []) as Array<Record<string, unknown>>).find(
    sm => sm.module_id === messagesModule?.id && sm.school_id === (profile as Record<string, unknown>)?.school_id
  );

  const messagesAccess = ((moduleAccess ?? []) as Array<Record<string, unknown>>).filter(
    ma => ma.module_id === messagesModule?.id
  );

  return NextResponse.json({
    authUserId: user.id,
    profile,
    messagesModule,
    allSchoolModules: schoolModules,
    messagesSchoolModule,
    userRoles,
    roles,
    messagesAccess,
    allModuleAccess: moduleAccess,
  });
}
