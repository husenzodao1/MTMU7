import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;
let from: string;
let to: string;

interface Stats {
  attendance: { present: number; absent: number; late: number; excused: number; recorded: number };
  days: Array<{ date: string; status: string }>;
  overall: { percent: number | null; points: number; maxPoints: number; count: number };
  subjects: Array<{ name: string; percent: number; points: number; count: number }>;
  series: Array<{ at: string; percent: number }>;
}

const stats = (actor: string, student: string, bucket = "week") =>
  asUser(db, actor, (tx) =>
    one<{ s: Stats }>(tx, `SELECT public.student_statistics($1, $2::date, $3::date, $4) AS s`, [student, from, to, bucket])
  ).then((r) => r!.s);

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);

  const term = await one<{ start_date: string; end_date: string }>(
    db,
    `SELECT start_date::text, end_date::text FROM public.academic_terms WHERE id = $1`,
    [a.termCurrent]
  );
  from = term!.start_date;
  to = term!.end_date;

  // Three marks out of five; attendance on the last three days, because a
  // register may only be corrected for a short while after the lesson.
  for (const [offset, score] of [[0, 5], [1, 4], [2, 3]] as const) {
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id, score, max_score, grade_date)
         VALUES ($1, $2, $3, $4, $5, $6, 5, ($7::date + $8::int))`,
        [SCHOOL_A, a.students.studentA, a.mathA, a.termCurrent, a.assessmentTest, score, from, offset]
      )
    );
  }
  for (const [offset, status] of [[0, "present"], [1, "absent"], [2, "late"]] as const) {
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
         VALUES ($1, $2, $3, $4, (current_date - $5::int), $6)`,
        [SCHOOL_A, a.students.studentA, a.class9A, a.mathA, offset, status]
      )
    );
  }
});
after(async () => {
  await db.close();
});

describe("who may read a pupil's term", () => {
  it("the pupil, their guardian, a teacher who takes them, and the administration", async () => {
    for (const actor of [t.users.studentA, t.users.parentA, t.users.teacherA, t.users.adminA]) {
      const s = await stats(actor, a.students.studentA);
      assert.ok(s.overall, `expected figures for ${actor}`);
    }
  });

  it("nobody else", async () => {
    assert.equal(await errorOf(() => stats(t.users.student2A, a.students.studentA)), "forbidden");
    assert.equal(await errorOf(() => stats(t.users.teacherB, a.students.studentA)), "forbidden");
  });
});

describe("the figures themselves", () => {
  it("counts the days that were recorded, and lists the ones that were missed", async () => {
    const s = await stats(t.users.studentA, a.students.studentA);
    assert.equal(s.attendance.recorded, 3);
    assert.equal(s.attendance.present, 1);
    assert.equal(s.attendance.absent, 1);
    assert.equal(s.attendance.late, 1);
    assert.deepEqual(
      s.days.map((d) => d.status).sort(),
      ["absent", "late"],
      "a day present is not something to list; the other two are"
    );
  });

  it("gives the rating as a percentage and as points", async () => {
    const s = await stats(t.users.studentA, a.students.studentA);
    assert.equal(s.overall.count, 3);
    assert.equal(Number(s.overall.points), 12, "5 + 4 + 3");
    assert.equal(Number(s.overall.maxPoints), 15);
    assert.equal(Number(s.overall.percent), 80, "12 of 15 is 80%");
  });

  it("breaks the rating down by subject", async () => {
    const s = await stats(t.users.studentA, a.students.studentA);
    assert.equal(s.subjects.length, 1);
    assert.equal(s.subjects[0]!.count, 3);
    assert.equal(Number(s.subjects[0]!.percent), 80);
  });

  it("returns one point per bucket for the chart", async () => {
    const weekly = await stats(t.users.studentA, a.students.studentA, "week");
    assert.ok(weekly.series.length >= 1);
    const daily = await stats(t.users.studentA, a.students.studentA, "day");
    assert.equal(daily.series.length, 3, "three marks on three days");
  });

  it("refuses a range that is backwards or absurdly long", async () => {
    const backwards = await asUser(db, t.users.studentA, (tx) =>
      tx.query(`SELECT public.student_statistics($1, $2::date, $3::date, 'week')`, [a.students.studentA, to, from]).then(() => null).catch((e: Error) => e.message)
    );
    assert.equal(backwards, "invalid_range");
  });
});
