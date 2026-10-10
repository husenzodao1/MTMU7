import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

const setNickname = (actor: string, target: string, nickname: string | null) =>
  asUser(db, actor, (tx) => tx.query(`UPDATE public.users SET nickname = $1 WHERE id = $2`, [nickname, target]));

describe("nicknames", () => {
  it("is the person's own to set", async () => {
    await setNickname(t.users.studentA, t.users.studentA, "dilshod.k");
    const row = await one<{ nickname: string }>(db, `SELECT nickname FROM public.users WHERE id = $1`, [t.users.studentA]);
    assert.equal(row!.nickname, "dilshod.k");
  });

  it("cannot be taken from someone else in the same school", async () => {
    // RLS lets a person update only their own row, so this changes nothing.
    await setNickname(t.users.student2A, t.users.studentA, "hijacked");
    const row = await one<{ nickname: string }>(db, `SELECT nickname FROM public.users WHERE id = $1`, [t.users.studentA]);
    assert.equal(row!.nickname, "dilshod.k");
  });

  it("is unique inside a school but free across schools", async () => {
    const clash = await errorOf(() => setNickname(t.users.student2A, t.users.student2A, "Dilshod.K"));
    assert.ok(clash, "a second person in the school must not take the same handle");

    // Another school is a different namespace.
    await setNickname(t.users.studentB, t.users.studentB, "dilshod.k");
    const row = await one<{ nickname: string }>(db, `SELECT nickname FROM public.users WHERE id = $1`, [t.users.studentB]);
    assert.equal(row!.nickname, "dilshod.k");
  });

  it("refuses handles that are not usable", async () => {
    for (const bad of ["ab", "has space", "why-a-dash", "!!!", "x".repeat(31)]) {
      const error = await errorOf(() => setNickname(t.users.teacherA, t.users.teacherA, bad));
      assert.ok(error, `"${bad}" should have been refused`);
    }
  });
});

describe("finding people", () => {
  it("matches a handle with or without its @", async () => {
    const byHandle = await asUser(db, t.users.teacherA, (tx) =>
      rows<{ id: string; nickname: string | null }>(tx, `SELECT id, nickname FROM public.search_message_contacts($1)`, ["dilshod"])
    );
    assert.ok(byHandle.some((r) => r.id === t.users.studentA), "the handle should find the person");

    const withAt = await asUser(db, t.users.teacherA, (tx) =>
      rows<{ id: string }>(tx, `SELECT id FROM public.search_message_contacts($1)`, ["@dilshod"])
    );
    assert.ok(withAt.some((r) => r.id === t.users.studentA), "a leading @ should not change the result");
  });

  it("still finds people by name, and never reaches another school", async () => {
    const byName = await asUser(db, t.users.teacherA, (tx) =>
      rows<{ id: string }>(tx, `SELECT id FROM public.search_message_contacts($1)`, ["studentA"])
    );
    assert.ok(byName.length > 0, "a name search should keep working");

    const crossSchool = await asUser(db, t.users.teacherA, (tx) =>
      rows<{ id: string }>(tx, `SELECT id FROM public.search_message_contacts($1)`, ["dilshod"])
    );
    assert.ok(
      !crossSchool.some((r) => r.id === t.users.studentB),
      "a handle in another school must not appear in this school's search"
    );
  });
});
