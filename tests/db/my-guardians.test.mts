import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let malika: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

interface Saved {
  status: "saved" | "match";
  guardianId: string;
  children?: Array<{ name: string; className: string | null }>;
}

const save = (user: string, args: { relationship?: string; last?: string; first?: string; year?: number | null; phone: string; work?: string; id?: string | null; siblingOf?: string | null }) =>
  asUser(db, user, async (tx) =>
    (await one<{ r: Saved }>(
      tx,
      `SELECT public.save_my_guardian($1, $2, $3, NULL, $4, $5, $6, $7, $8) AS r`,
      [args.relationship ?? "mother", args.last ?? "Karimova", args.first ?? "Malika", args.year ?? 1985, args.phone, args.work ?? "School 7", args.id ?? null, args.siblingOf ?? null]
    ))!.r
  );
const mine = (user: string) => asUser(db, user, (tx) => rows<{ guardian_id: string; relationship: string; birth_year: number; workplace: string; shared_with: number }>(tx, `SELECT * FROM public.my_guardians()`));

describe("a pupil's own parents", () => {
  it("saves a parent with the year of birth, telephone and workplace", async () => {
    const saved = await save(t.users.studentA, { phone: "+992 93 111 22 33" });
    assert.equal(saved.status, "saved");
    malika = saved.guardianId;
    const list = await mine(t.users.studentA);
    const added = list.find((row) => row.guardian_id === saved.guardianId)!;
    assert.deepEqual([added.relationship, added.birth_year, added.workplace], ["mother", 1985, "School 7"]);
  });

  it("asks whether a pupil whose parent's number is already known is a brother or sister, and saves nothing first", async () => {
    const first = (await mine(t.users.studentA)).find((row) => row.guardian_id === malika)!;
    const asked = await save(t.users.student2A, { phone: "93 111 22 33" });
    assert.equal(asked.status, "match");
    assert.equal(asked.guardianId, first.guardian_id);
    assert.deepEqual(asked.children, [{ name: "Student A.", className: "9A" }]);
    assert.equal((await mine(t.users.student2A)).length, 0);

    const confirmed = await save(t.users.student2A, { phone: "93 111 22 33", siblingOf: asked.guardianId });
    assert.deepEqual([confirmed.status, confirmed.guardianId], ["saved", first.guardian_id]);
    assert.equal((await mine(t.users.studentA)).find((row) => row.guardian_id === first.guardian_id)!.shared_with, 1);
  });

  it("refuses what is not a parent's details, and is for pupils only", async () => {
    assert.equal(await errorOf(() => save(t.users.studentA, { phone: "123" })), "invalid_phone");
    assert.equal(await errorOf(() => save(t.users.studentA, { phone: "+992 90 000 00 01", year: 1800 })), "invalid_birth_year");
    assert.equal(await errorOf(() => save(t.users.studentA, { phone: "+992 90 000 00 01", relationship: "uncle" })), "invalid_relationship");
    assert.equal(await errorOf(() => save(t.users.teacherA, { phone: "+992 90 000 00 02" })), "forbidden");
  });

  it("takes a parent off only the pupil who asks", async () => {
    const shared = (await mine(t.users.student2A)).find((row) => row.guardian_id === malika)!;
    await asUser(db, t.users.student2A, (tx) => tx.query(`SELECT public.remove_my_guardian($1)`, [shared.guardian_id]));
    assert.equal((await mine(t.users.student2A)).filter((row) => row.guardian_id === shared.guardian_id).length, 0);
    assert.equal((await mine(t.users.studentA)).filter((row) => row.guardian_id === shared.guardian_id).length, 1);
  });
});
