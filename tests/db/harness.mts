import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const ROOT = join(import.meta.dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const COMPAT_SQL = join(import.meta.dirname, "supabase-compat.sql");
const CACHE_DIR = join(tmpdir(), "school-platform-pglite-cache");
const EXTENSIONS = { pgcrypto, btree_gist, pg_trgm };

export type Db = PGlite;
export type Tx = Transaction;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function selectedMigrations(upTo?: string): string[] {
  return migrationFiles().filter((file) => !upTo || file <= upTo);
}

function fingerprint(files: string[]): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(COMPAT_SQL));
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(MIGRATIONS_DIR, file)));
  }
  return hash.digest("hex").slice(0, 32);
}

async function build(files: string[]): Promise<Db> {
  const db = await PGlite.create({ extensions: EXTENSIONS });
  await db.exec(readFileSync(COMPAT_SQL, "utf8"));
  await db.exec("SET search_path TO public, extensions;");
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`);
    }
  }
  return db;
}

/**
 * Creates an in-process PostgreSQL database with the Supabase compatibility
 * layer and every migration applied in order. A data-directory snapshot keyed
 * by the migration contents is cached in the OS temp directory so that test
 * files after the first start in milliseconds instead of seconds.
 */
export async function createDatabase(options: { upTo?: string; cache?: boolean } = {}): Promise<Db> {
  const files = selectedMigrations(options.upTo);
  if (options.cache === false) return build(files);

  const snapshot = join(CACHE_DIR, `${fingerprint(files)}.tar.gz`);
  if (existsSync(snapshot)) {
    const db = await PGlite.create({
      extensions: EXTENSIONS,
      loadDataDir: new Blob([readFileSync(snapshot)]),
    });
    await db.exec("SET search_path TO public, extensions;");
    return db;
  }

  const db = await build(files);
  const dump = await db.dumpDataDir("gzip");
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(snapshot, Buffer.from(await dump.arrayBuffer()));
  return db;
}

interface Claims {
  sub?: string;
  role: "anon" | "authenticated" | "service_role";
}

async function withClaims<T>(db: Db, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`SET LOCAL ROLE ${claims.role}`);
    return fn(tx);
  });
}

/** Runs `fn` as an authenticated Supabase user (RLS enforced). */
export function asUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withClaims(db, { sub: userId, role: "authenticated" }, fn);
}

/** Runs `fn` as the anonymous role (RLS enforced). */
export function asAnon<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withClaims(db, { role: "anon" }, fn);
}

/** Runs `fn` as service_role (bypasses RLS, like the Supabase service key). */
export function asService<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withClaims(db, { role: "service_role" }, fn);
}

/** Returns the error message thrown by `fn`, or null when it succeeds. */
export async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Convenience: first row of a query or undefined. */
export async function one<T>(tx: Tx | Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await tx.query<T>(sql, params);
  return result.rows[0];
}

/** Convenience: all rows of a query. */
export async function rows<T>(tx: Tx | Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await tx.query<T>(sql, params);
  return result.rows;
}
