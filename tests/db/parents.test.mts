import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

/**
 * Parents are written in the pupils' workbook and nowhere else (00088). The
 * pupil neither writes nor reads them; the office, the director, the class
 * teacher and the pupil's teachers read them; a teacher can write to them
 * through the bot.
 */
let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  await db.query(`UPDATE public.guardians SET phone = '+992 93 111 22 33', workplace = 'Hospital 2', email = 'parent.a@example.test' WHERE id = $1`, [a.guardianA]);
});
after(async () => {
  await db.close();
});

const parentsOf = (actor: string, student: string) =>
  asUser(db, actor, (tx) => rows<{ guardian_id: string; relationship: string; workplace: string; phone: string; email: string }>(tx,
    `SELECT * FROM public.student_parents($1)`, [student]));

describe("a pupil's parents", () => {
  it("are not written or read by the pupil", async () => {
    assert.equal(await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`SELECT public.save_my_guardian('mother', 'Karimova', 'Malika', NULL, 1985, '+992 93 000 00 01', 'School 7')`))), "forbidden");
    assert.equal(await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`SELECT public.remove_my_guardian($1)`, [a.guardianA]))), "forbidden");
    assert.match(await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT * FROM public.my_guardians()`))) ?? "", /permission denied/);
    assert.equal(await errorOf(() => parentsOf(t.users.studentA, a.students.studentA)), "forbidden");
  });

  it("are shown to the office, the director, the class teacher and the pupil's teachers", async () => {
    for (const actor of [t.users.adminA, t.users.directorA, t.users.teacherA, t.users.teacher2A]) {
      const list = await parentsOf(actor, a.students.studentA);
      assert.equal(list.length, 1);
      assert.deepEqual([list[0]!.relationship, list[0]!.workplace, list[0]!.phone, list[0]!.email],
        ["mother", "Hospital 2", "+992 93 111 22 33", "parent.a@example.test"]);
    }
  });

  it("are not shown to another pupil or to another school's teacher", async () => {
    assert.equal(await errorOf(() => parentsOf(t.users.student2A, a.students.studentA)), "forbidden");
    assert.equal(await errorOf(() => parentsOf(t.users.teacherB, a.students.studentA)), "forbidden");
  });

  it("hear a teacher's note in every chat that follows the pupil", async () => {
    await db.query(`INSERT INTO public.telegram_chats (chat_id, school_id) VALUES (5551, $1), (5552, $1)`, [t.schoolA]);
    await db.query(`INSERT INTO public.telegram_children (chat_id, student_id, school_id) VALUES (5551, $1, $2), (5552, $1, $2)`,
      [a.students.studentA, t.schoolA]);
    const sent = await asUser(db, t.users.teacher2A, async (tx) =>
      (await one<{ n: number }>(tx, `SELECT public.send_parent_note($1, $2) AS n`, [a.students.studentA, "Please sign the diary."]))!.n);
    assert.equal(sent, 2);
    const queued = await one<{ n: number; text: string }>(db,
      `SELECT count(*)::int AS n, max(payload ->> 'text') AS text FROM public.telegram_outbox WHERE kind = 'note' AND student_id = $1`,
      [a.students.studentA]);
    assert.deepEqual(queued, { n: 2, text: "Please sign the diary." });
    assert.equal(await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`SELECT public.send_parent_note($1, 'hi there')`, [a.students.studentA]))), "forbidden");
  });
});
