/**
 * One command for the three settings the portal needs outside this repository.
 *
 *   npm run portal:setup
 *
 *   1. The code in every sign-in email is six digits. The length is a setting
 *      of the Supabase project, not of this code; a project left on eight sends
 *      codes the portal's screens call six-digit ones.
 *   2. "Sign in with Google" is switched on, with the school's Google client,
 *      and the portal's /auth/callback is on the list of places Supabase may
 *      send people back to.
 *   3. Web Push keys exist, so a message reaches somebody whose tab is closed.
 *      They are generated here, once, and sent to all three Vercel
 *      environments.
 *   4. The sign-in emails reach the inbox, not spam: they go out through a
 *      sender that is allowed to send for its own address (a Gmail account
 *      with an app password, or any SMTP service), with the portal's
 *      spam-safe templates and subjects (scripts/setup/email-templates.mts).
 *
 * It asks for a Supabase personal access token (the Management API will not
 * take the service key) and, optionally, the Google client id and secret.
 * Nothing typed is echoed, logged or printed back.
 *
 * Safe to run again: the Supabase settings are simply set to the same values,
 * and existing Web Push keys are kept unless --replace is passed — replacing
 * them silently unsubscribes every device that already said yes.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";
import { templatePatch } from "./email-templates.mts";

const ROOT = join(import.meta.dirname, "..", "..");
const ENV_FILE = join(ROOT, ".env.local");
const REPLACE = process.argv.includes("--replace");
const OTP_LENGTH = 6;

const tick = "✓";
const cross = "✗";
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

function ask(question: string, hidden: boolean): Promise<string> {
  if (!process.stdin.isTTY) {
    say(`  ${cross} This has to be run at a real terminal:  npm run portal:setup`);
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
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
    output.muted = hidden;
  });
}

// -------------------------------------------------------------------- vercel

/** One command line through the shell; everything interpolated is a constant. */
function run(commandLine: string, stdin?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(commandLine, { cwd: ROOT, shell: true });
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

async function pushToVercel(key: string, value: string): Promise<void> {
  const failed: string[] = [];
  for (const env of ["production", "preview", "development"]) {
    if (REPLACE) await run(`npx --yes vercel env rm ${key} ${env} --yes`);
    const { code, out } = await run(`npx --yes vercel env add ${key} ${env}`, value);
    // A key that is already there is kept, not reported as a failure: the
    // Vercel CLI says so as "already exists" or "has already been added".
    if (code !== 0 && !/already (exists|been added)/i.test(out)) failed.push(env);
  }
  if (failed.length > 0) todo.push(`${key} could not be set in Vercel for: ${failed.join(", ")}`);
  else done.push(`${key} is in Vercel`);
}

// ------------------------------------------------------------------ supabase

interface AuthConfig {
  mailer_otp_length?: number;
  external_google_enabled?: boolean;
  uri_allow_list?: string;
  site_url?: string;
}

async function management<T>(token: string, ref: string, method: "GET" | "PATCH", body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// ---------------------------------------------------------------------- main

const env = readEnvFile();
const supabaseUrl = (env.get("NEXT_PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(supabaseUrl)?.[1];
const site = (process.argv.find((a) => a.startsWith("https://")) ?? env.get("NEXT_PUBLIC_APP_URL") ?? "").replace(/\/+$/, "");

say();
say("  The portal's settings outside the code");
say("  ──────────────────────────────────────");

if (!ref) {
  say(`  ${cross} NEXT_PUBLIC_SUPABASE_URL in .env.local is not a Supabase project address.`);
  process.exit(1);
}
if (!site) {
  say(`  ${cross} The site's address is not known. Pass it:  npm run portal:setup -- https://your-site.vercel.app`);
  process.exit(1);
}

say();
say("  1. A Supabase personal access token:");
say("     https://supabase.com/dashboard/account/tokens  →  Generate new token");
const token = await ask("     Token (hidden): ", true);

say();
say("  2. Google (press Enter twice to skip). Google Cloud Console → APIs & Services →");
say("     Credentials → OAuth client ID (Web). Authorised redirect URI:");
say(`       ${supabaseUrl}/auth/v1/callback`);
const googleId = await ask("     Client ID: ", false);
const googleSecret = googleId ? await ask("     Client secret (hidden): ", true) : "";

say();
say("  3. The address sign-in codes are sent from (press Enter to skip).");
say("     A Gmail account works best without a domain of your own: Google →");
say("     Security → 2-Step Verification → App passwords → create one.");
const smtpUser = await ask("     Sender address (e.g. school@gmail.com): ", false);
const smtpPass = smtpUser ? await ask("     App password or SMTP password (hidden): ", true) : "";
const smtpHost = smtpUser ? (await ask("     SMTP host [smtp.gmail.com]: ", false)) || "smtp.gmail.com" : "";
const smtpPort = smtpUser ? (await ask("     SMTP port [465]: ", false)) || "465" : "";

if (token) {
  const current = await management<AuthConfig>(token, ref, "GET");
  if (!current.ok || !current.data) {
    todo.push(
      current.status === 401 || current.status === 403
        ? "the Supabase token was refused — make a new one at supabase.com/dashboard/account/tokens"
        : "Supabase's Management API did not answer; try again in a minute"
    );
  } else {
    const allow = new Set((current.data.uri_allow_list ?? "").split(",").map((u) => u.trim()).filter(Boolean));
    // The callback carries its own query (?via=google&next=…), which an exact
    // entry does not match; the wildcard covers it, the exact ones say why.
    for (const path of ["/auth/callback", "/auth/confirm", "/verify", "/**"]) allow.add(`${site}${path}`);
    const patch: Record<string, unknown> = {
      mailer_otp_length: OTP_LENGTH,
      uri_allow_list: [...allow].join(","),
    };
    if (!current.data.site_url) patch.site_url = site;
    // The spam-safe templates and subjects, always.
    Object.assign(patch, templatePatch());
    if (smtpUser && smtpPass) {
      // The From address is the account that sends it: that is what lets
      // Gmail's (or the provider's) SPF and DKIM vouch for the message.
      Object.assign(patch, {
        smtp_admin_email: smtpUser,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_sender_name: "МТМУ №7",
        smtp_max_frequency: 30,
        // Gmail sends ~500 a day; an hourly cap well under that keeps one
        // busy morning from spending the whole day's allowance.
        rate_limit_email_sent: 120,
      });
    }
    if (googleId && googleSecret) {
      patch.external_google_enabled = true;
      patch.external_google_client_id = googleId;
      patch.external_google_secret = googleSecret;
    }
    const saved = await management<AuthConfig>(token, ref, "PATCH", patch);
    if (!saved.ok) {
      todo.push(`Supabase refused the settings (HTTP ${saved.status})`);
    } else {
      const check = await management<AuthConfig>(token, ref, "GET");
      const length = check.data?.mailer_otp_length;
      if (length === OTP_LENGTH) done.push(`sign-in codes are ${OTP_LENGTH} digits`);
      else todo.push(`the code length reads ${length ?? "unknown"}; set it by hand: Authentication → Providers → Email → Email OTP Length`);
      if (googleId && googleSecret) {
        if (check.data?.external_google_enabled) done.push("Sign in with Google is on");
        else todo.push("Google did not switch on; check the client id and secret");
      } else if (!check.data?.external_google_enabled) {
        todo.push("Google is still off — run this again with the client id and secret when you have them");
      }
      done.push(`${site}/auth/callback is an allowed return address`);
      done.push("sign-in emails use the spam-safe templates and subjects");
      if (smtpUser && smtpPass) done.push(`sign-in emails are sent from ${smtpUser} through ${smtpHost}:${smtpPort}`);
      else todo.push("no sender was given: emails keep going out the way they did (see docs/operations/EMAIL.md)");
    }
  }
} else {
  todo.push("no Supabase token, so the code length and Google were not touched");
}

// Web Push keys: made once, kept for good.
let publicKey = env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? "";
let privateKey = env.get("VAPID_PRIVATE_KEY") ?? "";
if (REPLACE || !publicKey || !privateKey) {
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  writeEnvValue("NEXT_PUBLIC_VAPID_PUBLIC_KEY", publicKey);
  writeEnvValue("VAPID_PRIVATE_KEY", privateKey);
  done.push("Web Push keys generated and written to .env.local");
} else {
  done.push("Web Push keys already in .env.local, kept");
}
const subject = env.get("VAPID_SUBJECT") || site;
writeEnvValue("VAPID_SUBJECT", subject);
await pushToVercel("NEXT_PUBLIC_VAPID_PUBLIC_KEY", publicKey);
await pushToVercel("VAPID_PRIVATE_KEY", privateKey);
await pushToVercel("VAPID_SUBJECT", subject);
todo.push("redeploy so the site picks the keys up:  npx vercel --prod");

say();
for (const line of done) say(`  ${tick} ${line}`);
for (const line of todo) say(`  ${cross} ${line}`);
say();
