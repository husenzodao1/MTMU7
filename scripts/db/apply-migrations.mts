/**
 * Applies every migration to a fresh in-process PostgreSQL database and reports
 * the result. Used locally and in CI to prove the migration chain is buildable.
 *
 *   node scripts/db/apply-migrations.mts
 */
import { createDatabase, migrationFiles } from "../../tests/db/harness.mts";

const started = Date.now();
const files = migrationFiles();
const db = await createDatabase();
const { rows } = await db.query<{ tables: number; policies: number; functions: number }>(`
  SELECT
    (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS tables,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname IN ('public', 'storage')) AS policies,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public', 'app')) AS functions
`);
const stats = rows[0]!;
console.log(
  `Applied ${files.length} migrations in ${Date.now() - started} ms — ` +
    `${stats.tables} tables, ${stats.policies} policies, ${stats.functions} functions.`
);
await db.close();
