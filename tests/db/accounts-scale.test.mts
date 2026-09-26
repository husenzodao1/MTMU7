import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

/**
 * A whole school, the way it is filled in September: 22 classes from the
 * first grade to the eleventh, the register workbook of every pupil imported
 * the way the admin imports it (a few hundred rows at a time), the youngest
 * with a parent written beside them — brothers and sisters sharing one — and
 * a homeroom teacher for every class made from the form.
 *
 * Then a working day on the "Account management" block: every filter, every
 * page of the register, searching, a homeroom teacher on their own class, and
 * the exports that walk the register 500 rows at a time. PGlite runs in this
 * process, so the budgets are generous; what this proves is that the answers
 * stay exact at the size of a real school, and that nothing is quadratic.
 */
const GRADES = 11;
const LETTERS = ["В", "Г"];
const PER_CLASS = 24;
const PUPILS = GRADES * LETTERS.length * PER_CLASS;

let db: Db;
let t: Tenants;
let a: Academic;
const classIds = new Map<string, string>();
const homeroomOf = new Map<string, string>();
let before_: Record<string, number> = {};

interface Directory {
  total: number;
  counts: Record<string, number>;
  scope: string;
  rows: Array<{ id: string; category: string; class_name: string | null; last_name: string; parents: number | null }>;
}

const directory = (actor: string, category: string, query: string | null, classId: string | null, limit: number, offset: number) =>
  asUser(db, actor, async (tx) =>
    (await one<{ d: Directory }>(tx, `SELECT public.account_directory($1, $2, $3, $4, $5) AS d`, [category, query, classId, limit, offset]))!.d);

async function timed<T>(budgetMs: number, label: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  const took = performance.now() - started;
  assert.ok(took < budgetMs, `${label} took ${Math.round(took)} ms (budget ${budgetMs} ms)`);
  return result;
}

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);

  const counts = await asUser(db, t.users.adminA, async (tx) =>
    (await one<{ d: Directory }>(tx, `SELECT public.account_directory('all') AS d`))!.d.counts);
  before_ = counts;

  for (let grade = 1; grade <= GRADES; grade++) {
    for (const letter of LETTERS) {
      const name = `${grade}${letter}`;
      const row = await one<{ id: string }>(db,
        `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, $3, $4) RETURNING id`,
        [SCHOOL_A, a.yearA, name, grade]);
      classIds.set(name, row!.id);
    }
  }
}, { timeout: 120_000 });

after(async () => {
  await db.close();
});

describe("a school filled in September", { timeout: 600_000 }, () => {
  it("imports every pupil from the register workbook, the youngest with their parents", async () => {
    const rows: Array<Record<string, string>> = [];
    let n = 0;
    for (let grade = 1; grade <= GRADES; grade++) {
      for (const letter of LETTERS) {
        for (let i = 0; i < PER_CLASS; i++) {
          n++;
          const young = grade <= 4;
          // Every third young pupil has a brother or sister in the class
          // above: the same parent, the same telephone.
          const family = young ? (i % 3 === 0 && grade > 1 ? `${grade - 1}-${letter}-${i}` : `${grade}-${letter}-${i}`) : null;
          const digits = family ? String(900000000 + [...family].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99_999_999, 7)).slice(0, 9) : "";
          rows.push({
            class_name: `${grade}${letter}`,
            last_name: `Pupil${String(n).padStart(4, "0")}`,
            first_name: i % 2 ? "Aziz" : "Madina",
            date_of_birth: `${2019 - grade + 1}-0${1 + (i % 9)}-1${i % 10}`,
            email: grade <= 5 ? "" : `pupil${n}@example.test`,
            ...(young ? { guardian_name: `Parent${family} Guardian`, guardian_phone: `+992 ${digits}`, guardian_relationship: i % 2 ? "падар" : "модар" } : {}),
          });
        }
      }
    }
    assert.equal(rows.length, PUPILS);

    const logins: string[] = [];
    for (let offset = 0; offset < rows.length; offset += 300) {
      const chunk = rows.slice(offset, offset + 300);
      const done = await timed(90_000, `import of rows ${offset}–${offset + chunk.length}`, () =>
        asUser(db, t.users.adminA, async (tx) =>
          (await one<{ r: { valid: boolean; created: number; errors: unknown[]; credentials: Array<{ login: string }> } }>(tx,
            `SELECT public.import_people('students', $1, false, 0, 300) AS r`, [JSON.stringify(chunk)]))!.r));
      assert.equal(done.valid, true, JSON.stringify(done.errors).slice(0, 400));
      assert.equal(done.created, chunk.length);
      logins.push(...done.credentials.map((c) => c.login));

      const young = chunk.map((row, i): Record<string, string> => ({ ...row, login: done.credentials[i]!.login })).filter((row) => row.guardian_name);
      if (young.length) {
        const linked = await asUser(db, t.users.adminA, async (tx) =>
          (await one<{ n: number }>(tx, `SELECT public.import_guardians($1) AS n`, [JSON.stringify(young)]))!.n);
        assert.equal(linked, young.length);
      }
    }
    assert.equal(new Set(logins).size, PUPILS, "every pupil has a login of their own");

    const young = await one<{ pupils: number; linked: number; parents: number }>(db, `
      SELECT count(DISTINCT s.id)::int AS pupils,
             count(DISTINCT sg.student_id)::int AS linked,
             count(DISTINCT sg.guardian_id)::int AS parents
      FROM public.students s
      JOIN public.enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN public.classes c ON c.id = e.class_id AND c.name ~ '^[1-4][ВГ]$'
      LEFT JOIN public.student_guardians sg ON sg.student_id = s.id`);
    assert.equal(young!.pupils, 4 * LETTERS.length * PER_CLASS);
    assert.equal(young!.linked, young!.pupils, "every young pupil has a parent");
    assert.ok(young!.parents < young!.pupils, "brothers and sisters share one parent");
  });

  it("gives every class a homeroom teacher, made from the form", async () => {
    let i = 0;
    for (const [name, classId] of classIds) {
      i++;
      const saved = await asUser(db, t.users.adminA, async (tx) =>
        (await one<{ r: { valid: boolean; errors: unknown[]; userId: string } }>(tx, `SELECT public.save_account(NULL, $1) AS r`, [JSON.stringify({
          kind: "teacher", last_name: `Teacher${i}`, first_name: "Homeroom", email: `homeroom${i}@example.test`,
          staff: { position: "Омӯзгор", homeroom_class_id: classId },
        })]))!.r);
      assert.equal(saved.valid, true, JSON.stringify(saved.errors));
      homeroomOf.set(name, saved.userId);
    }
    assert.equal(homeroomOf.size, GRADES * LETTERS.length);
  });

  it("counts every kind of account exactly", async () => {
    const all = await timed(5_000, "the register, first page", () => directory(t.users.adminA, "all", null, null, 50, 0));
    assert.equal(all.scope, "school");
    assert.equal(all.counts.student, (before_.student ?? 0) + PUPILS);
    assert.equal(all.counts.teacher, (before_.teacher ?? 0) + GRADES * LETTERS.length);
    assert.equal(all.rows.length, 50);
    assert.equal(all.total, Object.values(all.counts).reduce((s, c) => s + c, 0));
  });

  it("pages through all the pupils without losing or repeating one", async () => {
    const seen = new Set<string>();
    let total = 0;
    for (let offset = 0; ; offset += 100) {
      const page = await timed(5_000, `pupils from ${offset}`, () => directory(t.users.adminA, "students", null, null, 100, offset));
      total = page.total;
      for (const row of page.rows) {
        assert.equal(row.category, "student");
        assert.ok(!seen.has(row.id), `${row.last_name} appears twice`);
        seen.add(row.id);
      }
      if (page.rows.length < 100) break;
    }
    assert.equal(seen.size, total);
    assert.equal(total, (before_.student ?? 0) + PUPILS);
  });

  it("filters by class and finds by name, login fragment or class", async () => {
    const klass = await timed(5_000, "one class", () => directory(t.users.adminA, "students", null, classIds.get("7Г")!, 100, 0));
    assert.equal(klass.total, PER_CLASS);
    assert.ok(klass.rows.every((r) => r.class_name === "7Г"));

    const byName = await timed(5_000, "search by surname", () => directory(t.users.adminA, "all", "pupil0042", null, 50, 0));
    assert.equal(byName.total, 1);

    const young = await directory(t.users.adminA, "students", null, classIds.get("2В")!, 100, 0);
    assert.ok(young.rows.every((r) => (r.parents ?? 0) >= 1), "the register shows the parents of the young");
  });

  it("shows a homeroom teacher their own class and nobody else's", async () => {
    const teacher = homeroomOf.get("3Г")!;
    const own = await timed(5_000, "homeroom register", () => directory(teacher, "all", null, null, 100, 0));
    assert.equal(own.scope, "homeroom");
    assert.equal(own.total, PER_CLASS);
    assert.ok(own.rows.every((r) => r.class_name === "3Г" && r.category === "student"));
    const other = await directory(teacher, "all", null, classIds.get("3В")!, 100, 0);
    assert.equal(other.total, 0);
  });

  it("walks the whole register for an export, 500 rows at a time", async () => {
    const rows: string[] = [];
    await timed(30_000, "export walk", async () => {
      for (let offset = 0; ; offset += 500) {
        const page = await directory(t.users.adminA, "all", null, null, 500, offset);
        rows.push(...page.rows.map((r) => r.id));
        if (rows.length >= page.total || page.rows.length === 0) break;
      }
    });
    assert.equal(new Set(rows).size, rows.length);
    const all = await directory(t.users.adminA, "all", null, null, 1, 0);
    assert.equal(rows.length, all.total);
  });

  it("moves a pupil between classes and keeps every count right", async () => {
    const pupil = (await directory(t.users.adminA, "students", null, classIds.get("8В")!, 1, 0)).rows[0]!;
    const details = await asUser(db, t.users.adminA, async (tx) =>
      (await one<{ d: { first_name: string; last_name: string; email: string | null; date_of_birth: string | null } }>(tx,
        `SELECT public.account_details($1) AS d`, [pupil.id]))!.d);
    const moved = await asUser(db, t.users.adminA, async (tx) =>
      (await one<{ r: { valid: boolean; errors: unknown[] } }>(tx, `SELECT public.save_account($1, $2) AS r`, [pupil.id, JSON.stringify({
        kind: "student", first_name: details.first_name, last_name: details.last_name, email: details.email,
        date_of_birth: details.date_of_birth, student: { class_id: classIds.get("8Г"), positions: ["monitor"] },
      })]))!.r);
    assert.equal(moved.valid, true, JSON.stringify(moved.errors));
    const from = await directory(t.users.adminA, "students", null, classIds.get("8В")!, 100, 0);
    const to = await directory(t.users.adminA, "students", null, classIds.get("8Г")!, 100, 0);
    assert.equal(from.total, PER_CLASS - 1);
    assert.equal(to.total, PER_CLASS + 1);
  });
});
