/**
 * Points Telegram at this deployment.
 *
 *   node scripts/telegram/setup.mts https://portal.example.tj
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment —
 * .env.local is enough locally, and on Vercel they are project variables. It
 * prints what it did and never prints either value: this script is the sort of
 * thing whose output gets pasted into a chat.
 *
 * Run it once after deploying, and again whenever the URL changes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

/** Loads .env.local the way Next.js would, without pulling Next in. */
function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match as unknown as [string, string, string];
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "").trim();
  }
}

loadEnvLocal();

const base = process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN is not set. Put it in .env.local, or export it for this command only.");
if (!secret || secret.length < 32) {
  fail("TELEGRAM_WEBHOOK_SECRET is not set, or is shorter than 32 characters.\n  Generate one with:  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
}
if (!base || !/^https:\/\//.test(base)) fail("Pass the site's https URL, e.g. node scripts/telegram/setup.mts https://portal.example.tj");

const url = `${base.replace(/\/+$/, "")}/api/telegram/webhook`;

async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!payload.ok) throw new Error(`${method}: ${payload.description ?? response.status}`);
  return payload.result as T;
}

try {
  const me = await call<{ username: string; first_name: string }>("getMe");
  await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  });
  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Оғоз / Начать" },
      { command: "menu", description: "Меню" },
      { command: "add", description: "Иловаи фарзанд / Добавить ребёнка" },
      { command: "lang", description: "Забон / Язык" },
      { command: "help", description: "Кӯмак / Помощь" },
    ],
  });
  const info = await call<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");

  console.log(`\n  Bot:      @${me.username} (${me.first_name})`);
  console.log(`  Webhook:  ${info.url}`);
  console.log(`  Pending:  ${info.pending_update_count}`);
  if (info.last_error_message) console.log(`  Last error: ${info.last_error_message}`);
  console.log("\n  Commands registered. The bot is listening.\n");
  console.log("  Still to do by hand:");
  console.log("    · make the bot an administrator of the channel, or the subscription check cannot work;");
  console.log("    · set TELEGRAM_CHANNEL if the channel is not @istaravshan_schools.\n");
} catch (error) {
  fail(error instanceof Error ? error.message : "setup failed");
}
