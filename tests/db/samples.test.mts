import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";
import { sampleSpec, type SampleKind } from "../../src/features/admin/import/samples.ts";

/**
 * The examples the school office downloads must themselves import cleanly.
 *
 * An example that would be rejected is worse than no example: it teaches the
 * wrong thing, and the first time anyone finds out is when they have copied its
 * mistakes into a real register. So the same rows are pushed through the same
 * functions here, in the order the office is told to use them.
 */

let db: Db;
let t: Tenants;

interface Outcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string }>;
  created: number;
  written?: number;
  newClasses?: string[];
  newSubjects?: string[];
}

/** The example rows as objects, which is what the importer receives. */
async function sheet(kind: SampleKind): Promise<Array<Record<string, string>>> {
  const { sampleRows } = await import("../../src/features/admin/import/samples.ts");
  const spec = sampleSpec(kind);
  return sampleRows(kind).map((row) =>
    Object.fromEntries(spec.columns.map((column, index) => [column.key, row[index] ?? ""]))
  );
}

const people = (kind: "students" | "staff", data: Array<Record<string, string>>, dryRun: boolean) =>
  asUser(db, t.users.adminA, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.import_people($1, $2::jsonb, $3) AS r`, [kind, JSON.stringify(data), dryRun])
  ).then((r) => r!.r);

const timetable = (data: Array<Record<string, string>>, dryRun: boolean) =>
  asUser(db, t.users.adminA, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.import_timetable($1::jsonb, $2) AS r`, [JSON.stringify(data), dryRun])
  ).then((r) => r!.r);

const problems = (outcome: Outcome) => outcome.errors.map((e) => `${e.row}:${e.field}:${e.code}`);

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

describe("the example workbooks, imported in the order the office is given", () => {
  it("pupils: every row is accepted, a first-grader without an address among them, and the classes appear", async () => {
    const data = await sheet("students");
    const preview = await people("students", data, true);
    assert.deepEqual(problems(preview), [], "an example the importer would reject teaches the wrong thing");
    assert.deepEqual(preview.newClasses, ["1А", "5А", "5Б"]);

    const done = await people("students", data, false);
    assert.equal(done.created, data.length);
  });

  it("pupils: the two children on one family address both get in", async () => {
    // hakimov.oila+somon@ and hakimov.oila+sabina@ reach the same inbox, and
    // are two accounts. This is the example's whole reason for showing them.
    const family = await rows<{ email: string }>(
      db,
      `SELECT email FROM public.users WHERE school_id = $1 AND email LIKE 'hakimov.oila+%' ORDER BY email`,
      [SCHOOL_A]
    );
    assert.equal(family.length, 2);
  });

  it("teachers: every row is accepted, and the class teachers take their classes", async () => {
    const data = await sheet("staff");
    const preview = await people("staff", data, true);
    assert.deepEqual(problems(preview), []);

    const done = await people("staff", data, false);
    assert.equal(done.created, data.length);

    const homeroom = await rows<{ cls: string; number: string }>(
      db,
      `SELECT c.name AS cls, s.employee_number AS number
       FROM public.classes c JOIN public.staff s ON s.id = c.homeroom_staff_id
       WHERE c.school_id = $1 AND c.name IN ('5А', '5Б') ORDER BY c.name`,
      [SCHOOL_A]
    );
    assert.deepEqual(homeroom, [
      { cls: "5А", number: "11" },
      { cls: "5Б", number: "14" },
    ]);
  });

  it("timetable: every cell is understood, including the split English lesson", async () => {
    const data = await sheet("timetable");
    const preview = await timetable(data, true);
    assert.deepEqual(problems(preview), [], "every teacher number in the example must exist in the teachers' sheet");

    const done = await timetable(data, false);
    assert.ok((done.written ?? 0) > 0);

    const split = await rows<{ label: string; number: string }>(
      db,
      `SELECT te.group_label AS label, st.employee_number AS number
       FROM public.timetable_entries te
       JOIN public.staff st ON st.id = te.teacher_id
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '5А' AND te.day_of_week = 1 AND te.period_number = 3
       ORDER BY te.group_label`
    );
    assert.deepEqual(split, [
      { label: "1", number: "19" },
      { label: "2", number: "23" },
    ]);
  });

  it("timetable: a subject with no teacher yet is not an error", async () => {
    const orphan = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.timetable_entries te
       JOIN public.class_subjects cs ON cs.id = te.class_subject_id
       JOIN public.subjects s ON s.id = cs.subject_id
       WHERE s.name_tg = 'Санъати тасвирӣ' AND te.teacher_id IS NULL`
    );
    assert.ok(Number(orphan!.n) > 0, "in September the timetable is often written before the staff list is final");
  });

  it("the journal now knows its subject, its pupils and its teacher without anyone typing them", async () => {
    const lesson = await one<{ subject: string; teacher: string; pupils: string }>(
      db,
      `SELECT s.name_tg AS subject,
              st.last_name AS teacher,
              (SELECT count(*)::text FROM public.enrollments e
               WHERE e.class_id = te.class_id AND e.status = 'active') AS pupils
       FROM public.timetable_entries te
       JOIN public.class_subjects cs ON cs.id = te.class_subject_id
       JOIN public.subjects s ON s.id = cs.subject_id
       JOIN public.staff st ON st.id = te.teacher_id
       JOIN public.classes c ON c.id = te.class_id
       WHERE c.name = '5А' AND te.day_of_week = 1 AND te.period_number = 1`
    );
    assert.equal(lesson!.subject, "Математика");
    assert.equal(lesson!.teacher, "Ҳусейнзода");
    assert.equal(lesson!.pupils, "3", "5А holds three of the six example pupils");
  });
});
