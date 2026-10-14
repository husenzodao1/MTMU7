import { NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { bearerToken, createAnonymousClient } from "@/lib/supabase/app-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A session of its own for the pages the phone app still shows from the site.
 *
 * The app keeps its own session; handing that same session to the page inside
 * it would have two holders refreshing one token, and GoTrue, seeing a refresh
 * token used twice, ends the whole session — the app would be signed out. So
 * the app proves who it is with its access token, and gets a second, separate
 * session for the page: made here for that same person (a one-time link the
 * server generates and redeems at once, never sent anywhere), with its own
 * refresh token. The app writes it into the page's cookies.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const anonymous = createAnonymousClient();
  const { data: who, error: userError } = await anonymous.auth.getUser(token);
  const email = who?.user?.email;
  if (userError || !email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let admin;
  try {
    admin = createPrivilegedClient();
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link?.properties?.hashed_token;
  if (linkError || !hash) {
    console.error("[app/web-session] link failed", { code: (linkError as { code?: string } | null)?.code });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { data, error } = await anonymous.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  if (error || !data.session) {
    console.error("[app/web-session] verify failed", { code: (error as { code?: string } | null)?.code });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
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
