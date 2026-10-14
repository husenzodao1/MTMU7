import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, one, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

interface Face {
  id: string;
  name: string;
  avatar: string | null;
  nickname: string | null;
  detail: string | null;
}
interface Faces {
  active: Face[];
  graduates: Face[];
  counts: { active: number; graduates: number };
}

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const faces = (user: string) => asUser(db, user, async (tx) => (await one<{ f: Faces | null }>(tx, `SELECT public.school_faces() AS f`))!.f);

describe("the school's faces", () => {
  it("shows a pupil of the school to anyone in it, by first name and initial, with the class", async () => {
    const seen = (await faces(t.users.parentA))!;
    const pupil = seen.active.find((f) => f.id === a.students.studentA);
    assert.ok(pupil, "the pupil is there");
    assert.equal(pupil.name, "Student A.");
    assert.ok(!seen.active.some((f) => f.id === a.students.studentB), "never a pupil of another school");
    assert.equal(seen.counts.active, seen.active.length);
  });

  it("puts graduates in a ribbon of their own, with the year", async () => {
    await db.query(`UPDATE public.students SET status = 'graduated' WHERE id = $1`, [a.students.unlinkedA]);
    // The status change stamps today; this one left in 2025.
    await db.query(`UPDATE public.students SET status_changed_at = '2025-06-01' WHERE id = $1`, [a.students.unlinkedA]);
    const seen = (await faces(t.users.studentA))!;
    assert.deepEqual(seen.graduates.map((f) => [f.id, f.detail]), [[a.students.unlinkedA, "2025"]]);
    assert.ok(!seen.active.some((f) => f.id === a.students.unlinkedA));
  });

  it("leaves out an account the school has hidden", async () => {
    await db.query(`UPDATE public.users SET hidden_at = now(), status = 'blocked', is_active = false WHERE id = $1`, [t.users.student2A]);
    const seen = (await faces(t.users.teacherA))!;
    assert.ok(!seen.active.some((f) => f.id === a.students.student2A));
  });

  it("gives nothing to someone outside", async () => {
    const answer = await asAnon(db, (tx) => tx.query(`SELECT public.school_faces()`).then(() => "ran", (e: Error) => e.message));
    assert.match(answer, /permission denied/);
  });
});
