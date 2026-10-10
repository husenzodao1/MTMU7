import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { hasValidCronAuthorization } from "@/lib/security/cron";
import { isTelegramConfigured, sendMessage, sendPhotoFile, TelegramError } from "@/lib/telegram/api";
import * as db from "@/lib/telegram/db";
import { absenceMessage, asLocale, gradeMessage, reportCaption, reportMessage } from "@/lib/telegram/messages";
import { renderReportCard } from "@/lib/telegram/report-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Flushes the outbox.
 *
 * Runs every minute. Everything due goes out; everything that fails is left for
 * the next minute with the reason written beside it, and a message that has
 * failed three times stops being tried — a parent would rather miss one mark
 * than be woken by the same one every minute for a week.
 *
 * The end-of-day summaries are queued from here too, because the alternative is
 * a second schedule that has to know every school's time zone. The database
 * decides which schools have reached their evening; this only asks.
 */
async function dispatch(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"), serverEnv.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Both halves are needed, and saying which one is missing saves somebody an
  // afternoon: without the service key every call below fails on its own.
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 });
  }
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  let queued = 0;
  try {
    queued = await db.enqueueDigests();
  } catch (error) {
    console.error("Telegram digest queueing failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  let due: db.DueMessage[];
  try {
    due = await db.dueMessages(80);
  } catch (error) {
    console.error("Telegram outbox read failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }

  const delivered: string[] = [];
  let failed = 0;
  let dropped = 0;

  const started = Date.now();
  for (const item of due) {
    // Drawing report pictures takes time; what is left when the minute runs
    // short stays claimed and comes round again, never lost.
    if (Date.now() - started > 45_000) break;
    const locale = asLocale(item.locale);
    let text: string | null = null;
    let picture: Uint8Array | null = null;

    if (item.kind === "grade" && item.grade) {
      text = gradeMessage(locale, item.child, item.grade, item.school);
    } else if (item.kind === "absence" && item.absence) {
      text = absenceMessage(locale, item.child, item.absence, item.school);
    } else if (item.kind === "digest" && item.digest) {
      // The evening report is a picture with a line under it; the text is
      // kept for when the picture cannot be drawn.
      picture = await renderReportCard(locale, item.digest, "day", item.school);
      text = picture ? reportCaption(locale, item.digest, "day", item.school) : reportMessage(locale, item.digest, "day", item.school);
    }

    if (!text) {
      // The mark or the absence was deleted while the message waited. There is
      // nothing to say, so the row is retired rather than retried.
      delivered.push(item.id);
      dropped += 1;
      continue;
    }

    try {
      if (picture) await sendPhotoFile(item.chat, picture, text);
      else await sendMessage(item.chat, text);
      delivered.push(item.id);
    } catch (error) {
      if (error instanceof TelegramError && error.gone) {
        // They blocked the bot or deleted the chat. Forgetting them takes the
        // outbox rows with it.
        await db.forgetChat(item.chat).catch(() => {});
        continue;
      }
      failed += 1;
      await db
        .markFailed(item.id, error instanceof Error ? error.message : "unknown")
        .catch(() => {});
    }
  }

  if (delivered.length > 0) {
    try {
      await db.markDelivered(delivered);
    } catch (error) {
      console.error("Telegram delivery bookkeeping failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return NextResponse.json({ queued, sent: delivered.length - dropped, dropped, failed });
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}
