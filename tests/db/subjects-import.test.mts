import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { sampleRows, sampleSpec } from "../../src/features/admin/import/samples.ts";

let db: Db;
let t: Tenants;

interface Outcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string; detail?: string }>;
  created: number;
  updated: number;
  newSubjects: string[];
}

type Row = Record<string, string>;

const importAs = (actor: string, sheet: Row[], dryRun = false) =>
  asUser(db, actor, (tx) => one<{ r: Outcome }>(tx, `SELECT public.import_subjects($1::jsonb, $2) AS r`, [JSON.stringify(sheet), dryRun])).then((r) => r!.r);

const run = (sheet: Row[], dryRun = false) => importAs(t.users.adminA, sheet, dryRun);
const problems = (outcome: Outcome) => outcome.errors.map((e) => `${e.row}:${e.field}:${e.code}`).sort();
const subject = (name: string) =>
  one<{ name_tg: string; name_ru: string | null; name_en: string | null; code: string | null; hours: string | null; is_active: boolean }>(db,
    `SELECT name_tg, name_ru, name_en, code, default_weekly_hours::text AS hours, is_active
     FROM public.subjects WHERE school_id = $1 AND lower(name_tg) = lower($2)`, [SCHOOL_A, name]).then((r) => r ?? null);

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

describe("the subjects workbook", () => {
  const sheet: Row[] = [
    { name_tg: "Математика", name_ru: "Математика", name_en: "Mathematics", code: "math", weekly_hours: "5" },
    { name_tg: "Забони  тоҷикӣ", name_ru: "Таджикский язык", name_en: "Tajik language", code: "TAJ", weekly_hours: "4,5" },
    { name_tg: "Тарбияи ҷисмонӣ", name_ru: "", name_en: "", code: "", weekly_hours: "" },
  ];

  it("previews what it would do and writes nothing", async () => {
    const preview = await run(sheet, true);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    assert.equal(preview.created, 3);
    assert.equal(preview.updated, 0);
    assert.deepEqual(preview.newSubjects, ["Математика", "Забони тоҷикӣ", "Тарбияи ҷисмонӣ"]);
    assert.equal(await subject("Математика"), null);
  });

  it("adds the subjects with their names, codes and hours", async () => {
    const done = await run(sheet);
    assert.equal(done.valid, true, JSON.stringify(done.errors));
    assert.equal(done.created, 3);
    assert.deepEqual(await subject("Математика"), {
      name_tg: "Математика", name_ru: "Математика", name_en: "Mathematics", code: "MATH", hours: "5.0", is_active: true,
    });
    const tajik = await subject("Забони тоҷикӣ");
    assert.equal(tajik!.name_tg, "Забони тоҷикӣ", "runs of spaces fold into one");
    assert.equal(tajik!.hours, "4.5", "a decimal comma reads as a point");
  });

  it("updates a subject it already has, keeps what an empty cell leaves out, and brings it back from the archive", async () => {
    await db.query(`UPDATE public.subjects SET is_active = false WHERE school_id = $1 AND name_tg = 'Математика'`, [SCHOOL_A]);
    const again = await run([{ name_tg: "математика", name_ru: "", name_en: "", code: "", weekly_hours: "6" }]);
    assert.equal(again.valid, true, JSON.stringify(again.errors));
    assert.deepEqual([again.created, again.updated], [0, 1]);
    const math = await subject("Математика");
    assert.equal(math!.name_ru, "Математика");
    assert.equal(math!.code, "MATH");
    assert.equal(math!.hours, "6.0");
    assert.equal(math!.is_active, true);
  });

  it("fills in a subject the timetable made from its name alone", async () => {
    await db.query(`INSERT INTO public.subjects (school_id, name_tg) VALUES ($1, 'Химия')`, [SCHOOL_A]);
    const done = await run([{ name_tg: "Химия", name_ru: "Химия", name_en: "Chemistry", code: "CHEM", weekly_hours: "2" }]);
    assert.deepEqual([done.created, done.updated], [0, 1]);
    assert.equal((await subject("Химия"))!.code, "CHEM");
  });

  it("says what is wrong with each row and writes nothing", async () => {
    const outcome = await run([
      { name_tg: "", name_ru: "Без названия", name_en: "", code: "", weekly_hours: "" },
      { name_tg: "Физика", name_ru: "", name_en: "", code: "PHY SICS", weekly_hours: "" },
      { name_tg: "физика", name_ru: "", name_en: "", code: "", weekly_hours: "" },
      { name_tg: "Биология", name_ru: "", name_en: "", code: "", weekly_hours: "панҷ" },
      { name_tg: "География", name_ru: "", name_en: "", code: "", weekly_hours: "25" },
      { name_tg: "Геометрия", name_ru: "", name_en: "", code: "MATH", weekly_hours: "" },
      { name_tg: "Химия", name_ru: "", name_en: "", code: "MATH", weekly_hours: "" },
    ]);
    assert.equal(outcome.valid, false);
    assert.deepEqual(problems(outcome), [
      "1:name_tg:required",
      "2:code:invalid_code",
      "3:name_tg:duplicate_in_file",
      "4:weekly_hours:invalid_hours",
      "5:weekly_hours:invalid_hours",
      "6:code:code_taken",
      "7:code:code_taken",
      "7:code:duplicate_in_file",
    ]);
    assert.equal(await subject("Физика"), null);
    assert.equal(await subject("Геометрия"), null);
  });

  it("takes its own filled-in sample without a single complaint", async () => {
    const spec = sampleSpec("subjects");
    const rows = sampleRows("subjects").map((cells) => Object.fromEntries(spec.columns.map((column, index) => [column.key, cells[index] ?? ""])));
    const preview = await run(rows, true);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    assert.equal(preview.total, rows.length);
  });

  it("is the subjects manager's to use, not a teacher's", async () => {
    const byTeacher = await errorOf(() => importAs(t.users.teacherA, [{ name_tg: "Мусиқӣ" }]));
    assert.match(byTeacher ?? "", /forbidden/);
  });

  it("refuses an empty sheet and an oversized one", async () => {
    assert.match((await errorOf(() => run([]))) ?? "", /empty_import/);
    const huge = Array.from({ length: 301 }, (_, i) => ({ name_tg: `Фан ${i}` }));
    assert.match((await errorOf(() => run(huge))) ?? "", /import_too_large/);
  });
});
