import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

interface Mark {
  student_id: string;
  kind: string;
  mark: string;
  approved: boolean;
  marks_count: number;
}

const marks = (user: string) =>
  asUser(db, user, (tx) =>
    rows<Mark>(tx, `SELECT student_id, kind, mark::text, approved, marks_count FROM public.report_card_marks($1) ORDER BY kind`, [a.class9A])
  );

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  const type = async (code: string) =>
    (await one<{ id: string }>(db, `SELECT id FROM public.assessment_types WHERE school_id = $1 AND code = $2`, [SCHOOL_A, code]))!.id;
  const grade = async (code: string, score: number) =>
    db.query(
      `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id, score, max_score, grade_date)
       VALUES ($1, $2, $3, $4, $5, $6, 5, current_date - 5)`,
      [SCHOOL_A, a.students.studentA, a.mathA, a.termCurrent, await type(code), score]
    );
  await grade("classwork", 5);
  await grade("test", 4);
  await grade("term_final", 4);
  const absent = (days: number, status: string) =>
    db.query(
      `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
       VALUES ($1, $2, $3, $4, current_date - $5::int, $6)`,
      [SCHOOL_A, a.students.studentA, a.class9A, a.mathA, days, status]
    );
  await absent(3, "absent");
  await absent(4, "absent");
  await absent(6, "late");
});
after(async () => {
  await db.close();
});

describe("a class's report cards", () => {
  it("gives the term mark and the weighted average of the everyday marks", async () => {
    const mine = await marks(t.users.studentA);
    assert.deepEqual(
      mine.map((m) => [m.kind, m.mark, m.marks_count]),
      [
        ["average", "4.3", 2],
        ["term_final", "4.0", 1],
      ]
    );
  });

  it("counts the lessons missed and the times late in the term", async () => {
    const seen = await asUser(db, t.users.studentA, (tx) =>
      rows<{ academic_term_id: string; absent: number; late: number }>(tx, `SELECT academic_term_id, absent, late FROM public.report_card_attendance($1)`, [a.class9A])
    );
    assert.deepEqual(seen, [{ academic_term_id: a.termCurrent, absent: 2, late: 1 }]);
  });

  it("shows a parent their child's marks, and another class's pupil nothing", async () => {
    assert.equal((await marks(t.users.parentA)).length, 2);
    assert.equal((await marks(t.users.student2A)).length, 0);
  });
});
