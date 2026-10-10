import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

interface Teacher {
  teacher_name: string;
  subjects_tg: string;
  phone: string | null;
}

const teachers = (user: string, classId: string) =>
  asUser(db, user, (tx) => rows<Teacher>(tx, `SELECT * FROM public.class_teachers($1)`, [classId]));

describe("the class's teachers under its timetable", () => {
  it("lists a pupil's own teachers, with their subjects and telephone, in name order", async () => {
    const list = await teachers(t.users.studentA, a.class9A);
    assert.deepEqual(list.map((row) => [row.teacher_name, row.subjects_tg]), [["A Teacher", "Math"], ["Two Teacher", "Physics"]]);
    assert.ok(list.every((row) => typeof row.phone === "string" && row.phone.startsWith("+")), "the number on the account when the staff record has none");
  });

  it("is there for a parent of a pupil in the class", async () => {
    assert.equal((await teachers(t.users.parentA, a.class9A)).length, 2);
  });

  it("is not for another class's pupil, nor for anyone signed out", async () => {
    assert.equal(await errorOf(() => teachers(t.users.student2A, a.class9A)), "forbidden");
    const anon = await asAnon(db, (tx) => tx.query(`SELECT * FROM public.class_teachers($1)`, [a.class9A]).then(() => "ran", (e: Error) => e.message));
    assert.match(anon, /permission denied/);
  });

  it("accepts two shifts and no third", async () => {
    assert.match((await errorOf(() => db.query(`UPDATE public.classes SET shift = 3 WHERE id = $1`, [a.class9A]))) ?? "", /classes_shift_check/);
    await db.query(`UPDATE public.classes SET shift = 2 WHERE id = $1`, [a.class9A]);
  });
});
