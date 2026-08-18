import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

const SETUP_KEY = "sa-setup-2026-08-18-xK9mP";
const TARGET_EMAIL = "mehrovar.1001@gmail.com";
const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id, is_super_admin, email" as never)
    .eq("email" as never, TARGET_EMAIL)
    .single();

  if (existingUser) {
    const eu = existingUser as Record<string, unknown>;
    return NextResponse.json({
      status: "already_exists",
      id: eu.id,
      is_super_admin: eu.is_super_admin,
    });
  }

  const pw = request.nextUrl.searchParams.get("pw");
  if (!pw) {
    return NextResponse.json({ error: "pw param required" }, { status: 400 });
  }

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: pw,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json(
      { error: "auth_create_failed", detail: authError.message },
      { status: 500 }
    );
  }

  const userId = authData.user.id;

  const { error: userError } = await admin.from("users" as never).insert({
    id: userId,
    school_id: DEFAULT_SCHOOL_ID,
    email: TARGET_EMAIL,
    first_name: "Mehrovar",
    last_name: "Admin",
    is_active: true,
    is_super_admin: true,
  } as never);

  if (userError) {
    return NextResponse.json(
      { error: "user_insert_failed", detail: userError.message },
      { status: 500 }
    );
  }

  const { data: adminRole } = await admin
    .from("roles" as never)
    .select("id" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("slug" as never, "admin")
    .single();

  const roleRow = adminRole as Record<string, unknown> | null;
  if (roleRow) {
    await admin.from("user_roles" as never).insert({
      user_id: userId,
      role_id: roleRow.id as string,
      school_id: DEFAULT_SCHOOL_ID,
    } as never);
  }

  const { data: verify } = await admin
    .from("users" as never)
    .select("id, email, is_super_admin, status" as never)
    .eq("id" as never, userId)
    .single();

  const { data: roles } = await admin
    .from("user_roles" as never)
    .select("roles:role_id(slug)" as never)
    .eq("user_id" as never, userId);

  return NextResponse.json({
    status: "created",
    user: verify,
    roles: (roles ?? []).map((r: Record<string, unknown>) =>
      (r.roles as Record<string, unknown>)?.slug
    ),
    message: "DELETE THIS ROUTE IMMEDIATELY",
  });
}
