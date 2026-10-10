/**
 * Break-glass password reset for an operator who holds the service-role key.
 *
 *   node scripts/admin/set-user-password.mts <email>
 *
 * Use it when account email is not delivering (a fresh Supabase project sends
 * only a couple of messages per hour, and only to project members), so nobody
 * can receive a recovery code. The password is typed here, never passed on the
 * command line, never printed and never written to a file; only the outcome is
 * reported. Prefer the normal recovery flow once SMTP is configured — see
 * docs/operations/EMAIL.md.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

function loadEnv(file: string): Record<string, string> {
  const merged: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0 || line.trimStart().startsWith("#")) continue;
      merged[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^"([^]*)"$/, "$1");
    }
  } catch {
    // Environment variables alone are a valid configuration.
  }
  return merged;
}

/** Reads a line without echoing it to the terminal. */
function askSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const asMutable = rl as unknown as { _writeToOutput?: (text: string) => void; output?: { write: (text: string) => void } };
    const original = asMutable._writeToOutput?.bind(rl);
    stdout.write(prompt);
    asMutable._writeToOutput = (text: string) => {
      if (text.includes("\n")) original?.(text);
    };
    rl.question("", (answer) => {
      asMutable._writeToOutput = original;
      stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/admin/set-user-password.mts <email>");
  process.exit(2);
}

const env = loadEnv(".env.local");
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || serviceKey.length < 20) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(2);
}
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

const listed = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
if (!listed.ok) {
  console.error(`Could not read the account list (HTTP ${listed.status}).`);
  process.exit(1);
}
const { users } = (await listed.json()) as { users: Array<{ id: string; email?: string }> };
const account = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
if (!account) {
  console.error(`No account with that address in this project (${users.length} accounts checked).`);
  process.exit(1);
}

const password = await askSecret(`New password for ${email} (at least 10 characters, not shown): `);
const again = await askSecret("Repeat it: ");
if (password !== again) {
  console.error("The two entries differ; nothing was changed.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Too short: the portal requires at least 10 characters. Nothing was changed.");
  process.exit(1);
}

const updated = await fetch(`${url}/auth/v1/admin/users/${account.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password, email_confirm: true }),
});
if (!updated.ok) {
  const detail = (await updated.text()).slice(0, 200);
  console.error(`The password was not changed (HTTP ${updated.status}): ${detail}`);
  process.exit(1);
}
console.log(`Password set for ${email}. Sign in at /login; nothing was printed or stored.`);
