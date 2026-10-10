import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The key a notification carries so it can be answered without opening the
 * portal.
 *
 * A notification is shown by the phone or the browser, not by a page of the
 * portal, so whatever it sends back arrives without a session. It carries
 * instead a short signed note from the portal's server — "this person, in this
 * conversation, until then" — which is all the server will accept in place of
 * one. The note names nobody else and opens nothing else: it can only say
 * something in that one conversation, as that one person, for three days, and
 * only as far as the database still agrees they may.
 *
 * Pure apart from the clock, so it can be tested with a fixed secret.
 */

export interface ReplyGrant {
  userId: string;
  conversationId: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

export const REPLY_TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The signing key, derived from a server secret rather than stored beside it:
 * a key for this one purpose, so a signature made here means nothing anywhere
 * else the secret is used.
 */
export function replyKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("mtmu7/push-reply/v1").digest();
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function signReplyToken(grant: ReplyGrant, key: Buffer): string {
  const body = Buffer.from(JSON.stringify({ u: grant.userId, c: grant.conversationId, e: grant.expiresAt })).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

/** The grant a token carries, or null when it is forged, damaged or out of date. */
export function verifyReplyToken(token: unknown, key: Buffer, now: number = Date.now()): ReplyGrant | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claims: { u?: unknown; c?: unknown; e?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof claims;
  } catch {
    return null;
  }
  if (typeof claims.u !== "string" || !UUID.test(claims.u)) return null;
  if (typeof claims.c !== "string" || !UUID.test(claims.c)) return null;
  if (typeof claims.e !== "number" || !Number.isFinite(claims.e) || claims.e < now) return null;
  return { userId: claims.u, conversationId: claims.c, expiresAt: claims.e };
}
