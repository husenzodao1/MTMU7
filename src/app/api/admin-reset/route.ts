import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time use endpoint to check/fix admin accounts
// Protected by secret token
const SECRET = "mtmu7-admin-fix-2026";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // List all auth users
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasUrl = !!url && !url.includes('placeholder');
  const hasKey = !!key && !key.includes('placeholder');

  if (!hasUrl || !hasKey) {
    return NextResponse.json({ error: "Missing env vars", hasUrl, hasKey, url: url?.substring(0,30) }, { status: 500 });
  }

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });

  if (error) return NextResponse.json({ error: error.message, url: url?.substring(0,30) }, { status: 500 });

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    confirmed: !!u.email_confirmed_at,
    last_sign_in: u.last_sign_in_at,
    created: u.created_at,
  }));

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find user by email
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 50 });
  const existing = list?.users.find(u => u.email === email);

  if (existing) {
    // Update password
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "updated", email });
  } else {
    // Create new user
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "created", email, id: data.user?.id });
  }
}
