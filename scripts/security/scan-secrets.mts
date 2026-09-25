/**
 * Secret scanner for tracked files (and, with --staged, the git index).
 * Fails when a likely credential is found. Runs in CI and before commits.
 *
 *   node scripts/security/scan-secrets.mts            # all tracked files
 *   node scripts/security/scan-secrets.mts --staged   # staged changes only
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

interface Rule {
  id: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "supabase-secret-key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  // The password must not be a placeholder. `${variable}` in a template literal
  // and `<password>` in a usage message are instructions for supplying a
  // credential, not a credential; flagging them teaches people that this
  // scanner cries wolf, which is how a real finding gets waved through.
  { id: "postgres-url-with-password", pattern: /postgres(?:ql)?:\/\/[^:\s/]+:(?![^@\s]*(?:\$\{|<[a-z_-]+>))[^@\s]{6,}@/ },
  { id: "generic-assignment", pattern: /\b(?:SERVICE_ROLE_KEY|SECRET|API_KEY|PASSWORD|TOKEN)\s*=\s*["']?[A-Za-z0-9_\-./+]{24,}/ },
];

const FORBIDDEN_FILES = [/(^|\/)\.env(?!\.example$)(\..+)?$/, /(^|\/)\.vercel\//];
const SKIP = [/^package-lock\.json$/, /\.(png|jpg|jpeg|ico|webp|woff2?)$/, /^scripts\/security\/scan-secrets\.mts$/];

const staged = process.argv.includes("--staged");
const files = execFileSync("git", staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"] : ["ls-files"], {
  encoding: "utf8",
})
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

const findings: string[] = [];
for (const file of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(file))) {
    findings.push(`${file}: environment/deployment state file must not be committed`);
    continue;
  }
  if (SKIP.some((re) => re.test(file))) continue;
  let content: string;
  try {
    if (statSync(file).size > 2_000_000) continue;
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) findings.push(`${file}:${index + 1}: possible ${rule.id}`);
    }
  });
}

if (findings.length > 0) {
  console.error(`Secret scan failed (${findings.length} finding${findings.length === 1 ? "" : "s"}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} file${files.length === 1 ? "" : "s"} checked).`);
