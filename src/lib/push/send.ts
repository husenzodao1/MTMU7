import "server-only";
import webpush from "web-push";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { asPushLocale, messagePush, type MessagePushSource } from "@/lib/push/payload";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

/**
 * Delivers a chat message to the devices of everybody who should hear about it.
 *
 * The database decides who that is (claim_message_push, executable by
 * service_role alone) and hands each message out once, so a sender's browser
 * asking twice, or anybody replaying the request, sends nothing the second
 * time. This file only encrypts and posts.
 *
 * Nothing here throws. A push that cannot be delivered is a notification that
 * did not arrive; the message itself is already in the conversation, and the
 * person will see it the next time they look.
 */

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = serverEnv.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    configured = false;
    return configured;
  }
  const subject = serverEnv.VAPID_SUBJECT ?? publicEnv.NEXT_PUBLIC_APP_URL ?? "mailto:no-reply@example.com";
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("[push] VAPID keys were refused", { error: error instanceof Error ? error.message : "unknown" });
    configured = false;
  }
  return configured;
}

interface Target {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string;
}

interface Claim extends MessagePushSource {
  targets: Target[];
}

interface Rpc {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

// Enough to empty a class group quickly without opening three hundred sockets
// from one function at once.
const CONCURRENCY = 16;

export async function dispatchMessagePush(messageId: string): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    // claim_message_push and forget_push_endpoints are service_role-only, so
    // they are absent from the generated types. Cast the client, never the
    // method: a detached rpc loses its receiver and throws inside supabase-js.
    const client = createPrivilegedClient() as unknown as Rpc;
    const { data, error } = await client.rpc("claim_message_push", { p_message_id: messageId });
    if (error) {
      console.error("[push] claim failed", { message: error.message });
      return;
    }
    const claim = data as Claim | null;
    if (!claim || !Array.isArray(claim.targets) || claim.targets.length === 0) return;

    const gone: string[] = [];
    const queue = [...claim.targets];
    const worker = async () => {
      for (let target = queue.shift(); target; target = queue.shift()) {
        const payload = messagePush(claim, target.user_id, asPushLocale(target.locale));
        try {
          await webpush.sendNotification(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            JSON.stringify(payload),
            {
              // A chat message a day late is still worth seeing; one a week
              // late is noise.
              TTL: 60 * 60 * 24,
              urgency: "high",
              // Replaces an undelivered push from the same conversation on the
              // push service itself, so a phone that was off gets the latest
              // message rather than twenty. Topics are at most 32 characters.
              topic: claim.conversation_id.replace(/-/g, "").slice(0, 32),
              timeout: 10_000,
            }
          );
        } catch (failure) {
          const status = (failure as { statusCode?: number }).statusCode;
          // 404 and 410 are the push service saying this browser unsubscribed
          // or was reset; anything else may work next time.
          if (status === 404 || status === 410) gone.push(target.endpoint);
          else console.warn("[push] delivery failed", { status: status ?? "network" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    if (gone.length > 0) {
      await client.rpc("forget_push_endpoints", { p_endpoints: gone });
    }
  } catch (error) {
    console.error("[push] dispatch failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}
