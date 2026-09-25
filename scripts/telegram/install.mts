/**
 * One command that sets the parents' bot up.
 *
 *   node scripts/telegram/install.mts
 *
 * It asks for the two things nobody else can supply — the bot token and the
 * Supabase service key — and does everything else itself: writes .env.local,
 * pushes the variables to all three Vercel environments, fills the Vault so the
 * minute job can call the site, registers the webhook and the bot's commands,
 * and then checks the whole chain and says what it found.
 *
 * What is typed at the prompts is never echoed, never logged and never printed
 * back. It goes to Vercel and to Supabase down the school's own connection.
 *
 * Safe to run again: everything it does is an upsert, and anything already set
 * is left alone unless --replace is passed.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const ENV_FILE = join(ROOT, ".env.local");
const CHANNEL = process.env.TELEGRAM_CHANNEL || "@istaravshan_schools";
const REPLACE = process.argv.includes("--replace");

const tick = "✓";
const cross = "✗";
const dot = "·";

const done: string[] = [];
const todo: string[] = [];

function say(line = ""): void {
  console.log(line);
}

// ---------------------------------------------------------------- .env.local

function readEnvFile(): Map<string, string> {
  const values = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(ENV_FILE, "utf8");
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values.set(match[1]!, match[2]!.replace(/^["']|["']$/g, "").trim());
  }
  return values;
}

function writeEnvValue(key: string, value: string): void {
  let text = "";
  try {
    text = readFileSync(ENV_FILE, "utf8");
  } catch {
    /* a first run, with no file yet */
  }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${line}\n`;
  writeFileSync(ENV_FILE, next, "utf8");
}

// ------------------------------------------------------------------ prompts

/** Does Supabase still accept this key? PostgREST answers its own root for a good one. */
async function keyWorks(url: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Reads a line without showing it. A token on screen is a token on a photograph. */
function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    say();
    say(`  ${cross} This has to be typed at a real terminal, and nothing is attached to this one.`);
    say("     Open a terminal in the project folder and run it there:");
    say("       node scripts/telegram/install.mts");
    process.exit(1);
  }
  return new Promise((resolve) => {
    const output = Object.create(process.stdout) as NodeJS.WritableStream & { muted: boolean };
    output.muted = false;
    output.write = function write(chunk: string | Uint8Array): boolean {
      if (!output.muted) process.stdout.write(chunk);
      return true;
    } as typeof process.stdout.write;

    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      output.muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
    output.muted = true;
  });
}

// -------------------------------------------------------------------- vercel

function run(command: string, args: string[], stdin?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, shell: process.platform === "win32" });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

const vercel = (args: string[], stdin?: string) => run("npx", ["--yes", "vercel", ...args], stdin);

async function vercelHas(key: string): Promise<Set<string>> {
  const { out } = await vercel(["env", "ls"]);
  const found = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(key)) continue;
    for (const env of ["Production", "Preview", "Development"]) {
      if (line.includes(env)) found.add(env.toLowerCase());
    }
  }
  return found;
}

async function pushToVercel(key: string, value: string): Promise<void> {
  const already = REPLACE ? new Set<string>() : await vercelHas(key);
  const wanted = ["production", "preview", "development"].filter((env) => !already.has(env));
  if (wanted.length === 0) {
    done.push(`${key} ${dot} already in all three Vercel environments`);
    return;
  }
  if (REPLACE) {
    for (const env of ["production", "preview", "development"]) {
      await vercel(["env", "rm", key, env, "--yes"]);
    }
  }
  const failed: string[] = [];
  for (const env of wanted) {
    const { code } = await vercel(["env", "add", key, env], value);
    if (code !== 0) failed.push(env);
  }
  if (failed.length > 0) todo.push(`${key} could not be set for: ${failed.join(", ")}`);
  else done.push(`${key} ${dot} set in ${wanted.join(", ")}`);
}

// ------------------------------------------------------------------ telegram

async function telegram<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!payload.ok) throw new Error(`${method}: ${payload.description ?? response.status}`);
  return payload.result as T;
}

// ------------------------------------------------------------------ supabase

async function configureVault(url: string, key: string, site: string, secret: string): Promise<{ scheduled: boolean }> {
  const response = await fetch(`${url}/rest/v1/rpc/telegram_configure`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ p_url: `${site}/api/cron/telegram-dispatch`, p_secret: secret }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Supabase refused the configuration (${response.status}): ${detail}`);
  }
  return (await response.json()) as { scheduled: boolean };
}

// ---------------------------------------------------------------------- main

say();
say("  Installing the parents' bot");
say("  " + "─".repeat(50));
say();

const env = readEnvFile();
const site = (process.argv.find((a) => a.startsWith("https://")) ?? env.get("NEXT_PUBLIC_APP_URL") ?? "").replace(/\/+$/, "");
const supabaseUrl = (env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "").replace(/\/+$/, "");

if (!site) {
  say(`  ${cross} I do not know the site's address.`);
  say("     Run:  node scripts/telegram/install.mts https://your-site.vercel.app");
  process.exit(1);
}
if (!supabaseUrl) {
  say(`  ${cross} NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.`);
  process.exit(1);
}

// 1. The two values only the school has.
let token = env.get("TELEGRAM_BOT_TOKEN") ?? "";
if (!token || REPLACE) {
  say("  The bot token, from @BotFather. Use /revoke first if it has ever been");
  say("  written anywhere: pasting a token somewhere is the same as giving it away.");
  say();
  token = await askHidden("  Bot token: ");
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    say(`  ${cross} That does not look like a bot token (it should read 123456:AA...).`);
    process.exit(1);
  }
  writeEnvValue("TELEGRAM_BOT_TOKEN", token);
}

let serviceKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
let serviceKeyWorks = false;
if (serviceKey) {
  serviceKeyWorks = await keyWorks(supabaseUrl, serviceKey);
  if (!serviceKeyWorks) say(`  ${dot} The service key in .env.local is not accepted any more; asking for a new one.`);
}
if (!serviceKeyWorks || REPLACE) {
  say();
  say("  The Supabase service_role key.");
  say("  Supabase → Project Settings → API → service_role → copy.");
  say();
  serviceKey = await askHidden("  service_role key: ");
  if (!(await keyWorks(supabaseUrl, serviceKey))) {
    say(`  ${cross} Supabase did not accept that key. Copy the one marked service_role, not anon.`);
    process.exit(1);
  }
  writeEnvValue("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
}

// 2. The two the installer can make up itself.
for (const key of ["TELEGRAM_WEBHOOK_SECRET", "CRON_SECRET"]) {
  if (!env.get(key)) {
    writeEnvValue(key, randomBytes(32).toString("hex"));
    env.set(key, readEnvFile().get(key)!);
  }
}
const fresh = readEnvFile();
const webhookSecret = fresh.get("TELEGRAM_WEBHOOK_SECRET")!;
const cronSecret = fresh.get("CRON_SECRET")!;
done.push(`.env.local ${dot} four variables present`);

// 3. Vercel.
say();
say("  Sending the variables to Vercel …");
for (const [key, value] of [
  ["TELEGRAM_BOT_TOKEN", token],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["TELEGRAM_WEBHOOK_SECRET", webhookSecret],
  ["CRON_SECRET", cronSecret],
] as const) {
  await pushToVercel(key, value);
}

// 4. Supabase Vault, so the minute job can reach the site.
say("  Filling the Vault …");
try {
  const result = await configureVault(supabaseUrl, serviceKey, site, cronSecret);
  done.push(`Supabase Vault ${dot} dispatch address and token stored`);
  if (result.scheduled) done.push(`pg_cron ${dot} telegram-dispatch runs every minute`);
  else todo.push("the telegram-dispatch cron job is missing — apply migration 00059");
} catch (error) {
  todo.push(`Vault: ${error instanceof Error ? error.message : "failed"}`);
}

// 5. Telegram itself.
say("  Registering the webhook …");
let botName = "";
try {
  const me = await telegram<{ username: string; id: number }>(token, "getMe");
  botName = me.username;
  await telegram(token, "setWebhook", {
    url: `${site}/api/telegram/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  });
  await telegram(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Оғоз / Начать" },
      { command: "menu", description: "Меню" },
      { command: "add", description: "Иловаи фарзанд / Добавить ребёнка" },
      { command: "lang", description: "Забон / Язык" },
      { command: "help", description: "Кӯмак / Помощь" },
    ],
  });
  done.push(`@${me.username} ${dot} webhook and commands registered`);

  // The subscription gate needs the bot to be an administrator of the channel.
  // Telegram will not name a channel's members to a stranger.
  try {
    const member = await telegram<{ status: string }>(token, "getChatMember", { chat_id: CHANNEL, user_id: me.id });
    if (["administrator", "creator"].includes(member.status)) {
      done.push(`${CHANNEL} ${dot} the bot is an administrator, so the subscription check works`);
    } else {
      todo.push(`make @${me.username} an administrator of ${CHANNEL} (Telegram → channel → Administrators → Add)`);
    }
  } catch {
    todo.push(`make @${me.username} an administrator of ${CHANNEL} (Telegram → channel → Administrators → Add)`);
  }
} catch (error) {
  todo.push(`Telegram: ${error instanceof Error ? error.message : "failed"}`);
}

// 6. Does the deployed site answer?
say("  Checking the site …");
try {
  const response = await fetch(`${site}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": webhookSecret },
    body: JSON.stringify({}),
  });
  if (response.ok) done.push(`${site} ${dot} the webhook answers`);
  else if (response.status === 503) {
    todo.push("the deployed site has not picked the new variables up yet — run:  npx vercel --prod");
  } else if (response.status === 401) {
    todo.push("the deployed site is still using the old webhook secret — run:  npx vercel --prod");
  } else {
    todo.push(`the webhook answered ${response.status}`);
  }
} catch {
  todo.push(`could not reach ${site}`);
}

// ------------------------------------------------------------------- report
say();
say("  " + "─".repeat(50));
for (const line of done) say(`  ${tick} ${line}`);
if (todo.length > 0) {
  say();
  say("  Still to do:");
  for (const line of todo) say(`  ${cross} ${line}`);
} else {
  say();
  say(`  Everything is set. Open @${botName} in Telegram and send /start.`);
}
say();
