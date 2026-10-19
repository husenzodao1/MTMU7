import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const phoneOf = async (userId: string) =>
  (await one<{ phone: string }>(db, `SELECT phone FROM public.users WHERE id = $1`, [userId]))!.phone;

const seen = (actor: string, target: string) =>
  asUser(db, actor, (tx) => one<{ phone: string | null }>(tx, `SELECT public.contact_phone($1) AS phone`, [target])).then((r) => r!.phone);

const found = (actor: string, query: string) =>
  asUser(db, actor, (tx) => rows<{ id: string; phone: string | null }>(tx, `SELECT id, phone FROM public.search_people($1)`, [query]));

describe("WhatsApp numbers (00099)", () => {
  it("gives the staff a pupil's number, by profile and by search", async () => {
    assert.equal(await seen(t.users.teacherA, t.users.studentA), await phoneOf(t.users.studentA));
    const hits = await found(t.users.teacherA, "studentA");
    assert.equal(hits.find((h) => h.id === t.users.studentA)?.phone, await phoneOf(t.users.studentA));
  });

  it("gives a parent their own child's number and nobody else's child's", async () => {
    assert.equal(await seen(t.users.parentA, t.users.studentA), await phoneOf(t.users.studentA));
    assert.equal(await seen(t.users.parentA, t.users.student2A), null);
    const hits = await found(t.users.parentA, "student2A");
    const other = hits.find((h) => h.id === t.users.student2A);
    assert.ok(other, "the pupil is still found by name");
    assert.equal(other.phone, null, "but without their number");
  });

  it("never gives one pupil another pupil's number, but gives them their teacher's", async () => {
    assert.equal(await seen(t.users.student2A, t.users.studentA), null);
    assert.equal(await seen(t.users.student2A, t.users.teacherA), await phoneOf(t.users.teacherA));
  });

  it("stays inside the school, and gives nothing for accounts that are not active", async () => {
    assert.equal(await seen(t.users.teacherA, t.users.studentB), null);
    assert.equal(await seen(t.users.teacherA, t.users.pendingA), null);
    const hits = await found(t.users.teacherA, "studentB");
    assert.ok(!hits.some((h) => h.id === t.users.studentB));
  });

  it("finds a person by the portal number on their card", async () => {
    const card = (await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE id = $1`, [t.users.teacher2A]))!;
    const hits = await found(t.users.parentA, card.public_id.toLowerCase());
    assert.deepEqual(hits.map((h) => h.id), [t.users.teacher2A]);
  });

  it("falls back to the number an import wrote on the parent's record", async () => {
    await db.query(`UPDATE public.users SET phone = NULL WHERE id = $1`, [t.users.parentA]);
    await db.query(`UPDATE public.guardians SET phone = '+992 93 555 0101' WHERE user_id = $1`, [t.users.parentA]);
    assert.equal(await seen(t.users.teacherA, t.users.parentA), "+992 93 555 0101");
  });

  it("is not open to somebody signed out", async () => {
    const error = await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT public.contact_phone($1)`, [t.users.teacherA])));
    assert.match(error ?? "", /permission denied/);
  });
});
