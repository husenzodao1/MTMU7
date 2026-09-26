import "server-only";
import webpush from "web-push";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { createFcmClient, readServiceAccount, type FcmClient } from "@/lib/push/fcm";
import { actionLabels, asPushLocale, messagePush, type MessagePushSource, type PushLocale } from "@/lib/push/payload";
import { REPLY_TOKEN_TTL_MS, replyKey, signReplyToken } from "@/lib/push/reply-token";
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

let fcm: FcmClient | null | undefined;

/** The phone app's channel: Firebase, when a service account is configured. */
function nativeClient(): FcmClient | null {
  if (fcm !== undefined) return fcm;
  const account = serverEnv.SUPABASE_SERVICE_ROLE_KEY ? readServiceAccount(serverEnv.FIREBASE_SERVICE_ACCOUNT) : null;
  if (serverEnv.FIREBASE_SERVICE_ACCOUNT && !account) console.error("[push] FIREBASE_SERVICE_ACCOUNT is not a service account key");
  fcm = account ? createFcmClient(account) : null;
  return fcm;
}

/** Whether any kind of device can be reached at all. */
export function isAnyPushConfigured(): boolean {
  return isPushConfigured() || nativeClient() !== null;
}

interface Target {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string;
}

interface Device {
  user_id: string;
  token: string;
  platform: string;
  locale: string;
}

interface Claim extends MessagePushSource {
  targets: Target[];
  devices?: Device[];
}

interface Rpc {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

let signingKey: Buffer | null | undefined;

/**
 * The key a notification's reply is signed with, or null when the server has
 * no secret to derive it from (and so no way to accept the reply either).
 */
export function replySigningKey(): Buffer | null {
  if (signingKey === undefined) {
    signingKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY ? replyKey(serverEnv.SUPABASE_SERVICE_ROLE_KEY) : null;
  }
  return signingKey;
}

/**
 * What a notification needs to be answered where it is shown: a signed note
 * for this reader in this conversation, and the words on its buttons. Nothing
 * for an announcement channel, where readers do not write.
 */
function replyExtras(claim: Claim, readerId: string, locale: PushLocale): { reply?: string; labels?: ReturnType<typeof actionLabels> } {
  const key = replySigningKey();
  if (!key || claim.conversation_type === "announcement") return {};
  return {
    reply: signReplyToken({ userId: readerId, conversationId: claim.conversation_id, expiresAt: Date.now() + REPLY_TOKEN_TTL_MS }, key),
    labels: actionLabels(locale),
  };
}

// Enough to empty a class group quickly without opening three hundred sockets
// from one function at once.
const CONCURRENCY = 16;

export async function dispatchMessagePush(messageId: string): Promise<void> {
  const web = isPushConfigured();
  const native = nativeClient();
  if (!web && !native) return;
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
    if (!claim) return;
    await Promise.all([
      web && Array.isArray(claim.targets) && claim.targets.length > 0 ? sendToBrowsers(client, claim) : null,
      native && Array.isArray(claim.devices) && claim.devices.length > 0 ? sendToPhones(client, native, claim) : null,
    ]);
  } catch (error) {
    console.error("[push] dispatch failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}

async function sendToPhones(client: Rpc, native: FcmClient, claim: Claim): Promise<void> {
  const gone: string[] = [];
  const queue = [...(claim.devices ?? [])];
  const worker = async () => {
    for (let device = queue.shift(); device; device = queue.shift()) {
      const locale = asPushLocale(device.locale);
      const payload = messagePush(claim, device.user_id, locale);
      const extras = replyExtras(claim, device.user_id, locale);
      const result = await native.send({
        token: device.token,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        reply: extras.reply,
        labels: extras.labels,
      });
      if (result === "gone") gone.push(device.token);
      else if (result === "failed") console.warn("[push] phone delivery failed", { platform: device.platform });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (gone.length > 0) await client.rpc("forget_device_tokens", { p_tokens: gone });
}

async function sendToBrowsers(client: Rpc, claim: Claim): Promise<void> {
  const gone: string[] = [];
  const queue = [...claim.targets];
  const worker = async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      const locale = asPushLocale(target.locale);
      const payload = { ...messagePush(claim, target.user_id, locale), ...replyExtras(claim, target.user_id, locale) };
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
}
