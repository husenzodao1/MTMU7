import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { createAnonymousClient } from "@/lib/supabase/app-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

/**
 * Sign-in for the phone app by the login the school issued (MT10001) or a
 * nickname — the same as the site's sign-in card (src/features/auth/actions.ts).
 *
 * The address behind a login is looked up inside the database behind a secret
 * only the server holds, so the app cannot walk the logins itself; it sends the
 * login and the password here and gets back the session GoTrue gives for them,
 * which it keeps on the phone. The address never leaves the server. One answer
 * for "no such login" and "wrong password", as on the site (SEC-009).
 */
export async function POST(request: Request) {
  let parsed: z.infer<typeof input>;
  try {
    const body = input.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "errors.invalid_credentials" }, { status: 400 });
    parsed = body.data;
  } catch {
    return NextResponse.json({ error: "errors.invalid_credentials" }, { status: 400 });
  }

  const supabase = createAnonymousClient();
  let email: string | null = null;
  if (parsed.login.includes("@")) {
    email = parsed.login.toLowerCase();
  } else {
    const secret = serverEnv.LOGIN_LOOKUP_SECRET;
    if (!secret) {
      console.error("[app/sign-in] LOGIN_LOOKUP_SECRET is not configured");
      return NextResponse.json({ error: "errors.unexpected" }, { status: 503 });
    }
    const { data, error } = await supabase.rpc("login_lookup", { p_login: parsed.login, p_secret: secret });
    if (error) {
      console.error("[app/sign-in] login_lookup failed", { code: (error as { code?: string }).code });
      return NextResponse.json({ error: "errors.unexpected" }, { status: 503 });
    }
    email = typeof data === "string" && data.length > 0 ? data : null;
  }
  if (!email) return NextResponse.json({ error: "errors.invalid_credentials" }, { status: 401 });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.password });
  if (error || !data.session) {
    const code = (error as { code?: string; status?: number } | null)?.code;
    const status = (error as { status?: number } | null)?.status;
    if (code === "email_not_confirmed") return NextResponse.json({ error: "errors.email_not_confirmed" }, { status: 403 });
    if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
      return NextResponse.json({ error: "errors.rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "errors.invalid_credentials" }, { status: 401 });
  }

  const session = data.session;
  return NextResponse.json(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
