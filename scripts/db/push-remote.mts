/**
 * Applies every migration, in order, to a remote Postgres database.
 *
 *   node scripts/db/push-remote.mts            # apply what is missing
 *   node scripts/db/push-remote.mts --list     # show what would run, change nothing
 *
 * The connection string is read from SUPABASE_DB_URL in the environment or in
 * .env.local. It is never printed: the password inside it stays where it was
 * put. Each file is handed to psql by path, so the SQL itself is never carried
 * through this process either.
 *
 * Applied migrations are recorded the way the Supabase CLI records them, in
 * supabase_migrations.schema_migrations, so a later `supabase db push` agrees
 * with what is already there.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const listOnly = process.argv.includes("--list");

function fromEnvFile(key: string): string | undefined {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return undefined;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`).exec(line);
    if (match) return match[1]!.trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const setting = (key: string) => process.env[key] || fromEnvFile(key);

/**
 * Where to connect. A whole connection string wins when one is given.
 * Otherwise a password and a project reference are enough: the addresses a
 * Supabase project answers on follow a known shape, and assembling them here
 * spares the operator the two traps that shape sets — a direct address that
 * only exists over IPv6, and a password whose punctuation silently truncates
 * the URL.
 */
function candidates(): string[] {
  // An explicit string is tried first but never alone: one left over in a shell
  // from an earlier attempt must not shut out the addresses that would work.
  const explicit = setting("SUPABASE_DB_URL");
  const assembled: string[] = [];

  const password = setting("SUPABASE_DB_PASSWORD");
  const ref = setting("SUPABASE_PROJECT_REF") ?? /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(setting("NEXT_PUBLIC_SUPABASE_URL") ?? "")?.[1];
  const region = setting("SUPABASE_REGION") ?? "eu-central-1";

  if (password && ref) {
    // A shell that asked for another line while the quote was still open puts a
    // newline inside the value, and the password is then wrong in a way nothing
    // downstream can explain.
    if (/[\r\n\t]/.test(password)) {
      console.error(
        [
          "SUPABASE_DB_PASSWORD contains a line break or a tab.",
          "That happens when the closing quote was on a later line — PowerShell",
          "shows >> while it waits for it. Set it again on a single line.",
        ].join("\n")
      );
      process.exit(1);
    }
    if (password !== password.trim()) {
      console.error("SUPABASE_DB_PASSWORD has leading or trailing spaces. Set it again without them.");
      process.exit(1);
    }
    // Percent-encoding is what makes # @ / ? and % survive inside a URL.
    const safe = encodeURIComponent(password);
    assembled.push(
      // Session pooler: IPv4, and the one to use for migrations.
      `postgresql://postgres.${ref}:${safe}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${ref}:${safe}@aws-1-${region}.pooler.supabase.com:5432/postgres`,
      // Direct connection, for networks that do have IPv6.
      `postgresql://postgres:${safe}@db.${ref}.supabase.co:5432/postgres`
    );
  }

  const all = [...(explicit ? [explicit] : []), ...assembled];
  if (all.length > 0) return all;

  console.error(
    [
      "Nothing to connect with.",
      "",
      "Either give the whole connection string:",
      "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
      "",
      "or just the password, and let this script work out the rest:",
      "  SUPABASE_DB_PASSWORD=<password>",
      "  SUPABASE_PROJECT_REF=<ref>        # or NEXT_PUBLIC_SUPABASE_URL in .env.local",
      "  SUPABASE_REGION=eu-central-1      # optional, this is the default",
      "",
      "Either may be set in the environment or in .env.local.",
    ].join("\n")
  );
  process.exit(1);
}

function psqlPath(): string {
  const candidates = [
    "psql",
    "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // try the next one
    }
  }
  console.error("psql was not found. Install the PostgreSQL client tools, or add psql to PATH.");
  process.exit(1);
}

const psql = psqlPath();

const mask = (u: string) => u.replace(/:\/\/[^@]*@/, "://<credentials>@");

/** The first address that answers, so the operator never has to guess one. */
function reachable(options: string[]): string {
  const failures: Array<{ url: string; why: string }> = [];
  for (const option of options) {
    try {
      execFileSync(psql, ["--no-psqlrc", "-d", option, "-c", "SELECT 1"], {
        // A dead address should fail in seconds, not in a minute of waiting.
        env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
        stdio: ["ignore", "ignore", "pipe"],
      });
      if (options.length > 1) console.log(`Connected on ${mask(option)}`);
      return option;
    } catch (error) {
      const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
      failures.push({ url: option, why: (stderr || String(error)).trim() });
    }
  }

  console.error("None of the addresses for this project answered.\n");
  for (const failure of failures) {
    console.error("  " + mask(failure.url));
    // Whatever the server or the resolver actually said, with the address
    // masked the same way, so a password in it cannot surface here.
    for (const line of failure.why.split(/\r?\n/).filter(Boolean)) {
      console.error("      " + mask(line));
    }
  }
  hint(failures.map((f) => f.why).join("\n"));
  process.exit(1);
}

const url = reachable(candidates());

/**
 * Two failures account for almost every refused connection, and neither says
 * so plainly in psql's own words.
 */
function hint(message: string): void {
  if (/Name or service not known|could not translate host name|Unknown host/i.test(message)) {
    console.error(
      [
        "",
        "The host in SUPABASE_DB_URL could not be found.",
        "A direct db.<ref>.supabase.co address is IPv6-only, and most networks are not.",
        "Use the Session pooler string instead: Supabase dashboard -> Project Settings ->",
        "Database -> Connection string -> Session pooler. Its user looks like postgres.<ref>",
        "and its host like aws-N-<region>.pooler.supabase.com on port 5432.",
      ].join("\n")
    );
  }
  if (/password authentication failed|SASL|authentication/i.test(message)) {
    console.error(
      [
        "",
        "The password was refused. If it contains @ : / ? # [ ] or %, those characters end",
        "the URL early and must be percent-encoded (# becomes %23). Resetting the password",
        "to letters and digits only avoids the problem entirely.",
      ].join("\n")
    );
  }
}

/** Runs SQL and returns stdout, with the connection string kept out of argv. */
function run(args: string[]): string {
  return execFileSync(psql, ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", ...args], {
    env: { ...process.env, PGPASSWORD: undefined, DATABASE_URL: url },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// The ledger the Supabase CLI keeps, created if this database has none yet.
run([
  "-d",
  url,
  "-c",
  `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
   CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
     version text PRIMARY KEY,
     statements text[],
     name text
   );`,
]);

const applied = new Set(
  run(["-d", url, "-At", "-c", "SELECT version FROM supabase_migrations.schema_migrations"])
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean)
);

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f.slice(0, f.indexOf("_"))));

console.log(`${files.length} migrations on disk, ${applied.size} already applied, ${pending.length} to run.`);
if (listOnly || pending.length === 0) {
  for (const file of pending) console.log("  pending:", file);
  process.exit(0);
}

for (const file of pending) {
  const version = file.slice(0, file.indexOf("_"));
  const name = file.slice(file.indexOf("_") + 1, -4);
  process.stdout.write(`  ${file} … `);
  try {
    // A migration and its ledger entry go in together, so a failure leaves
    // nothing half-recorded. A pooled connection can be closed under us between
    // files, which says nothing about the migration itself, so a dropped
    // connection is worth one more try before giving up on the run.
    try {
      run(["-d", url, "-1", "-f", join(MIGRATIONS, file)]);
    } catch (error) {
      const why = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : String(error);
      if (!/server closed the connection|connection to server|terminating connection|EOF detected|SSL SYSCALL/i.test(why)) throw error;
      process.stdout.write("reconnecting … ");
      run(["-d", url, "-1", "-f", join(MIGRATIONS, file)]);
    }
    run([
      "-d",
      url,
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ('${version}', '${name.replace(/'/g, "''")}')
       ON CONFLICT (version) DO NOTHING`,
    ]);
    console.log("ok");
  } catch (error) {
    console.log("failed");
    const message = error instanceof Error && "stderr" in error ? String((error as { stderr?: unknown }).stderr) : String(error);
    // The connection string may appear in psql's own error text; keep it out.
    console.error(message.split(url).join("<connection string>"));
    hint(message);
    process.exit(1);
  }
}

console.log("All migrations applied.");
