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
  const log: string[] = [];

  // Check public.users first
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id, is_super_admin, email, is_active" as never)
    .eq("email" as never, TARGET_EMAIL)
    .single();

  if (existingUser) {
    const eu = existingUser as Record<string, unknown>;
    log.push("public.users: found, updating password and ensuring super admin");
    await admin.auth.admin.updateUserById(eu.id as string, { password: pw });
    await admin.from("users" as never)
      .update({ is_super_admin: true, is_active: true } as never)
      .eq("id" as never, eu.id as string);
    const { data: roles } = await admin
      .from("user_roles" as never)
      .select("roles:role_id(slug)" as never)
      .eq("user_id" as never, eu.id as string);
    return NextResponse.json({
      status: "already_exists_updated",
      id: eu.id,
      is_super_admin: true,
      password_set: true,
      roles: ((roles ?? []) as Array<Record<string, unknown>>)
        .map((r) => ((r.roles as Record<string, unknown>)?.slug)),
      log,
    });
  }

  log.push("public.users: not found");

  // Try create auth user
  const { data: newAuth, error: createErr } = await admin.auth.admin.createUser({
    email: TARGET_EMAIL,
    password: pw,
    email_confirm: true,
  });

  let userId: string;

  if (!createErr) {
    userId = newAuth.user.id;
    log.push("auth user created: " + userId);
  } else {
    log.push("createUser conflict: " + createErr.message);

    // User exists in auth but not in public.users
    // Use generateLink to get the user's ID without polluting the client's auth state
    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: TARGET_EMAIL,
      });

    if (linkErr || !linkData?.user) {
      return NextResponse.json({
        error: "cannot_resolve_auth_user",
        log,
        linkErr: linkErr?.message,
      }, { status: 500 });
    }
    userId = linkData.user.id;
    log.push("resolved via generateLink: " + userId);

    // Set their password
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password: pw,
    });
    if (pwErr) {
      log.push("password update failed: " + pwErr.message);
    } else {
      log.push("password set via updateUserById");
    }
  }

  // Fresh admin client to ensure service_role context (not polluted by signIn)
  const adminForInsert = createAdminClient();

  // Insert into public.users
  const { error: userError } = await adminForInsert.from("users" as never).insert({
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
      { error: "user_insert_failed", detail: userError.message, log },
      { status: 500 }
    );
  }
  log.push("public.users: inserted");

  // Assign admin role
  const { data: adminRole } = await adminForInsert
    .from("roles" as never)
    .select("id" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("slug" as never, "admin")
    .single();

  const roleRow = adminRole as Record<string, unknown> | null;
  if (roleRow) {
    await adminForInsert.from("user_roles" as never).insert({
      user_id: userId,
      role_id: roleRow.id as string,
      school_id: DEFAULT_SCHOOL_ID,
    } as never);
    log.push("admin role: assigned");
  } else {
    log.push("admin role: NOT FOUND in DB");
  }

  // Verify
  const { data: verify } = await adminForInsert
    .from("users" as never)
    .select("id, email, is_super_admin, is_active" as never)
    .eq("id" as never, userId)
    .single();

  const { data: roles } = await adminForInsert
    .from("user_roles" as never)
    .select("roles:role_id(slug)" as never)
    .eq("user_id" as never, userId);

  return NextResponse.json({
    status: "created",
    user: verify,
    roles: ((roles ?? []) as Array<Record<string, unknown>>)
      .map((r) => ((r.roles as Record<string, unknown>)?.slug)),
    log,
  });
}
