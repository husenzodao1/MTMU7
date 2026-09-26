import { after, NextResponse } from "next/server";
import { isUuid } from "@/lib/validation/uuid";
import { dispatchMessagePush, isAnyPushConfigured } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The sender's browser, right after its message landed: "tell the others".
 *
 * The message is written straight to the database from the browser, which is
 * what makes sending feel instant, so the push has to be asked for separately.
 * The caller only has to be able to see the message — row level security says
 * whether they can — because the database hands each message out once and only
 * while it is fresh: a second ask, from anybody, sends nothing.
 *
 * Answers before a single push is sent; the pushes go out after the response.
 */
export async function POST(request: Request) {
  if (!isAnyPushConfigured()) return NextResponse.json({ queued: false }, { status: 202 });

  let id: unknown;
  try {
    ({ id } = (await request.json()) as { id?: unknown });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!isUuid(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: visible } = await supabase.from("messages").select("id").eq("id", id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  after(() => dispatchMessagePush(id));
  return NextResponse.json({ queued: true }, { status: 202 });
}
