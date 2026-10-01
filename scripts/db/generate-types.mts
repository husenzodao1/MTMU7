/**
 * Generates src/lib/db/database.types.ts from the real migration chain.
 *
 * The schema is built in an in-process PostgreSQL (PGlite) and introspected,
 * producing the same shape as `supabase gen types typescript` for the public
 * schema, without needing Docker or a live project.
 *
 *   node scripts/db/generate-types.mts          # write the file
 *   node scripts/db/generate-types.mts --check  # fail when the file is stale (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "../../tests/db/harness.mts";

const OUTPUT = join(import.meta.dirname, "..", "..", "src", "lib", "db", "database.types.ts");
const check = process.argv.includes("--check");

const db = await createDatabase();

interface ColumnRow {
  table_name: string;
  column_name: string;
  udt_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  has_default: boolean;
  is_generated: boolean;
  is_identity: boolean;
}

const columns = (
  await db.query<ColumnRow>(`
    SELECT c.table_name, c.column_name, c.udt_name, c.data_type, c.is_nullable,
           (c.column_default IS NOT NULL) AS has_default,
           (c.is_generated = 'ALWAYS') AS is_generated,
           (c.is_identity = 'YES') AS is_identity
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `)
).rows;

interface RelRow {
  constraint_name: string;
  table_name: string;
  columns: string[];
  referenced_table: string;
  referenced_columns: string[];
  is_one_to_one: boolean;
}

const relationships = (
  await db.query<RelRow>(`
    SELECT con.conname AS constraint_name,
           rel.relname AS table_name,
           ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(n, o)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS columns,
           frel.relname AS referenced_table,
           ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(n, o)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS referenced_columns,
           EXISTS (
             SELECT 1 FROM pg_index i
             WHERE i.indrelid = con.conrelid AND i.indisunique AND i.indpred IS NULL
               AND (SELECT array_agg(x ORDER BY x) FROM unnest(i.indkey::int2[]) x) =
                   (SELECT array_agg(x ORDER BY x) FROM unnest(con.conkey) x)
           ) AS is_one_to_one
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_class frel ON frel.oid = con.confrelid
    JOIN pg_namespace fns ON fns.oid = frel.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public' AND fns.nspname = 'public'
    ORDER BY rel.relname, con.conname
  `)
).rows;

interface FnRow {
  name: string;
  arg_names: string[] | null;
  arg_types: string[];
  arg_modes: string[] | null;
  num_defaults: number;
  return_type: string;
  returns_set: boolean;
  table_columns: Array<{ name: string; type: string }> | null;
}

const functions = (
  await db.query<FnRow>(`
    SELECT p.proname AS name,
           p.proargnames AS arg_names,
           ARRAY(SELECT format_type(t, NULL) FROM unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t) AS arg_types,
           p.proargmodes::text[] AS arg_modes,
           p.pronargdefaults AS num_defaults,
           format_type(p.prorettype, NULL) AS return_type,
           p.proretset AS returns_set,
           NULL::jsonb AS table_columns
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))
    ORDER BY p.proname
  `)
).rows;

await db.close();

function tsType(pgType: string): string {
  const t = pgType.replace(/^_/, "").replace(/\[\]$/, "");
  const isArray = pgType.startsWith("_") || pgType.endsWith("[]");
  let base: string;
  switch (t) {
    case "int2":
    case "int4":
    case "int8":
    case "smallint":
    case "integer":
    case "bigint":
    case "float4":
    case "float8":
    case "real":
    case "double precision":
    case "numeric":
      base = "number";
      break;
    case "bool":
    case "boolean":
      base = "boolean";
      break;
    case "json":
    case "jsonb":
      base = "Json";
      break;
    case "void":
      base = "undefined";
      break;
    case "uuid":
    case "text":
    case "varchar":
    case "character varying":
    case "bpchar":
    case "char":
    case "date":
    case "time":
    case "time without time zone":
    case "timestamp":
    case "timestamptz":
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "inet":
    case "interval":
    case "tsvector":
    case "name":
      base = "string";
      break;
    default:
      base = "unknown";
  }
  return isArray ? `${base}[]` : base;
}

const indent = (n: number) => "  ".repeat(n);
const byTable = new Map<string, ColumnRow[]>();
for (const col of columns) {
  const list = byTable.get(col.table_name) ?? [];
  list.push(col);
  byTable.set(col.table_name, list);
}

const lines: string[] = [];
lines.push("/**");
lines.push(" * GENERATED FILE — do not edit by hand.");
lines.push(" * Source: supabase/migrations (applied to PGlite) via scripts/db/generate-types.mts");
lines.push(" * Regenerate with: npm run db:types");
lines.push(" */");
lines.push("");
lines.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
lines.push("");
lines.push("export type Database = {");
lines.push(`${indent(1)}__InternalSupabase: {`);
lines.push(`${indent(2)}PostgrestVersion: "12";`);
lines.push(`${indent(1)}};`);
lines.push(`${indent(1)}public: {`);
lines.push(`${indent(2)}Tables: {`);

for (const [table, cols] of byTable) {
  lines.push(`${indent(3)}${table}: {`);
  lines.push(`${indent(4)}Row: {`);
  for (const c of cols) {
    lines.push(`${indent(5)}${c.column_name}: ${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""};`);
  }
  lines.push(`${indent(4)}};`);
  for (const kind of ["Insert", "Update"] as const) {
    lines.push(`${indent(4)}${kind}: {`);
    for (const c of cols) {
      if (c.is_generated) {
        lines.push(`${indent(5)}${c.column_name}?: never;`);
        continue;
      }
      const optional = kind === "Update" || c.is_nullable === "YES" || c.has_default || c.is_identity;
      lines.push(`${indent(5)}${c.column_name}${optional ? "?" : ""}: ${tsType(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""};`);
    }
    lines.push(`${indent(4)}};`);
  }
  const rels = relationships.filter((r) => r.table_name === table);
  lines.push(`${indent(4)}Relationships: [`);
  for (const r of rels) {
    lines.push(`${indent(5)}{`);
    lines.push(`${indent(6)}foreignKeyName: ${JSON.stringify(r.constraint_name)};`);
    lines.push(`${indent(6)}columns: ${JSON.stringify(r.columns)};`);
    lines.push(`${indent(6)}isOneToOne: ${r.is_one_to_one};`);
    lines.push(`${indent(6)}referencedRelation: ${JSON.stringify(r.referenced_table)};`);
    lines.push(`${indent(6)}referencedColumns: ${JSON.stringify(r.referenced_columns)};`);
    lines.push(`${indent(5)}},`);
  }
  lines.push(`${indent(4)}];`);
  lines.push(`${indent(3)}};`);
}
lines.push(`${indent(2)}};`);
lines.push(`${indent(2)}Views: {`);
lines.push(`${indent(3)}[_ in never]: never;`);
lines.push(`${indent(2)}};`);
lines.push(`${indent(2)}Functions: {`);

const fnGroups = new Map<string, FnRow[]>();
for (const fn of functions) {
  const list = fnGroups.get(fn.name) ?? [];
  list.push(fn);
  fnGroups.set(fn.name, list);
}

function fnSignature(fn: FnRow): string {
  const names = fn.arg_names ?? [];
  const modes = fn.arg_modes ?? fn.arg_types.map(() => "i");
  const inputs: Array<{ name: string; type: string }> = [];
  const outputs: Array<{ name: string; type: string }> = [];
  fn.arg_types.forEach((type, i) => {
    const mode = modes[i] ?? "i";
    const entry = { name: names[i] ?? `arg${i}`, type };
    if (mode === "t" || mode === "o") outputs.push(entry);
    else inputs.push(entry);
  });
  const firstDefault = inputs.length - fn.num_defaults;
  const args = inputs.length === 0
    ? "Record<PropertyKey, never>"
    : `{ ${inputs.map((a, i) => `${a.name}${i >= firstDefault ? "?" : ""}: ${tsType(a.type)}`).join("; ")} }`;
  let returns: string;
  if (outputs.length > 0) {
    returns = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.type)} | null`).join("; ")} }[]`;
  } else {
    const base = tsType(fn.return_type);
    returns = fn.returns_set ? `${base}[]` : base === "Json" ? "Json" : base;
  }
  return `{ Args: ${args}; Returns: ${returns} }`;
}

for (const [name, fns] of fnGroups) {
  const signatures = fns.map(fnSignature);
  lines.push(`${indent(3)}${name}: ${signatures.length === 1 ? signatures[0] : signatures.join(" | ")};`);
}
lines.push(`${indent(2)}};`);
lines.push(`${indent(2)}Enums: {`);
lines.push(`${indent(3)}[_ in never]: never;`);
lines.push(`${indent(2)}};`);
lines.push(`${indent(2)}CompositeTypes: {`);
lines.push(`${indent(3)}[_ in never]: never;`);
lines.push(`${indent(2)}};`);
lines.push(`${indent(1)}};`);
lines.push("};");
lines.push("");
lines.push('type PublicSchema = Database["public"];');
lines.push('export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];');
lines.push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];');
lines.push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];');
lines.push('export type FunctionReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];');
lines.push("");

const output = lines.join("\n");
if (check) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8");
  } catch {
    // missing file is stale
  }
  if (current.replace(/\r\n/g, "\n") !== output) {
    console.error("src/lib/db/database.types.ts is out of date. Run: npm run db:types");
    process.exit(1);
  }
  console.log("Database types are up to date.");
} else {
  writeFileSync(OUTPUT, output);
  console.log(`Wrote ${OUTPUT} (${byTable.size} tables, ${fnGroups.size} functions).`);
}
