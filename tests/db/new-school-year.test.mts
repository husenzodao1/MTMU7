import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

interface Result {
  yearId: string;
  moved: number;
  graduated: number;
  classesCreated: number;
  termsCreated: number;
  subjectsCopied: number;
  alreadyDone?: boolean;
}

const start = (actor: string) =>
  asUser(db, actor, (tx) =>
    one<{ r: Result }>(tx, `SELECT public.start_new_school_year('2031-2032', '2031-09-01', '2032-05-31') AS r`)
  ).then((r) => r!.r);

const id = async (sql: string, params: unknown[] = []) => (await one<{ id: string }>(db, sql, params))!.id;

/** The subjects of a class in the current year, with their teachers. */
const subjectsOf = (className: string) =>
  rows<{ subject: string; teacher: string | null; hours: string | null }>(
    db,
    `SELECT s.name_tg AS subject, st.last_name AS teacher, cs.weekly_hours::text AS hours
     FROM public.class_subjects cs
     JOIN public.classes c ON c.id = cs.class_id
     JOIN public.academic_years y ON y.id = c.academic_year_id AND y.is_current
     JOIN public.subjects s ON s.id = cs.subject_id
     LEFT JOIN public.staff st ON st.id = cs.teacher_id
     WHERE c.school_id = $1 AND c.name = $2
     ORDER BY s.name_tg`,
    [SCHOOL_A, className]
  );

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);

  // Last year as the office left it: four quarters, a first form, 5А and 5Б,
  // 6А with its subjects and teachers (one of whom has since left), and 11А.
  const year = await id(
    `INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
     VALUES ($1, '2030-2031', '2030-09-01', '2031-05-31', true) RETURNING id`,
    [SCHOOL_A]
  );
  for (const [name, from, to, order] of [
    ["Чоряки I", "2030-09-01", "2030-11-05", 1],
    ["Чоряки II", "2030-11-16", "2030-12-30", 2],
    ["Чоряки III", "2031-01-11", "2031-03-20", 3],
    ["Чоряки IV", "2031-04-01", "2031-05-31", 4],
  ]) {
    await db.query(
      `INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, sort_order)
       VALUES ($1, $2, $3, 'quarter', $4, $5, $6)`,
      [SCHOOL_A, year, name, from, to, order]
    );
  }
  const math = await id(`INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Математика', 'M') RETURNING id`, [SCHOOL_A]);
  const history = await id(`INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Таърих', 'H') RETURNING id`, [SCHOOL_A]);
  const art = await id(`INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Санъат', 'A') RETURNING id`, [SCHOOL_A]);
  const reading = await id(`INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Хониш', 'R') RETURNING id`, [SCHOOL_A]);
  const karimov = await id(`INSERT INTO public.staff (school_id, first_name, last_name) VALUES ($1, 'Али', 'Каримов') RETURNING id`, [SCHOOL_A]);
  const nazarova = await id(`INSERT INTO public.staff (school_id, first_name, last_name) VALUES ($1, 'Мавҷуда', 'Назарова') RETURNING id`, [SCHOOL_A]);
  const left = await id(`INSERT INTO public.staff (school_id, first_name, last_name, status) VALUES ($1, 'Рафта', 'Рафтаев', 'archived') RETURNING id`, [SCHOOL_A]);

  const classes: Record<string, string> = {};
  for (const [name, grade] of [["1А", 1], ["5А", 5], ["5Б", 5], ["6А", 6], ["11А", 11]] as const) {
    classes[name] = await id(
      `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, $3, $4) RETURNING id`,
      [SCHOOL_A, year, name, grade]
    );
  }
  const teach = (cls: string, subject: string, teacher: string | null, hours: number) =>
    db.query(
      `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id, weekly_hours) VALUES ($1, $2, $3, $4, $5)`,
      [SCHOOL_A, classes[cls], subject, teacher, hours]
    );
  await teach("1А", reading, nazarova, 6);
  await teach("6А", math, karimov, 5);
  await teach("6А", history, nazarova, 2);
  await teach("6А", art, left, 1);

  for (const [cls, name] of [["5А", "Аҳмадов"], ["5Б", "Бобоев"], ["6А", "Валиев"], ["11А", "Ғаниев"]] as const) {
    const student = await id(`INSERT INTO public.students (school_id, first_name, last_name) VALUES ($1, 'Тест', $2) RETURNING id`, [SCHOOL_A, name]);
    await db.query(
      `INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id) VALUES ($1, $2, $3, $4)`,
      [SCHOOL_A, student, classes[cls], year]
    );
  }
});
after(async () => {
  await db.close();
});

describe("who may start the new year", () => {
  it("nobody without the year and the enrolment permissions", async () => {
    assert.equal(await errorOf(() => start(t.users.teacherA)), "forbidden");
    assert.equal(await errorOf(() => start(t.users.studentA)), "forbidden");
  });
});

describe("the first of September in one step", () => {
  let result: Result;

  before(async () => {
    result = await start(t.users.adminA);
  });

  it("moves the school up a year as before", async () => {
    const current = await one<{ name: string; status: string }>(
      db,
      `SELECT name, status FROM public.academic_years WHERE school_id = $1 AND is_current`,
      [SCHOOL_A]
    );
    assert.deepEqual(current, { name: "2031-2032", status: "active" });
    assert.equal(result.graduated, 1);
    assert.ok(result.moved >= 3);
  });

  it("gives the new year last year's quarters a year later", async () => {
    const terms = await rows<{ name: string; start_date: string; end_date: string }>(
      db,
      `SELECT t.name, t.start_date::text, t.end_date::text FROM public.academic_terms t
       JOIN public.academic_years y ON y.id = t.academic_year_id AND y.is_current
       WHERE y.school_id = $1 ORDER BY t.start_date`,
      [SCHOOL_A]
    );
    assert.deepEqual(terms, [
      { name: "Чоряки I", start_date: "2031-09-01", end_date: "2031-11-05" },
      { name: "Чоряки II", start_date: "2031-11-16", end_date: "2031-12-30" },
      { name: "Чоряки III", start_date: "2032-01-11", end_date: "2032-03-20" },
      { name: "Чоряки IV", start_date: "2032-04-01", end_date: "2032-05-31" },
    ]);
    assert.equal(result.termsCreated, 4);
  });

  it("gives the new 6А what last year's 6А had, without the teacher who left", async () => {
    assert.deepEqual(await subjectsOf("6А"), [
      { subject: "Математика", teacher: "Каримов", hours: "5.0" },
      { subject: "Санъат", teacher: null, hours: "1.0" },
      { subject: "Таърих", teacher: "Назарова", hours: "2.0" },
    ]);
  });

  it("gives a class new by name the subjects of its form, teachers to be chosen", async () => {
    assert.deepEqual(await subjectsOf("6Б"), [
      { subject: "Математика", teacher: null, hours: "5.0" },
      { subject: "Санъат", teacher: null, hours: "1.0" },
      { subject: "Таърих", teacher: null, hours: "2.0" },
    ]);
  });

  it("gives the new first form last year's first-form subjects", async () => {
    assert.deepEqual(await subjectsOf("1А"), [{ subject: "Хониш", teacher: "Назарова", hours: "6.0" }]);
    assert.equal(result.subjectsCopied, 7);
  });

  it("changes nothing the second time", async () => {
    const again = await start(t.users.adminA);
    assert.equal(again.termsCreated, 0);
    assert.equal(again.subjectsCopied, 0);
    assert.equal(again.moved, 0);
    const terms = await one<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM public.academic_terms t JOIN public.academic_years y ON y.id = t.academic_year_id AND y.is_current WHERE y.school_id = $1`,
      [SCHOOL_A]
    );
    assert.equal(terms!.n, 4);
  });
});

describe("quarters for a year made by hand", () => {
  let next: string;

  before(async () => {
    next = await id(
      `INSERT INTO public.academic_years (school_id, name, start_date, end_date, status)
       VALUES ($1, '2032-2033', '2032-09-01', '2033-05-31', 'planned') RETURNING id`,
      [SCHOOL_A]
    );
  });

  it("is for the office only", async () => {
    assert.equal(
      await errorOf(() => asUser(db, t.users.teacherA, (tx) => one(tx, `SELECT public.add_standard_terms($1)`, [next]))),
      "forbidden"
    );
  });

  it("copies the latest year's quarters a year on, once", async () => {
    const made = await asUser(db, t.users.adminA, (tx) => one<{ n: number }>(tx, `SELECT public.add_standard_terms($1) AS n`, [next]));
    assert.equal(made!.n, 4);
    const first = await one<{ start_date: string; end_date: string }>(
      db,
      `SELECT start_date::text, end_date::text FROM public.academic_terms WHERE academic_year_id = $1 ORDER BY start_date LIMIT 1`,
      [next]
    );
    assert.deepEqual(first, { start_date: "2032-09-01", end_date: "2032-11-05" });
    const again = await asUser(db, t.users.adminA, (tx) => one<{ n: number }>(tx, `SELECT public.add_standard_terms($1) AS n`, [next]));
    assert.equal(again!.n, 0);
  });

  it("falls back to the usual four quarters when there is nothing to copy", async () => {
    const lone = await id(
      `INSERT INTO public.academic_years (school_id, name, start_date, end_date, status)
       VALUES ($1, '2020-2021', '2020-09-01', '2021-05-31', 'closed') RETURNING id`,
      [SCHOOL_A]
    );
    const made = await asUser(db, t.users.adminA, (tx) => one<{ n: number }>(tx, `SELECT public.add_standard_terms($1) AS n`, [lone]));
    assert.equal(made!.n, 4);
    const names = await rows<{ name: string }>(db, `SELECT name FROM public.academic_terms WHERE academic_year_id = $1 ORDER BY sort_order`, [lone]);
    assert.deepEqual(names.map((r) => r.name), ["Чоряки I", "Чоряки II", "Чоряки III", "Чоряки IV"]);
  });
});
