import { createClient } from "@supabase/supabase-js";
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });

  const log: string[] = [];

  // Check public.users first — service_role should bypass RLS for SELECT
  const { data: existingUser } = await admin
    .from("users")
    .select("id, is_super_admin, email, is_active")
    .eq("email", TARGET_EMAIL)
    .single();

  if (existingUser) {
    log.push("public.users: found, updating password and ensuring super admin");
    await admin.auth.admin.updateUserById(existingUser.id, { password: pw });
    await admin.from("users")
      .update({ is_super_admin: true, is_active: true })
      .eq("id", existingUser.id);
    const { data: roles } = await admin
      .from("user_roles")
      .select("roles:role_id(slug)")
      .eq("user_id", existingUser.id);
    return NextResponse.json({
      status: "already_exists_updated",
      id: existingUser.id,
      is_super_admin: true,
      password_set: true,
      roles,
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

    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password: pw,
    });
    if (pwErr) {
      log.push("password update failed: " + pwErr.message);
    } else {
      log.push("password set via updateUserById");
    }
  }

  // Use direct SQL via rpc to bypass RLS for insert
  const { error: rpcError } = await admin.rpc("exec_sql" as string, {
    query: `
      INSERT INTO public.users (id, school_id, email, first_name, last_name, is_active, is_super_admin)
      VALUES ('${userId}', '${DEFAULT_SCHOOL_ID}', '${TARGET_EMAIL}', 'Mehrovar', 'Admin', true, true)
      ON CONFLICT (id) DO UPDATE SET is_super_admin = true, is_active = true;
    `,
  });

  if (rpcError) {
    log.push("rpc exec_sql failed: " + rpcError.message);
    // Fallback: try direct REST insert — the service_role key should work
    // via the x-client-info header approach
    const restUrl = `${supabaseUrl}/rest/v1/users`;
    const restResp = await fetch(restUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id: userId,
        school_id: DEFAULT_SCHOOL_ID,
        email: TARGET_EMAIL,
        first_name: "Mehrovar",
        last_name: "Admin",
        is_active: true,
        is_super_admin: true,
      }),
    });
    const restBody = await restResp.text();
    if (!restResp.ok) {
      return NextResponse.json({
        error: "insert_failed_both_methods",
        rpc_error: rpcError.message,
        rest_status: restResp.status,
        rest_body: restBody,
        log,
      }, { status: 500 });
    }
    log.push("inserted via direct REST API");
  } else {
    log.push("inserted via rpc exec_sql");
  }

  // Assign admin role
  const { data: adminRole } = await admin
    .from("roles")
    .select("id")
    .eq("school_id", DEFAULT_SCHOOL_ID)
    .eq("slug", "admin")
    .single();

  if (adminRole) {
    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: userId,
      role_id: adminRole.id,
      school_id: DEFAULT_SCHOOL_ID,
    });
    if (roleErr) {
      // Try via REST
      const restUrl = `${supabaseUrl}/rest/v1/user_roles`;
      await fetch(restUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: userId,
          role_id: adminRole.id,
          school_id: DEFAULT_SCHOOL_ID,
        }),
      });
      log.push("admin role: assigned via REST fallback");
    } else {
      log.push("admin role: assigned");
    }
  } else {
    log.push("admin role: NOT FOUND in DB");
  }

  // Verify
  const { data: verify } = await admin
    .from("users")
    .select("id, email, is_super_admin, is_active")
    .eq("id", userId)
    .single();

  const { data: roles } = await admin
    .from("user_roles")
    .select("roles:role_id(slug)")
    .eq("user_id", userId);

  return NextResponse.json({
    status: "created",
    user: verify,
    roles,
    log,
  });
}
