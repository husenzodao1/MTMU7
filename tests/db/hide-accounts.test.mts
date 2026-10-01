import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

interface Directory {
  total: number;
  counts: Record<string, number>;
  rows: Array<{ id: string; hidden: boolean }>;
}

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const directory = (category: string) =>
  asUser(db, t.users.adminA, async (tx) => (await one<{ d: Directory }>(tx, `SELECT public.account_directory($1) AS d`, [category]))!.d);
const hide = (actor: string, user: string, hidden: boolean) =>
  asUser(db, actor, (tx) => tx.query(`SELECT public.set_account_hidden($1, $2, 'test')`, [user, hidden]));

describe("hiding an account", () => {
  it("takes it out of every list and onto its own tab, blocked", async () => {
    const before = await directory("all");
    await hide(t.users.adminA, t.users.studentA, true);
    const all = await directory("all");
    assert.equal(all.total, before.total - 1);
    assert.ok(!all.rows.some((r) => r.id === t.users.studentA));
    assert.equal(all.counts.hidden, 1);
    const hidden = await directory("hidden");
    assert.deepEqual(hidden.rows.map((r) => [r.id, r.hidden]), [[t.users.studentA, true]]);
    const user = await one<{ status: string; is_active: boolean }>(db, `SELECT status, is_active FROM public.users WHERE id = $1`, [t.users.studentA]);
    assert.deepEqual(user, { status: "blocked", is_active: false }, "a hidden account cannot sign in");
  });

  it("brings it back as it was", async () => {
    await hide(t.users.adminA, t.users.studentA, false);
    assert.equal((await directory("hidden")).total, 0);
    assert.ok((await directory("all")).rows.some((r) => r.id === t.users.studentA));
    const user = await one<{ status: string; is_active: boolean }>(db, `SELECT status, is_active FROM public.users WHERE id = $1`, [t.users.studentA]);
    assert.deepEqual(user, { status: "active", is_active: true });
  });

  it("is for those who may block accounts, and never their own", async () => {
    assert.equal(await errorOf(() => hide(t.users.teacherA, t.users.studentA, true)), "forbidden");
    assert.match((await errorOf(() => hide(t.users.adminA, t.users.adminA, true))) ?? "", /your own account/);
  });
});
