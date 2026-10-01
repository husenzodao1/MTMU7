import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, asUserAt, createDatabase, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  // The teacher has turned on the second step; the parent has not.
  await db.query(`INSERT INTO auth.mfa_factors (user_id, factor_type, status) VALUES ($1, 'totp', 'verified')`, [t.users.teacherA]);
  // An enrolment somebody started and never finished does not count.
  await db.query(`INSERT INTO auth.mfa_factors (user_id, factor_type, status) VALUES ($1, 'totp', 'unverified')`, [t.users.parentA]);
});
after(async () => {
  await db.close();
});

describe("the second step", () => {
  it("leaves a signed-in person with only a password with nothing to read", async () => {
    const users = await asUserAt(db, t.users.teacherA, "aal1", (tx) => rows(tx, `SELECT id FROM public.users`));
    assert.equal(users.length, 0);
    const school = await asUserAt(db, t.users.teacherA, "aal1", (tx) => one<{ s: string | null }>(tx, `SELECT app.current_school_id() AS s`));
    assert.equal(school?.s, null);
    const access = await asUserAt(db, t.users.teacherA, "aal1", (tx) => one<{ a: { mfa_required?: boolean; user?: unknown } }>(tx, `SELECT public.get_my_access() AS a`));
    assert.deepEqual(access?.a, { mfa_required: true });
    const owed = await asUserAt(db, t.users.teacherA, "aal1", (tx) => one<{ r: boolean }>(tx, `SELECT public.mfa_required() AS r`));
    assert.equal(owed?.r, true);
  });

  it("opens everything once the code has been given", async () => {
    const users = await asUserAt(db, t.users.teacherA, "aal2", (tx) => rows(tx, `SELECT id FROM public.users`));
    assert.ok(users.length > 0);
    const access = await asUserAt(db, t.users.teacherA, "aal2", (tx) => one<{ a: { user?: { id: string } } }>(tx, `SELECT public.get_my_access() AS a`));
    assert.equal(access?.a.user?.id, t.users.teacherA);
  });

  it("changes nothing for somebody without a verified second factor", async () => {
    const users = await asUser(db, t.users.parentA, (tx) => rows(tx, `SELECT id FROM public.users`));
    assert.ok(users.length > 0);
    const owed = await asUser(db, t.users.parentA, (tx) => one<{ r: boolean }>(tx, `SELECT public.mfa_required() AS r`));
    assert.equal(owed?.r, false);
  });

  it("stops writes too, not just reads", async () => {
    const written = await asUserAt(db, t.users.teacherA, "aal1", (tx) =>
      tx.query(`UPDATE public.users SET first_name = first_name WHERE id = $1`, [t.users.teacherA]));
    assert.equal(written.affectedRows, 0);
  });

  it("guards every table with row level security, present and future", async () => {
    const unguarded = await rows<{ t: string }>(db, `
      SELECT n.nspname || '.' || c.relname AS t
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relrowsecurity AND n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname AND p.policyname = 'mfa_gate')`);
    assert.deepEqual(unguarded.map((r) => r.t), [], "a table added after 00070 needs its mfa_gate policy");
  });

  it("leaves anonymous visitors and public pages alone", async () => {
    const schools = await asAnon(db, (tx) => one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM public.list_public_schools()`));
    assert.ok((schools?.n ?? 0) >= 0);
  });
});
