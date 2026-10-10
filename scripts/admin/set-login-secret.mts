/**
 * Teaches the database the secret the sign-in action will present.
 *
 *   node scripts/admin/set-login-secret.mts
 *
 * People sign in with the login the school issued — MT10001 — and Supabase
 * signs them in by address, so something has to map one to the other. That map
 * is gated on a shared secret so it cannot be walked from MT10001 upwards by
 * anyone holding the publishable key; see public.login_lookup in migration
 * 00045.
 *
 * The secret is read from LOGIN_LOOKUP_SECRET in the environment or in
 * .env.local, never typed here and never printed. Only its SHA-256 reaches the
 * database. Run this once per project, and again whenever the value is rotated
 * — the same value must be set in the deployment's environment.
 */
import { readFileSync } from "node:fs";

function loadEnv(file: string): Record<string, string> {
  const merged: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0 || line.trimStart().startsWith("#")) continue;
      merged[line.slice(0, index).trim()] = line
        .slice(index + 1)
        .trim()
        .replace(/^"([^]*)"$/, "$1");
    }
  } catch {
    // Environment variables alone are a valid configuration.
  }
  return merged;
}

const env = loadEnv(".env.local");
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const secret = env.LOGIN_LOOKUP_SECRET ?? "";

if (!url || serviceKey.length < 20) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment or .env.local.");
  process.exit(2);
}
if (secret.length < 32) {
  console.error(
    [
      "LOGIN_LOOKUP_SECRET must be set and at least 32 characters.",
      "",
      "Generate one with:",
      "  node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",
      "",
      "Put the same value in .env.local and in the deployment's environment.",
    ].join("\n")
  );
  process.exit(2);
}

const response = await fetch(`${url}/rest/v1/rpc/set_login_secret`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_secret: secret }),
});

if (!response.ok) {
  const detail = (await response.text()).slice(0, 300);
  // The secret is in the request body, never in the URL, so a reported failure
  // cannot carry it.
  console.error(`The secret was not stored (HTTP ${response.status}): ${detail}`);
  process.exit(1);
}

console.log("Stored. Signing in by login will work once the same value is in the deployment's environment.");
