import { createSign } from "node:crypto";

/**
 * Firebase Cloud Messaging, spoken directly: the HTTP v1 API and a service
 * account, with no SDK. The Admin SDK would bring a few megabytes into every
 * function for what is one signed token and one POST.
 *
 * The service account key arrives as its JSON, pasted as-is or base64-encoded
 * (the form some dashboards keep a multi-line value in). An access token is
 * asked for once and reused until a minute before it runs out.
 *
 * Pure apart from fetch and the clock, so it can be tested with a fake fetch
 * and a throwaway key.
 */

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw.trim(), "base64").toString("utf8");
  try {
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (
      typeof parsed.project_id === "string" &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string" &&
      parsed.private_key.includes("PRIVATE KEY")
    ) {
      return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key };
    }
  } catch {
    /* not JSON: treated as absent */
  }
  return null;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** The signed assertion Google trades for an access token. */
export function serviceAccountAssertion(account: ServiceAccount, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString("base64url")}`;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  /** Where a tap opens, as a path on the site. */
  url: string;
  /** Replaces an earlier notification from the same conversation. */
  tag: string;
}

export type FcmResult = "sent" | "gone" | "failed";

export interface FcmClient {
  send(message: FcmMessage): Promise<FcmResult>;
}

export function createFcmClient(account: ServiceAccount, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): FcmClient {
  let cached: { token: string; expires: number } | null = null;
  let pending: Promise<string | null> | null = null;

  async function accessToken(): Promise<string | null> {
    if (cached && cached.expires > now()) return cached.token;
    // One exchange at a time: forty messages arriving together share it.
    pending ??= (async () => {
      try {
        const response = await fetchImpl("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: serviceAccountAssertion(account, Math.floor(now() / 1000)),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { access_token?: string; expires_in?: number };
        if (!data.access_token) return null;
        cached = { token: data.access_token, expires: now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000 };
        return cached.token;
      } catch {
        return null;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  return {
    async send(message) {
      const token = await accessToken();
      if (!token) return "failed";
      // Collapse keys and tags are short on both platforms.
      const tag = message.tag.slice(0, 64);
      try {
        const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: { url: message.url, tag },
              android: {
                priority: "HIGH",
                collapse_key: tag,
                ttl: "86400s",
                notification: { tag, channel_id: "messages", default_sound: true },
              },
              apns: {
                headers: { "apns-priority": "10", "apns-collapse-id": tag, "apns-expiration": String(Math.floor(now() / 1000) + 86400) },
                payload: { aps: { sound: "default", "thread-id": tag } },
              },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return "sent";
        // NOT_FOUND / UNREGISTERED: the app was removed or its data cleared.
        // INVALID_ARGUMENT on the token: it was never a real one.
        if (response.status === 404) return "gone";
        if (response.status === 400) {
          const text = await response.text().catch(() => "");
          return /registration token|UNREGISTERED|INVALID_ARGUMENT/i.test(text) && /token/i.test(text) ? "gone" : "failed";
        }
        return "failed";
      } catch {
        return "failed";
      }
    },
  };
}
