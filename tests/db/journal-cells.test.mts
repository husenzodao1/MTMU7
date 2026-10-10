import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;
let day: string;

interface Outcome {
  saved: number;
  cleared: number;
  errors: Array<{ student: string; date: string; code: string }>;
}

type Cell = { student: string; date: string; type: string; value: string };

const save = (actor: string, cells: Cell[]) =>
  asUser(db, actor, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.save_journal_cells($1, $2, $3::jsonb) AS r`, [
      a.mathA,
      a.termCurrent,
      JSON.stringify(cells),
    ])
  ).then((r) => r!.r);

const cell = (value: string, student = a.students.studentA, date = day): Cell => ({
  student,
  date,
  type: a.assessmentTest,
  value,
});

const markOf = (student = a.students.studentA) =>
  one<{ score: string | null }>(
    db,
    `SELECT score::text AS score FROM public.grades WHERE student_id = $1 AND class_subject_id = $2 AND grade_date = $3`,
    [student, a.mathA, day]
  );

const absenceOf = (student = a.students.studentA) =>
  one<{ status: string | null }>(
    db,
    `SELECT status FROM public.attendance_records WHERE student_id = $1 AND class_subject_id = $2 AND attendance_date = $3`,
    [student, a.mathA, day]
  );

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  // A register may only be corrected for a short while after the lesson, so the
  // page under test is yesterday's.
  const today = await one<{ d: string }>(db, `SELECT (current_date - 1)::text AS d`);
  day = today!.d;
});
after(async () => {
  await db.close();
});

describe("one square, one pen", () => {
  it("reads a number as a mark", async () => {
    const outcome = await save(t.users.teacherA, [cell("5")]);
    assert.deepEqual(outcome.errors, []);
    assert.equal(outcome.saved, 1);
    assert.equal(Number((await markOf())!.score), 5);
  });

  it("reads a letter as an absence, in any of the school's alphabets", async () => {
    for (const [letter, status] of [["ғ", "absent"], ["н", "absent"], ["д", "late"], ["о", "late"], ["у", "excused"]] as const) {
      await save(t.users.teacherA, [cell(letter)]);
      assert.equal((await absenceOf())!.status, status, letter);
    }
  });

  it("replaces a mark with a letter and leaves nothing behind", async () => {
    await save(t.users.teacherA, [cell("4")]);
    await save(t.users.teacherA, [cell("ғ")]);
    assert.equal(await markOf(), undefined, "the mark that was there must not survive the letter");
    assert.equal((await absenceOf())!.status, "absent");
  });

  it("empties a square that is emptied", async () => {
    await save(t.users.teacherA, [cell("3")]);
    const outcome = await save(t.users.teacherA, [cell("  ")]);
    assert.equal(outcome.cleared, 1);
    assert.equal(await markOf(), undefined);
    assert.equal(await absenceOf(), undefined);
  });

  it("names a square it cannot read rather than dropping it", async () => {
    // Losing what somebody typed into a register without saying so is how a
    // term's marks go missing.
    const outcome = await save(t.users.teacherA, [cell("пять"), cell("9"), cell("2.5")]);
    assert.deepEqual(outcome.errors.map((e) => e.code).sort(), ["invalid", "out_of_range"]);
    assert.equal(outcome.saved, 1, "2.5 out of 5 is a legitimate mark");
  });

  it("accepts a comma where a teacher types one", async () => {
    await save(t.users.teacherA, [cell("4,5")]);
    assert.equal(Number((await markOf())!.score), 4.5);
  });
});

describe("who may write in it", () => {
  it("the teacher whose journal it is", async () => {
    const outcome = await save(t.users.teacherA, [cell("5")]);
    assert.deepEqual(outcome.errors, []);
  });

  it("nobody else, however senior, without the permission to correct marks", async () => {
    assert.equal(await errorOf(() => save(t.users.teacherB, [cell("5")])), "forbidden");
    assert.equal(await errorOf(() => save(t.users.studentA, [cell("5")])), "forbidden");
    assert.equal(await errorOf(() => save(t.users.parentA, [cell("5")])), "forbidden");
  });

  it("the administration, which may correct any of them", async () => {
    const outcome = await save(t.users.adminA, [cell("5")]);
    assert.deepEqual(outcome.errors, []);
  });
});

describe("ruling a column", () => {
  const rule = (actor: string, kind: string, date: string | null, label: string | null) =>
    asUser(db, actor, (tx) =>
      one<{ id: string }>(tx, `SELECT public.rule_journal_column($1, $2, $3, $4::date, NULL, $5) AS id`, [
        a.mathA,
        a.termCurrent,
        kind,
        date,
        label,
      ])
    );

  it("takes the date the teacher wrote, and guesses none", async () => {
    const ruled = await rule(t.users.teacherA, "lesson", day, null);
    const column = await one<{ column_date: string; kind: string }>(
      db,
      `SELECT column_date::text, kind FROM public.journal_columns WHERE id = $1`,
      [ruled!.id]
    );
    assert.equal(column!.column_date, day);
    assert.equal(column!.kind, "lesson");
  });

  it("refuses a lesson column with no date at all", async () => {
    assert.equal(await errorOf(() => rule(t.users.teacherA, "lesson", null, null)), "date_required");
  });

  it("heads a quarter column with its name instead of a date", async () => {
    // The last columns of a Tajik register say «Чоряки I», not a day in May.
    const ruled = await rule(t.users.teacherA, "term", null, "Чоряки I");
    const column = await one<{ label: string; kind: string; column_date: string }>(
      db,
      `SELECT label, kind, column_date::text FROM public.journal_columns WHERE id = $1`,
      [ruled!.id]
    );
    assert.equal(column!.label, "Чоряки I");
    assert.equal(column!.kind, "term");
    const term = await one<{ end_date: string }>(db, `SELECT end_date::text FROM public.academic_terms WHERE id = $1`, [
      a.termCurrent,
    ]);
    assert.equal(column!.column_date, term!.end_date, "it still has to sit somewhere in the order");
  });

  it("refuses a quarter column with no name", async () => {
    assert.equal(await errorOf(() => rule(t.users.teacherA, "term", null, "  ")), "label_required");
  });

  it("is refused to somebody whose journal it is not", async () => {
    assert.equal(await errorOf(() => rule(t.users.teacherB, "lesson", day, null)), "forbidden");
  });
});

describe("the rules the register already had", () => {
  it("records who entered the mark and who marked the absence", async () => {
    await save(t.users.teacherA, [cell("5")]);
    const mark = await one<{ entered_by: string }>(
      db,
      `SELECT entered_by FROM public.grades WHERE student_id = $1 AND class_subject_id = $2 AND grade_date = $3`,
      [a.students.studentA, a.mathA, day]
    );
    assert.equal(mark!.entered_by, t.users.teacherA, "a mark with no author cannot be questioned later");

    await save(t.users.teacherA, [cell("ғ")]);
    const absence = await one<{ marked_by: string }>(
      db,
      `SELECT marked_by FROM public.attendance_records WHERE student_id = $1 AND class_subject_id = $2 AND attendance_date = $3`,
      [a.students.studentA, a.mathA, day]
    );
    assert.equal(absence!.marked_by, t.users.teacherA);
  });

  it("refuses an absence for a day that has not happened", async () => {
    const future = await one<{ d: string }>(db, `SELECT (current_date + 3)::text AS d`);
    const outcome = await save(t.users.teacherA, [cell("ғ", a.students.studentA, future!.d)]);
    assert.deepEqual(outcome.errors.map((e) => e.code), ["future_date"]);
  });

  it("still takes a mark dated at the end of the term, which is where a quarter mark goes", async () => {
    const termEnd = await one<{ d: string }>(db, `SELECT end_date::text AS d FROM public.academic_terms WHERE id = $1`, [
      a.termCurrent,
    ]);
    const outcome = await save(t.users.teacherA, [cell("5", a.students.studentA, termEnd!.d)]);
    assert.deepEqual(outcome.errors, [], "a quarter column is dated ahead on purpose");
  });

  it("closes the correction window on an old absence, for the teacher but not the administration", async () => {
    const old = await one<{ d: string }>(db, `SELECT (current_date - 40)::text AS d`);
    const byTeacher = await save(t.users.teacherA, [cell("ғ", a.students.studentA, old!.d)]);
    assert.deepEqual(byTeacher.errors.map((e) => e.code), ["window_closed"]);

    const byAdmin = await save(t.users.adminA, [cell("ғ", a.students.studentA, old!.d)]);
    assert.deepEqual(byAdmin.errors, [], "somebody who may correct attendance is not bound by the window");
  });

  it("names a square from before the pupil arrived, and keeps the rest of the page", async () => {
    // A teacher who has just filled in a fortnight must not lose it because one
    // child joined the class halfway through. The trigger would have raised and
    // rolled the whole call back; the square comes back named instead.
    await db.query(`UPDATE public.enrollments SET enrolled_on = current_date WHERE student_id = $1`, [
      a.students.unlinkedA,
    ]);
    const outcome = await save(t.users.teacherA, [cell("5"), cell("4", a.students.unlinkedA)]);
    assert.deepEqual(outcome.errors.map((e) => e.code), ["not_enrolled"], "only the square that broke the rule");
    assert.equal(outcome.saved, 1, "the pupil who was there still gets their mark");
    assert.equal(Number((await markOf())!.score), 5);
    await db.query(`UPDATE public.enrollments SET enrolled_on = current_date - 60 WHERE student_id = $1`, [
      a.students.unlinkedA,
    ]);
  });

  it("refuses the whole page once the term is locked", async () => {
    await db.query(`UPDATE public.academic_terms SET is_locked = true WHERE id = $1`, [a.termCurrent]);
    assert.equal(await errorOf(() => save(t.users.teacherA, [cell("5")])), "term_locked");
    // The administration may still correct what a locked term holds.
    const byAdmin = await save(t.users.adminA, [cell("5")]);
    assert.deepEqual(byAdmin.errors, []);
    await db.query(`UPDATE public.academic_terms SET is_locked = false WHERE id = $1`, [a.termCurrent]);
  });
});
