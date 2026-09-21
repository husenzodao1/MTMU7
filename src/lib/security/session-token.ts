/**
 * Reads the Supabase session cookie without contacting the auth server.
 *
 * The proxy uses this to decide whether a refresh is due. It deliberately does
 * not verify the signature: that is not an authorization decision, only a hint
 * about whether to spend an auth request. Every page guard re-checks the caller
 * through the database, where the JWT is verified for real.
 */

interface CookieLike {
  name: string;
  value: string;
}

/** Joins the chunks Supabase writes when a session does not fit in one cookie. */
export function readSessionCookie(cookies: readonly CookieLike[]): string | null {
  const auth = cookies.filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name));
  if (auth.length === 0) return null;
  const chunks = auth
    .map((cookie) => {
      const match = /\.(\d+)$/.exec(cookie.name);
      return { index: match ? Number(match[1]) : 0, value: cookie.value };
    })
    .sort((a, b) => a.index - b.index);
  return chunks.map((chunk) => chunk.value).join("");
}

function decodeBase64(value: string): string | null {
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Seconds until the access token expires, or null when it cannot be read. */
export function accessTokenSecondsLeft(cookieValue: string | null, now = Date.now()): number | null {
  if (!cookieValue) return null;
  let raw = cookieValue;
  if (raw.startsWith("base64-")) {
    const decoded = decodeBase64(raw.slice("base64-".length));
    if (!decoded) return null;
    raw = decoded;
  }
  let session: unknown;
  try {
    session = JSON.parse(raw);
  } catch {
    return null;
  }
  const token =
    session && typeof session === "object" && "access_token" in session
      ? (session as { access_token?: unknown }).access_token
      : Array.isArray(session)
        ? session[0]
        : null;
  if (typeof token !== "string") return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  const json = decodeBase64(payload);
  if (!json) return null;
  try {
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== "number") return null;
    return Math.round(claims.exp - now / 1000);
  } catch {
    return null;
  }
}
