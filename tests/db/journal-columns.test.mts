import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, SCHOOL_B, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;
let termStart: string;
let termEnd: string;
let termSpare: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  const term = await one<{ start_date: string; end_date: string; spare: string }>(
    db,
    `SELECT start_date::text, end_date::text, (start_date + 3)::text AS spare
     FROM public.academic_terms WHERE id = $1`,
    [a.termCurrent]
  );
  termStart = term!.start_date;
  termEnd = term!.end_date;
  termSpare = term!.spare;
});
after(async () => {
  await db.close();
});

const openColumn = (
  actor: string,
  opts: { date?: string; label?: string | null; term?: string; school?: string; classSubject?: string } = {}
) =>
  asUser(db, actor, (tx) =>
    one<{ id: string }>(
      tx,
      `INSERT INTO public.journal_columns (school_id, class_subject_id, academic_term_id, column_date, assessment_type_id, label)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        opts.school ?? SCHOOL_A,
        opts.classSubject ?? a.mathA,
        opts.term ?? a.termCurrent,
        opts.date ?? termStart,
        a.assessmentTest,
        opts.label ?? null,
      ]
    )
  );

describe("ruling the columns before they are filled", () => {
  it("is the work of whoever teaches that subject in that class", async () => {
    const created = await openColumn(t.users.teacherA, { label: "  Чоряки I  " });
    assert.ok(created?.id);
    const stored = await one<{ label: string; school_id: string; created_by: string }>(
      db,
      `SELECT label, school_id, created_by FROM public.journal_columns WHERE id = $1`,
      [created!.id]
    );
    assert.equal(stored!.label, "Чоряки I", "a heading is kept, trimmed");
    assert.equal(stored!.created_by, t.users.teacherA);
  });

  it("is refused to a teacher who does not take that class, and to a pupil", async () => {
    assert.ok(await errorOf(() => openColumn(t.users.teacher2A, { date: termEnd })));
    assert.ok(await errorOf(() => openColumn(t.users.studentA, { date: termEnd })));
  });

  it("takes the school from the subject, not from the caller", async () => {
    const created = await openColumn(t.users.teacherA, { date: termEnd, school: SCHOOL_B });
    const stored = await one<{ school_id: string }>(db, `SELECT school_id FROM public.journal_columns WHERE id = $1`, [created!.id]);
    assert.equal(stored!.school_id, SCHOOL_A);
  });

  it("refuses a date that falls outside the term it is filed under", async () => {
    const error = await errorOf(() => openColumn(t.users.teacherA, { date: "1999-01-04" }));
    assert.equal(error, "date_outside_term");
  });

  it("keeps one column per date and kind of work", async () => {
    assert.ok(await errorOf(() => openColumn(t.users.teacherA, { date: termStart })));
  });
});

describe("removing a column", () => {
  it("is allowed while it is empty", async () => {
    const created = await openColumn(t.users.teacherA, { date: termSpare, label: "Holi" });
    const id = created!.id;
    await asUser(db, t.users.teacherA, (tx) => tx.query(`DELETE FROM public.journal_columns WHERE id = $1`, [id]));
    const gone = await one(db, `SELECT id FROM public.journal_columns WHERE id = $1`, [id]);
    assert.equal(gone, undefined);
  });

  it("is refused once marks stand in it, so nothing disappears silently", async () => {
    const column = await one<{ id: string; column_date: string }>(
      db,
      `SELECT id, column_date::text FROM public.journal_columns WHERE class_subject_id = $1 LIMIT 1`,
      [a.mathA]
    );
    assert.ok(column, "a column should still exist from the tests above");

    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id, score, max_score, grade_date)
         VALUES ($1, $2, $3, $4, $5, 4, 5, $6)`,
        [SCHOOL_A, a.students.studentA, a.mathA, a.termCurrent, a.assessmentTest, column!.column_date]
      )
    );

    await asUser(db, t.users.teacherA, (tx) => tx.query(`DELETE FROM public.journal_columns WHERE id = $1`, [column!.id]));
    const still = await one(db, `SELECT id FROM public.journal_columns WHERE id = $1`, [column!.id]);
    assert.ok(still, "the column must survive, because its marks would go with it");
  });
});

describe("who sees the ruled columns", () => {
  it("the class and its administration do; another school does not", async () => {
    const mine = await asUser(db, t.users.studentA, (tx) =>
      rows(tx, `SELECT id FROM public.journal_columns WHERE class_subject_id = $1`, [a.mathA])
    );
    assert.ok(mine.length > 0, "a pupil of the class sees the journal's columns");

    const theirs = await asUser(db, t.users.teacherB, (tx) =>
      rows(tx, `SELECT id FROM public.journal_columns WHERE class_subject_id = $1`, [a.mathA])
    );
    assert.equal(theirs.length, 0);
  });
});
