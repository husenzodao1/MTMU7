import { after, NextResponse } from "next/server";
import { z } from "zod";
import { MESSAGE_MAX_LENGTH } from "@/features/messages/types";
import { verifyReplyToken } from "@/lib/push/reply-token";
import { dispatchMessagePush, replySigningKey } from "@/lib/push/send";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A notification, answered where it is shown: the reply box on a phone's
 * notification, or the "mark as read" button.
 *
 * No session comes with it — a notification is drawn by the phone or the
 * browser, not by a page of the portal — so the request carries the signed
 * note the push was sent with (lib/push/reply-token.ts), naming one person in
 * one conversation. The database then asks, as for any message, whether that
 * person may still write there (00071).
 */
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), token: z.string().max(400), text: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH) }),
  z.object({ action: z.literal("read"), token: z.string().max(400) }),
]);

interface Rpc {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

// A reply box is used by a thumb, not a script: a handful a minute is plenty,
// and more from one note is somebody else holding it. Per instance, which is
// enough to blunt a burst; the note's own expiry bounds the rest.
const recent = new Map<string, number[]>();
function tooMany(token: string, now: number): boolean {
  const window = (recent.get(token) ?? []).filter((at) => now - at < 60_000);
  window.push(now);
  recent.set(token, window);
  if (recent.size > 5000) recent.clear();
  return window.length > 10;
}

export async function POST(request: Request) {
  const key = replySigningKey();
  if (!key) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const grant = verifyReplyToken(parsed.data.token, key);
  if (!grant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (tooMany(parsed.data.token, Date.now())) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // Both functions are executable by service_role alone, so they are absent
  // from the generated types; cast the client, never the method.
  const client = createPrivilegedClient() as unknown as Rpc;

  if (parsed.data.action === "read") {
    const { error } = await client.rpc("read_from_notification", { p_user_id: grant.userId, p_conversation_id: grant.conversationId });
    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  }

  const { data, error } = await client.rpc("reply_from_notification", {
    p_user_id: grant.userId,
    p_conversation_id: grant.conversationId,
    p_content: parsed.data.text,
  });
  if (error) {
    const refused = /not_allowed/.test(error.message ?? "");
    return NextResponse.json({ error: refused ? "Forbidden" : "Failed" }, { status: refused ? 403 : 500 });
  }
  const messageId = typeof data === "string" ? data : null;
  if (messageId) after(() => dispatchMessagePush(messageId));
  return NextResponse.json({ id: messageId }, { status: 201 });
}
