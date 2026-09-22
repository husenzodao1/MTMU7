import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, SCHOOL_B, type Tenants } from "./fixtures.mts";
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

const write = (actor: string, classSubject: string, date: string, topic: string, school = SCHOOL_A) =>
  asUser(db, actor, (tx) =>
    one<{ id: string }>(
      tx,
      `INSERT INTO public.lesson_topics (school_id, class_subject_id, lesson_date, topic, homework)
       VALUES ($1, $2, $3, $4, 'Masala 5') RETURNING id`,
      [school, classSubject, date, topic]
    )
  );

const read = (actor: string, classSubject: string) =>
  asUser(db, actor, (tx) =>
    rows<{ topic: string }>(tx, `SELECT topic FROM public.lesson_topics WHERE class_subject_id = $1 ORDER BY lesson_date`, [classSubject])
  );

describe("writing what was taught", () => {
  it("is the work of whoever teaches that subject in that class", async () => {
    const created = await write(t.users.teacherA, a.mathA, "2026-09-01", "  Kasrho  ");
    assert.ok(created?.id);
    const stored = await one<{ topic: string; homework: string; school_id: string; created_by: string }>(
      db,
      `SELECT topic, homework, school_id, created_by FROM public.lesson_topics WHERE id = $1`,
      [created!.id]
    );
    assert.equal(stored!.topic, "Kasrho", "surrounding space is trimmed");
    assert.equal(stored!.homework, "Masala 5");
    assert.equal(stored!.created_by, t.users.teacherA);
  });

  it("is refused to a teacher who does not take that class", async () => {
    const error = await errorOf(() => write(t.users.teacher2A, a.mathA, "2026-09-02", "Begona"));
    assert.ok(error, "another teacher must not fill in a lesson they did not give");
  });

  it("is refused to a student", async () => {
    const error = await errorOf(() => write(t.users.studentA, a.mathA, "2026-09-03", "Xonanda"));
    assert.ok(error);
  });

  it("takes the school from the subject, not from the caller", async () => {
    // The caller claims another school; the row must still belong to this one.
    const created = await write(t.users.teacherA, a.mathA, "2026-09-04", "Maktabi digar?", SCHOOL_B);
    const stored = await one<{ school_id: string }>(db, `SELECT school_id FROM public.lesson_topics WHERE id = $1`, [created!.id]);
    assert.equal(stored!.school_id, SCHOOL_A);
  });

  it("keeps one line per lesson", async () => {
    const again = await errorOf(() => write(t.users.teacherA, a.mathA, "2026-09-01", "Takror"));
    assert.ok(again, "the same subject, date and period is one line, not two");
  });

  it("refuses an empty topic", async () => {
    assert.ok(await errorOf(() => write(t.users.teacherA, a.mathA, "2026-09-05", "   ")));
  });
});

describe("reading what was taught", () => {
  it("is open to the class, its teacher and the school's administration", async () => {
    assert.ok((await read(t.users.teacherA, a.mathA)).length > 0, "the teacher sees their own lessons");
    assert.ok((await read(t.users.studentA, a.mathA)).length > 0, "a pupil of the class sees them");
    assert.ok((await read(t.users.adminA, a.mathA)).length > 0, "the administration sees them");
  });

  it("is closed to another school", async () => {
    assert.equal((await read(t.users.teacherB, a.mathA)).length, 0);
    assert.equal((await read(t.users.studentB, a.mathA)).length, 0);
  });
});
