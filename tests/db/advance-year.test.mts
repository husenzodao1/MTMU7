import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

interface Result {
  yearId: string;
  moved: number;
  graduated: number;
  classesCreated: number;
}

const advance = (actor: string, name = "2027-2028") =>
  asUser(db, actor, (tx) =>
    one<{ r: Result }>(
      tx,
      `SELECT public.advance_academic_year($1, (current_date + 30)::date, (current_date + 300)::date) AS r`,
      [name]
    )
  ).then((r) => r!.r);

/** A pupil enrolled in a class, the way the importer would leave them. */
async function enrol(className: string, grade: number, lastName: string): Promise<string> {
  const year = await one<{ id: string }>(db, `SELECT id FROM public.academic_years WHERE school_id = $1 AND is_current`, [SCHOOL_A]);
  let klass = await one<{ id: string }>(
    db,
    `SELECT id FROM public.classes WHERE school_id = $1 AND academic_year_id = $2 AND name = $3`,
    [SCHOOL_A, year!.id, className]
  );
  if (!klass) {
    klass = await one<{ id: string }>(
      db,
      `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, $3, $4) RETURNING id`,
      [SCHOOL_A, year!.id, className, grade]
    );
  }
  const student = await one<{ id: string }>(
    db,
    `INSERT INTO public.students (school_id, first_name, last_name) VALUES ($1, 'Тест', $2) RETURNING id`,
    [SCHOOL_A, lastName]
  );
  await db.query(
    `INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id) VALUES ($1, $2, $3, $4)`,
    [SCHOOL_A, student!.id, klass!.id, year!.id]
  );
  return student!.id;
}

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
  await enrol("5А", 5, "Панҷум");
  await enrol("5Б", 5, "Панҷум-Б");
  await enrol("11А", 11, "Хатмкунанда");
});
after(async () => {
  await db.close();
});

describe("who may move the school up a year", () => {
  it("nobody without both the year and the enrolment permissions", async () => {
    assert.equal(await errorOf(() => advance(t.users.teacherA)), "forbidden");
    assert.equal(await errorOf(() => advance(t.users.studentA)), "forbidden");
  });
});

describe("the first of September", () => {
  let result: Result;

  before(async () => {
    result = await advance(t.users.adminA);
  });

  it("makes 5А into 6А and takes its pupils with it", async () => {
    const placed = await rows<{ cls: string; last_name: string }>(
      db,
      `SELECT c.name AS cls, s.last_name
       FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       JOIN public.students s ON s.id = e.student_id
       JOIN public.academic_years y ON y.id = e.academic_year_id AND y.is_current
       WHERE e.status = 'active' AND s.last_name LIKE 'Панҷум%'
       ORDER BY s.last_name`
    );
    assert.deepEqual(placed, [
      { cls: "6А", last_name: "Панҷум" },
      { cls: "6Б", last_name: "Панҷум-Б" },
    ]);
    assert.ok(result.moved >= 2);
  });

  it("keeps where they came from", async () => {
    const history = await rows<{ cls: string; status: string }>(
      db,
      `SELECT c.name AS cls, e.status FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       JOIN public.students s ON s.id = e.student_id
       WHERE s.last_name = 'Панҷум' ORDER BY e.status`
    );
    assert.deepEqual(history, [
      { cls: "6А", status: "active" },
      { cls: "5А", status: "completed" },
    ]);
  });

  it("lets the eleventh form leave", async () => {
    const leaver = await one<{ status: string }>(db, `SELECT status FROM public.students WHERE last_name = 'Хатмкунанда'`);
    assert.equal(leaver!.status, "graduated");
    assert.equal(result.graduated, 1);
    const stillEnrolled = await rows(
      db,
      `SELECT 1 FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
       WHERE s.last_name = 'Хатмкунанда' AND e.status = 'active'`
    );
    assert.deepEqual(stillEnrolled, [], "a school-leaver is in no class");
  });

  it("leaves an empty first form waiting for the new intake", async () => {
    const first = await rows<{ name: string }>(
      db,
      `SELECT c.name FROM public.classes c
       JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
       WHERE c.school_id = $1 AND c.grade_level = 1`,
      [SCHOOL_A]
    );
    assert.ok(first.length > 0, "the intake workbook needs a class to import into");
  });

  it("moves the current year, and only one year is current", async () => {
    const current = await rows<{ name: string }>(
      db,
      `SELECT name FROM public.academic_years WHERE school_id = $1 AND is_current`,
      [SCHOOL_A]
    );
    assert.deepEqual(current, [{ name: "2027-2028" }]);
  });
});

describe("running it twice", () => {
  it("changes nothing the second time", async () => {
    const again = await advance(t.users.adminA);
    assert.equal(again.moved, 0, "everybody is already where they belong");
    assert.equal(again.classesCreated, 0);
    const duplicates = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.enrollments e
       JOIN public.students s ON s.id = e.student_id
       WHERE s.last_name = 'Панҷум' AND e.status = 'active'`
    );
    assert.equal(duplicates!.n, "1");
  });
});
