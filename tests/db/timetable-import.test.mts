import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

interface Outcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string; detail?: string }>;
  written: number;
  newSubjects: string[];
}

type Row = Record<string, string>;

const importAs = (actor: string, sheet: Row[], dryRun = false) =>
  asUser(db, actor, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.import_timetable($1::jsonb, $2) AS r`, [JSON.stringify(sheet), dryRun])
  ).then((r) => r!.r);

const run = (sheet: Row[], dryRun = false) => importAs(t.users.adminA, sheet, dryRun);
const problems = (outcome: Outcome) => outcome.errors.map((e) => `${e.row}:${e.field}:${e.code}`).sort();

const day = (className: string, weekday: string, cells: Record<string, string>): Row => ({
  class_name: className,
  day: weekday,
  ...cells,
});

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
  // A class for the timetable to point at, and two numbered teachers for the
  // cells to name.
  await db.query(
    `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
     SELECT $1, y.id, '7А', 7 FROM public.academic_years y WHERE y.school_id = $1 AND y.is_current`,
    [SCHOOL_A]
  );
  await db.query(
    `INSERT INTO public.staff (school_id, employee_number, first_name, last_name, staff_type)
     VALUES ($1, '14', 'Фаррух', 'Ҳусейнов', 'teacher'), ($1, '19', 'Зарина', 'Раҷабова', 'teacher')`,
    [SCHOOL_A]
  );
});
after(async () => {
  await db.close();
});

describe("who owns the timetable", () => {
  it("the deputy head, not a teacher", async () => {
    assert.equal(await errorOf(() => importAs(t.users.teacherA, [day("7А", "Душанбе", { p1: "Математика (14)" })])), "forbidden");
    const allowed = await importAs(t.users.directorA, [day("7А", "Душанбе", { p1: "Математика (14)" })], true);
    assert.equal(allowed.valid, true);
  });
});

describe("reading a cell", () => {
  it("takes the number in the brackets as the teacher", async () => {
    const outcome = await run([day("7А", "Душанбе", { p1: "Математика (14)", p2: "Физика (19)" })]);
    assert.equal(outcome.written, 2);
    const lessons = await rows<{ period: number; subject: string; number: string }>(
      db,
      `SELECT te.period_number AS period, s.name_tg AS subject, st.employee_number AS number
       FROM public.timetable_entries te
       JOIN public.class_subjects cs ON cs.id = te.class_subject_id
       JOIN public.subjects s ON s.id = cs.subject_id
       JOIN public.staff st ON st.id = te.teacher_id
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 1 ORDER BY te.period_number`
    );
    assert.deepEqual(lessons, [
      { period: 1, subject: "Математика", number: "14" },
      { period: 2, subject: "Физика", number: "19" },
    ]);
  });

  it("says which subjects it is about to invent, so a typo is seen first", async () => {
    const outcome = await run([day("7А", "Сешанбе", { p1: "Матиматика (14)" })], true);
    assert.deepEqual(outcome.newSubjects, ["Матиматика"], "one letter out, and it would have been a second subject");
  });

  it("treats two spellings of one subject as one subject", async () => {
    await run([day("7А", "Сешанбе", { p1: "математика (14)" })]);
    const subjects = await rows<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.subjects WHERE school_id = $1 AND lower(name_tg) = 'математика'`,
      [SCHOOL_A]
    );
    assert.deepEqual(subjects, [{ n: "1" }]);
  });

  it("refuses a number no teacher holds", async () => {
    const outcome = await run([day("7А", "Чоршанбе", { p1: "Математика (77)" })], true);
    assert.deepEqual(problems(outcome), ["1:p1:unknown_teacher"]);
  });

  it("accepts a subject whose teacher is not settled yet", async () => {
    const outcome = await run([day("7А", "Чоршанбе", { p1: "Математика" })], true);
    assert.equal(outcome.valid, true, "in September the timetable is often written before the staff list is final");
  });

  it("refuses a day it does not recognise", async () => {
    const outcome = await run([day("7А", "Якшанбе", { p1: "Математика (14)" })], true);
    assert.deepEqual(problems(outcome), ["1:day:invalid_enum"]);
  });

  it("refuses a class that does not exist", async () => {
    const outcome = await run([day("9Я", "Душанбе", { p1: "Математика (14)" })], true);
    assert.deepEqual(problems(outcome), ["1:class_name:unknown_class"]);
  });
});

describe("a teacher in two places at once", () => {
  it("is caught before anything is written, and the number is named", async () => {
    await db.query(
      `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level)
       SELECT $1, y.id, '9Б', 9 FROM public.academic_years y WHERE y.school_id = $1 AND y.is_current`,
      [SCHOOL_A]
    );
    const outcome = await run(
      [day("7А", "Панҷшанбе", { p3: "Математика (14)" }), day("9Б", "Панҷшанбе", { p3: "Математика (14)" })],
      true
    );
    assert.deepEqual(problems(outcome), ["2:p3:teacher_busy"]);
    assert.equal(outcome.errors[0]!.detail, "14");
  });
});

describe("a class split into groups", () => {
  it("lets one period hold two lessons with two teachers", async () => {
    const outcome = await run([day("7А", "Ҷумъа", { p1: "Забони англисӣ (14) / Забони англисӣ (19)" })]);
    assert.equal(outcome.written, 2);
    const groups = await rows<{ label: string; number: string }>(
      db,
      `SELECT te.group_label AS label, st.employee_number AS number
       FROM public.timetable_entries te
       JOIN public.staff st ON st.id = te.teacher_id
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 5 AND te.period_number = 1
       ORDER BY te.group_label`
    );
    assert.deepEqual(groups, [
      { label: "1", number: "14" },
      { label: "2", number: "19" },
    ]);
  });

  it("leaves an undivided class with no group at all", async () => {
    const labels = await rows<{ label: string }>(
      db,
      `SELECT DISTINCT te.group_label AS label FROM public.timetable_entries te
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 1`
    );
    assert.deepEqual(labels, [{ label: "" }], "nothing written before groups existed changes meaning");
  });
});

describe("importing an edited timetable", () => {
  it("replaces the days the file covers and leaves the rest alone", async () => {
    const before = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.timetable_entries te JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 5`
    );
    assert.equal(before!.n, "2");

    await run([day("7А", "Ҷумъа", { p1: "Таърих (14)" })]);
    const friday = await rows<{ subject: string }>(
      db,
      `SELECT s.name_tg AS subject FROM public.timetable_entries te
       JOIN public.class_subjects cs ON cs.id = te.class_subject_id
       JOIN public.subjects s ON s.id = cs.subject_id
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 5`
    );
    assert.deepEqual(friday, [{ subject: "Таърих" }], "the two English groups are gone, not duplicated");

    const monday = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.timetable_entries te JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '7А' AND te.day_of_week = 1`
    );
    assert.equal(monday!.n, "2", "a day the file did not mention is untouched");
  });

  it("refuses the same class and day twice in one file", async () => {
    const outcome = await run([day("7А", "Шанбе", { p1: "Математика (14)" }), day("7А", "Шанбе", { p1: "Физика (19)" })], true);
    assert.deepEqual(problems(outcome), ["2:day:duplicate_in_file"]);
  });
});
