import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { isTelegramConfigured } from "@/lib/telegram/api";
import { handleUpdate, type Update } from "@/lib/telegram/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Telegram delivers.
 *
 * The URL is a secret of sorts, but only of sorts — it ends up in logs and
 * proxies — so the real check is the header Telegram echoes back from
 * setWebhook. Without a configured secret this route is closed: an open webhook
 * would let anybody send the bot's users whatever they liked.
 *
 * It answers 200 to everything it accepts, including updates it could not
 * process. Telegram retries a non-200, and a retried conversation step is worse
 * than a lost one.
 */

function sameSecret(sent: string | null, expected: string): boolean {
  if (!sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = serverEnv.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !isTelegramConfigured() || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // The school's photograph is served by this same deployment, so its address
  // is wherever Telegram just reached us — no configuration to fall out of step.
  const siteUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  await handleUpdate(update, { siteUrl });
  return NextResponse.json({ ok: true });
}
