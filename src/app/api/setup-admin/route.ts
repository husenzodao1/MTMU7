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
    // Use signInWithPassword to get their ID, then reset password
    const { data: signInData, error: signInErr } =
      await admin.auth.signInWithPassword({
        email: TARGET_EMAIL,
        password: pw,
      });

    if (signInErr) {
      log.push("signIn with new pw failed, trying OTP approach");
      // Generate a magic link to get the user, or use the admin generateLink API
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
      // Now set their password
      const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
        password: pw,
      });
      if (pwErr) {
        return NextResponse.json({
          error: "password_update_failed",
          detail: pwErr.message,
          log,
        }, { status: 500 });
      }
      log.push("password set via updateUserById");
    } else {
      userId = signInData.user.id;
      log.push("signIn succeeded, user id: " + userId);
    }
  }

  // Insert into public.users
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
      { error: "user_insert_failed", detail: userError.message, log },
      { status: 500 }
    );
  }
  log.push("public.users: inserted");

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
      user_id: userId,
      role_id: roleRow.id as string,
      school_id: DEFAULT_SCHOOL_ID,
    } as never);
    log.push("admin role: assigned");
  } else {
    log.push("admin role: NOT FOUND in DB");
  }

  // Verify
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
    roles: ((roles ?? []) as Array<Record<string, unknown>>)
      .map((r) => ((r.roles as Record<string, unknown>)?.slug)),
    log,
  });
}
