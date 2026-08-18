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
  const results: string[] = [];

  // Check public.users first
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id, is_super_admin, email, is_active" as never)
    .eq("email" as never, TARGET_EMAIL)
    .single();

  if (existingUser) {
    const eu = existingUser as Record<string, unknown>;
    results.push("public.users: found id=" + eu.id);
    await admin.auth.admin.updateUserById(eu.id as string, { password: pw });
    results.push("password: updated");
    if (!eu.is_super_admin) {
      await admin.from("users" as never)
        .update({ is_super_admin: true, is_active: true } as never)
        .eq("id" as never, eu.id as string);
      results.push("is_super_admin: set to true");
    }
    // Check role
    const { data: existingRoles } = await admin
      .from("user_roles" as never)
      .select("roles:role_id(slug)" as never)
      .eq("user_id" as never, eu.id as string);
    const roleSlugs = ((existingRoles ?? []) as Array<Record<string, unknown>>)
      .map((r) => ((r.roles as Record<string, unknown>)?.slug as string));
    return NextResponse.json({
      status: "already_exists_updated",
      id: eu.id,
      is_super_admin: true,
      password_set: true,
      roles: roleSlugs,
      log: results,
    });
  }

  results.push("public.users: not found, creating...");

  // Try to create auth user. If fails (already exists), find via listUsers
  let userId: string;
  const { data: newAuth, error: createErr } = await admin.auth.admin.createUser({
    email: TARGET_EMAIL,
    password: pw,
    email_confirm: true,
  });

  if (createErr) {
    results.push("createUser failed: " + createErr.message);
    // The user exists in auth but not in public.users
    // List all users page by page to find them
    let found = false;
    for (let page = 1; page <= 10; page++) {
      const resp = await admin.auth.admin.listUsers({ page, perPage: 100 });
      const users = resp.data?.users ?? [];
      results.push(`listUsers page ${page}: ${users.length} users`);
      const match = users.find((u) => u.email === TARGET_EMAIL);
      if (match) {
        userId = match.id;
        found = true;
        results.push("found auth user: " + userId);
        await admin.auth.admin.updateUserById(userId, { password: pw });
        results.push("password: updated");
        break;
      }
      if (users.length < 100) break;
    }
    if (!found) {
      return NextResponse.json({ error: "cannot_find_auth_user", log: results }, { status: 500 });
    }
  } else {
    userId = newAuth.user.id;
    results.push("auth user created: " + userId);
  }

  // Insert into public.users
  const { error: userError } = await admin.from("users" as never).insert({
    id: userId!,
    school_id: DEFAULT_SCHOOL_ID,
    email: TARGET_EMAIL,
    first_name: "Mehrovar",
    last_name: "Admin",
    is_active: true,
    is_super_admin: true,
  } as never);

  if (userError) {
    return NextResponse.json(
      { error: "user_insert_failed", detail: userError.message, log: results },
      { status: 500 }
    );
  }
  results.push("public.users: inserted");

  // Assign admin role
  const { data: adminRole } = await admin
    .from("roles" as never)
    .select("id" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("slug" as never, "admin")
    .single();

  const roleRow = adminRole as Record<string, unknown> | null;
  if (roleRow) {
    await admin.from("user_roles" as never).insert({
      user_id: userId!,
      role_id: roleRow.id as string,
      school_id: DEFAULT_SCHOOL_ID,
    } as never);
    results.push("admin role: assigned");
  } else {
    results.push("admin role: NOT FOUND");
  }

  // Verify
  const { data: verify } = await admin
    .from("users" as never)
    .select("id, email, is_super_admin, is_active" as never)
    .eq("id" as never, userId!)
    .single();

  const { data: roles } = await admin
    .from("user_roles" as never)
    .select("roles:role_id(slug)" as never)
    .eq("user_id" as never, userId!);

  return NextResponse.json({
    status: "created",
    user: verify,
    roles: (roles ?? []).map((r: Record<string, unknown>) =>
      (r.roles as Record<string, unknown>)?.slug
    ),
    log: results,
  });
}
