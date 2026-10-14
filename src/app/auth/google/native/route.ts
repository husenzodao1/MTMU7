import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { finishGoogleSignIn } from "@/lib/auth/google-finish";
import { createClient } from "@/lib/supabase/server";

const request = z.object({
  idToken: z.string().min(20).max(8192),
  next: z.string().max(512).nullish(),
});

/**
 * Sign-in with a Google account chosen from the ones on the phone.
 *
 * The app's own plugin (GoogleAccountPlugin) asks Android for the account and
 * posts Google's ID token here; Supabase checks it with Google and opens the
 * session, and the rest is exactly what the browser's way does
 * (finishGoogleSignIn). The page asked with fetch, so the answer is where to
 * go, not a redirect for fetch to follow.
 *
 * `fallback` means this portal does not accept tokens for the app's Google
 * client yet — the client id is not on Supabase's list — and the page then
 * takes the browser's way instead of failing.
 */
export async function POST(incoming: NextRequest) {
  const url = new URL(incoming.url);
  // Same origin only: this sets the session cookie, and no other site may
  // make a browser ask for that.
  if (incoming.headers.get("origin") !== url.origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = request.safeParse(await incoming.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: parsed.data.idToken });
  if (error || !data.user) {
    const message = error?.message ?? "";
    if (/audience|client id|aud\b/i.test(message)) return NextResponse.json({ fallback: true });
    return NextResponse.json({ path: /signup|not.allowed|user.not.found/i.test(message) ? "/login?reason=google-unknown" : "/login?reason=google-failed" });
  }
  return NextResponse.json({ path: await finishGoogleSignIn(supabase, data.user, parsed.data.next ?? null) });
}
