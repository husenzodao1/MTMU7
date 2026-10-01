/**
 * Verifies that every translation key referenced from source code exists in
 * the English catalog (the fallback for all locales).
 *
 * Detects translators bound with
 *   const t = await getTranslations("ns")  /  const t = useTranslations("ns")
 * and then checks t("key"), t.rich("key"), t.markup("key"), t.raw("key").
 * Template-literal keys (t(`status.${x}`)) are checked by their static prefix,
 * which must resolve to a message group. Literal i18n keys returned by server
 * actions ("errors.*", "validation.*") are checked as full keys.
 *
 *   node scripts/i18n/check-usage.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");
const MESSAGES_ROOT = join(SRC, "messages");
const MESSAGES = join(MESSAGES_ROOT, "en");

function flatten(value: unknown, prefix = "", leaves = new Set<string>(), groups = new Set<string>()) {
  if (typeof value === "string") {
    leaves.add(prefix);
  } else if (value && typeof value === "object") {
    if (prefix) groups.add(prefix);
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, leaves, groups);
  }
  return { leaves, groups };
}

const leaves = new Set<string>();
const groups = new Set<string>();
for (const file of readdirSync(MESSAGES).filter((f) => f.endsWith(".json"))) {
  flatten(JSON.parse(readFileSync(join(MESSAGES, file), "utf8")), "", leaves, groups);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === MESSAGES_ROOT || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const problems: string[] = [];
const BIND = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g;
const LITERAL_KEY = /["']((?:errors|validation|nav|admin\.nav)\.[A-Za-z0-9_.]+)["']/g;
// Keys passed to success()/failure() result helpers, e.g. success("portal.profile.saved").
const RESULT_KEY = /\b(?:success|failure)\(\s*(?:"([a-z][\w.]+)"|`([a-z][\w.]*)\$\{)/g;

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;

  const bindings = [...source.matchAll(BIND)];
  for (const [position, bind] of bindings.entries()) {
    const name = bind[1]!;
    const namespace = bind[2] ?? bind[3] ?? "";
    // A binding is in effect until the next binding of the same name (functions are sequential in a file).
    const next = bindings.slice(position + 1).find((b) => b[1] === name);
    const start = bind.index! + bind[0].length;
    const end = next?.index ?? source.length;
    const escaped = name.replace(/\$/g, "\\$");
    const call = new RegExp(`(?<![\\w$.])${escaped}(?:\\.(?:rich|markup|raw|has))?\\(\\s*(?:"([^"]+)"|'([^']+)'|\`([^\`]+)\`)`, "g");
    for (const use of source.slice(start, end).matchAll(call)) {
      use.index = use.index! + start;
      if (use[0].includes(".has(")) continue;
      const staticKey = use[1] ?? use[2];
      if (staticKey !== undefined) {
        const full = namespace ? `${namespace}.${staticKey}` : staticKey;
        if (!leaves.has(full)) problems.push(`${rel}:${lineOf(use.index!)} missing "${full}"`);
        continue;
      }
      const template = use[3]!;
      const prefix = template.split("${")[0]!.replace(/\.$/, "");
      if (!template.includes("${")) {
        const full = namespace ? `${namespace}.${template}` : template;
        if (!leaves.has(full)) problems.push(`${rel}:${lineOf(use.index!)} missing "${full}"`);
      } else if (prefix) {
        const full = namespace ? `${namespace}.${prefix}` : prefix;
        if (!groups.has(full) && !leaves.has(full)) problems.push(`${rel}:${lineOf(use.index!)} missing group "${full}"`);
      } else if (namespace && !groups.has(namespace)) {
        problems.push(`${rel}:${lineOf(use.index!)} missing namespace "${namespace}"`);
      }
    }
  }

  for (const result of source.matchAll(RESULT_KEY)) {
    const key = result[1];
    const prefix = result[2]?.replace(/\.$/, "");
    if (key && !leaves.has(key)) problems.push(`${rel}:${lineOf(result.index!)} missing "${key}"`);
    if (prefix && !groups.has(prefix)) problems.push(`${rel}:${lineOf(result.index!)} missing group "${prefix}"`);
  }

  for (const literal of source.matchAll(LITERAL_KEY)) {
    const key = literal[1]!;
    if (key.endsWith(".")) continue;
    if (!leaves.has(key) && !groups.has(key)) problems.push(`${rel}:${lineOf(literal.index!)} missing "${key}"`);
  }
}

if (problems.length > 0) {
  console.error(`i18n usage check failed (${problems.length}):`);
  for (const p of [...new Set(problems)].slice(0, 400)) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n usage check passed: ${leaves.size} English keys cover all static references.`);
