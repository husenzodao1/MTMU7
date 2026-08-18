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

  const pw = request.nextUrl.searchParams.get("pw");
  if (!pw) {
    return NextResponse.json({ error: "pw param required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if user already exists in public.users with super admin
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id, is_super_admin, email, is_active" as never)
    .eq("email" as never, TARGET_EMAIL)
    .single();

  if (existingUser) {
    const eu = existingUser as Record<string, unknown>;
    // Update password for existing user
    await admin.auth.admin.updateUserById(eu.id as string, { password: pw });
    // Ensure super admin
    if (!eu.is_super_admin) {
      await admin.from("users" as never)
        .update({ is_super_admin: true, is_active: true } as never)
        .eq("id" as never, eu.id as string);
    }
    return NextResponse.json({
      status: "already_exists_updated",
      id: eu.id,
      is_super_admin: true,
      password_set: true,
    });
  }

  // Step 1: Create or find auth user
  let userId: string;

  // Try create first
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: pw,
      email_confirm: true,
    });

  if (authError) {
    // User exists in auth but not in public.users — find their ID
    const { data: { users: allUsers } } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const found = (allUsers ?? []).find(
      (u) => u.email === TARGET_EMAIL
    );
    if (!found) {
      return NextResponse.json(
        { error: "auth_user_not_found_after_conflict", detail: authError.message },
        { status: 500 }
      );
    }
    userId = found.id;
    // Update password
    await admin.auth.admin.updateUserById(userId, { password: pw });
  } else {
    userId = authData.user.id;
  }

  // Step 2: Insert into public.users
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

  // Step 3: Assign admin role
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

  // Step 4: Verify
  const { data: verify } = await admin
    .from("users" as never)
    .select("id, email, is_super_admin, is_active" as never)
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
