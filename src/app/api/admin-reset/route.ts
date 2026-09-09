import { NextRequest, NextResponse } from "next/server";

const SECRET = "mtmu7-admin-fix-2026";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  return { url, key, headers };
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, key, headers } = getSupabase();
  if (!url || !key || url.includes("placeholder")) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const res = await fetch(`${url}/auth/v1/admin/users?per_page=50`, { headers })
    .catch(e => ({ ok: false, status: 0, _err: String(e), json: null }));

  if (!("json" in res) || !(res as Response).ok) {
    const detail = "_err" in (res as object) ? (res as { _err: string })._err : await (res as Response).text();
    return NextResponse.json({ error: "fetch failed", status: (res as Response).status, detail }, { status: 500 });
  }

  const data = await (res as Response).json();
  const users = (data.users ?? []).map((u: { id: string; email: string; email_confirmed_at?: string; last_sign_in_at?: string; created_at: string }) => ({
    id: u.id,
    email: u.email,
    confirmed: !!u.email_confirmed_at,
    last_sign_in: u.last_sign_in_at ?? null,
    created: u.created_at,
  }));

  return NextResponse.json({ total: users.length, users });
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, password } = await request.json();
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  const { url, key, headers } = getSupabase();

  // Find user
  const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=50`, { headers });
  if (!listRes.ok) return NextResponse.json({ error: "list failed", status: listRes.status }, { status: 500 });

  const listData = await listRes.json();
  const existing = (listData.users ?? []).find((u: { email: string; id: string }) => u.email === email);

  if (existing) {
    // Update password + confirm email
    const updateRes = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password, email_confirm: true }),
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) return NextResponse.json({ error: "update failed", detail: updateData }, { status: 500 });
    return NextResponse.json({ success: true, action: "password_updated", email });
  } else {
    // Create new user
    const createRes = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) return NextResponse.json({ error: "create failed", detail: createData }, { status: 500 });
    return NextResponse.json({ success: true, action: "created", email, id: createData.id });
  }
}
