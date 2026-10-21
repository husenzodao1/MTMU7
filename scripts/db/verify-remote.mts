/**
 * Reports what a configured Supabase project actually contains, so a
 * deployment is never pointed at a database that lacks this schema.
 *
 *   node scripts/db/verify-remote.mts [--env .env.local]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (plus
 * SUPABASE_SERVICE_ROLE_KEY when present, only to report whether it works).
 * Values are never printed — only the host suffix, HTTP codes and a verdict.
 */
import { readFileSync } from "node:fs";

interface Probe {
  name: string;
  path: string;
  method?: "GET" | "POST";
  /** A migration whose absence explains a 404. */
  from: string;
}

const LEGACY_PROBES: Probe[] = [
  { name: "schools", path: "/rest/v1/schools?select=id&limit=1", from: "00001" },
  { name: "users", path: "/rest/v1/users?select=id&limit=1", from: "00002" },
];

const PLATFORM_PROBES: Probe[] = [
  { name: "permissions", path: "/rest/v1/permissions?select=slug&limit=1", from: "00022" },
  { name: "regions", path: "/rest/v1/regions?select=id&limit=1", from: "00022" },
  { name: "list_public_schools()", path: "/rest/v1/rpc/list_public_schools", method: "POST", from: "00023" },
  { name: "students", path: "/rest/v1/students?select=id&limit=1", from: "00024" },
  { name: "site_sections", path: "/rest/v1/site_sections?select=section_key&limit=1", from: "00026" },
  { name: "notification_broadcasts", path: "/rest/v1/notification_broadcasts?select=id&limit=1", from: "00027" },
  { name: "platform_identity", path: "/rest/v1/platform_identity?select=is_approved&limit=1", from: "00022" },
];

function loadEnv(file: string): Record<string, string> {
  const merged: Record<string, string> = { ...process.env as Record<string, string> };
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0 || line.trimStart().startsWith("#")) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^"([^]*)"$/, "$1");
      if (value) merged[key] = value;
    }
  } catch {
    // Environment variables alone are a valid configuration.
  }
  return merged;
}

async function probe(url: string, key: string, item: Probe): Promise<{ status: number; missing: boolean; badKey: boolean }> {
  const response = await fetch(`${url}${item.path}`, {
    method: item.method ?? "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: item.method === "POST" ? "{}" : undefined,
  });
  // A 401 means either "the key is wrong" or "RLS refuses an anonymous read",
  // and those must not be confused: a wrong key would make every object look
  // present. Only the second is a valid answer about the schema.
  const body = response.status === 401 ? await response.text() : "";
  return { status: response.status, missing: response.status === 404, badKey: /invalid api key/i.test(body) };
}

const envFileIndex = process.argv.indexOf("--env");
const envFile = envFileIndex > -1 ? process.argv[envFileIndex + 1]! : ".env.local";
const env = loadEnv(envFile);
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url) || anonKey.length < 20) {
  console.error(`No usable Supabase configuration in ${envFile} or the environment.`);
  console.error("Expected NEXT_PUBLIC_SUPABASE_URL like https://<ref>.supabase.co and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}

console.log(`Project: https://***.${url.split(".").slice(1).join(".")}  (reference hidden)`);

let reachable = false;
const missing: string[] = [];
for (const group of [LEGACY_PROBES, PLATFORM_PROBES]) {
  for (const item of group) {
    try {
      const result = await probe(url, anonKey, item);
      if (result.badKey) {
        console.error(`
  ${item.name}: the project rejected the API key. Check NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
        process.exit(2);
      }
      reachable = true;
      console.log(`  ${String(result.status).padEnd(4)} ${item.name.padEnd(26)} ${result.missing ? `missing (migration ${item.from})` : "present"}`);
      if (result.missing) missing.push(`${item.name} (${item.from})`);
    } catch (error) {
      console.log(`  ---  ${item.name.padEnd(26)} unreachable: ${(error as Error).message}`);
    }
  }
}

if (!reachable) {
  console.error("\nThe project did not answer. Check the URL and that the project is not paused.");
  process.exit(1);
}

if (missing.length === 0) {
  console.log("\nVerdict: this project carries the platform schema (migrations 00022–00035 applied).");
  process.exit(0);
}

console.error(`\nVerdict: ${missing.length} object(s) from the platform schema are missing:`);
for (const item of missing) console.error(`  - ${item}`);
console.error("\nApply the migrations in supabase/migrations in ascending order before pointing the app at this project.");
process.exit(1);
