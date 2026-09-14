import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  await db.query(`INSERT INTO public.bell_periods (school_id, period_number, start_time, end_time) VALUES ($1, 1, '08:00', '08:45')`, [SCHOOL_A]);
  await db.query(
    `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number)
     VALUES ($1, $2, $3, $4, 1, 1), ($1, $2, $5, $6, 2, 1)`,
    [SCHOOL_A, a.yearA, a.class9A, a.mathA, a.class9B, a.math9B]
  );
});
after(async () => {
  await db.close();
});

describe("portal timetables", () => {
  it("shows a class timetable with teacher names to its students and their guardians", async () => {
    for (const userId of [t.users.studentA, t.users.parentA]) {
      const entries = await asUser(db, userId, (tx) =>
        rows<{ teacher_name: string; start_time: string }>(tx, `SELECT * FROM public.class_timetable($1)`, [a.class9A]));
      assert.equal(entries.length, 1);
      assert.match(entries[0]!.teacher_name, /A/);
      assert.equal(entries[0]!.start_time, "08:00:00");
    }
  });

  it("refuses other schools and unrelated guardians", async () => {
    assert.match((await errorOf(() => asUser(db, t.users.studentB, (tx) => tx.query(`SELECT * FROM public.class_timetable($1)`, [a.class9A])))) ?? "", /forbidden/);
    assert.match((await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT * FROM public.class_timetable($1)`, [a.class9B])))) ?? "", /forbidden/);
  });

  it("lists only the caller's own teaching slots", async () => {
    const mine = await asUser(db, t.users.teacherA, (tx) => rows<{ class_name: string }>(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.deepEqual(mine.map((m) => m.class_name), ["9A"]);
    const other = await asUser(db, t.users.teacher2A, (tx) => rows<{ class_name: string }>(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.deepEqual(other.map((m) => m.class_name), ["9B"]);
    const student = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.equal(student.length, 0);
  });
});

describe("announcement attachments", () => {
  it("are readable only by the announcement audience", async () => {
    const path = `${SCHOOL_A}/announcements/0f0f0f0f-0000-4000-8000-000000000001.pdf`;
    await asUser(db, t.users.adminA, async (tx) => {
      await tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', $1)`, [path]);
      await tx.query(
        `INSERT INTO public.announcements (school_id, title, body, status, audience_type, attachment_path, attachment_name)
         VALUES ($1, 'Staff only', 'x', 'published', 'staff', $2, 'plan.pdf')`, [SCHOOL_A, path]);
    });
    const see = (userId: string) => asUser(db, userId, (tx) => rows(tx, `SELECT id FROM storage.objects WHERE name = $1`, [path]));
    assert.equal((await see(t.users.teacherA)).length, 1);
    assert.equal((await see(t.users.studentA)).length, 0);
    assert.equal((await see(t.users.adminB)).length, 0);
    const upload = await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', $1)`, [`${SCHOOL_A}/announcements/x.pdf`])));
    assert.match(upload ?? "", /row-level security/);
  });
});
