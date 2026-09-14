/**
 * Verifies that every message key exists in all locales and that ICU
 * placeholders match. Fails CI on drift.
 *
 *   node scripts/i18n/check-messages.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "src", "messages");
const LOCALES = ["en", "ru", "tg"] as const;

function flatten(value: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof value === "string") {
    out.set(prefix, value);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

function placeholders(message: string): string[] {
  // A `{word}` right after a plural/select branch selector is branch text, not an argument.
  const names = [
    ...message.matchAll(/(?<!(?:=\d+|zero|one|two|few|many|other)\s*)\{\s*([a-zA-Z0-9_]+)\s*(?:\}|,\s*(?:plural|select|selectordinal|number|date|time)\b)/g),
  ].map((m) => m[1]!);
  return [...new Set(names)].sort();
}

const catalogs = new Map<string, Map<string, string>>();
for (const locale of LOCALES) {
  const merged = new Map<string, string>();
  for (const file of readdirSync(join(ROOT, locale)).filter((f) => f.endsWith(".json"))) {
    const content = JSON.parse(readFileSync(join(ROOT, locale, file), "utf8"));
    for (const [k, v] of flatten(content)) {
      if (merged.has(k)) throw new Error(`Duplicate key ${k} in ${locale}/${file}`);
      merged.set(k, v);
    }
  }
  catalogs.set(locale, merged);
}

const problems: string[] = [];
const english = catalogs.get("en")!;
for (const locale of LOCALES.filter((l) => l !== "en")) {
  const catalog = catalogs.get(locale)!;
  for (const [key, value] of english) {
    const translated = catalog.get(key);
    if (translated === undefined) {
      problems.push(`${locale}: missing ${key}`);
      continue;
    }
    if (placeholders(value).join(",") !== placeholders(translated).join(",")) {
      problems.push(`${locale}: placeholder mismatch in ${key}`);
    }
  }
  for (const key of catalog.keys()) {
    if (!english.has(key)) problems.push(`${locale}: extra key ${key}`);
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const p of problems.slice(0, 200)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n check passed: ${english.size} keys × ${LOCALES.length} locales.`);
