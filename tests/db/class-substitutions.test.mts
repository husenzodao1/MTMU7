import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

interface Row {
  substitution_date: string;
  period_number: number;
  subject_tg: string;
  teacher_name: string | null;
}

const list = (user: string) =>
  asUser(db, user, (tx) => rows<Row>(tx, `SELECT substitution_date::text, period_number, subject_tg, teacher_name FROM public.class_substitutions($1)`, [a.class9A]));

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  // A substitution is for a day the lesson is on, and nothing is on a Sunday:
  // each offset is moved off Sunday, and its lesson put on that weekday.
  const day = async (offset: number) =>
    (await one<{ d: number }>(
      db,
      `SELECT CASE WHEN extract(isodow FROM app.school_today($1) + $2::int) = 7 THEN $2::int + 1 ELSE $2::int END AS d`,
      [SCHOOL_A, offset]
    ))!;
  const lesson = async (period: number, offset: number) => {
    const { d } = await day(offset);
    const dow = (await one<{ dow: number }>(db, `SELECT extract(isodow FROM app.school_today($1) + $2::int)::int AS dow`, [SCHOOL_A, d]))!.dow;
    const entryId = (await one<{ id: string }>(
      db,
      `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, teacher_id, day_of_week, period_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [SCHOOL_A, a.yearA, a.class9A, a.mathA, a.staff.teacherA, dow, period]
    ))!.id;
    return { entryId, d };
  };
  const sub = async (period: number, offset: number, status = "confirmed") => {
    const { entryId, d } = await lesson(period, offset);
    await db.query(
      `INSERT INTO public.substitutions (school_id, timetable_entry_id, substitution_date, substitute_teacher_id, status)
       VALUES ($1, $2, app.school_today($1) + $3::int, $4, $5)`,
      [SCHOOL_A, entryId, d, a.staff.teacher2A, status]
    );
  };
  await sub(1, 1);
  await sub(2, 3, "cancelled");
  await sub(3, -3);
  await sub(4, 20);
});
after(async () => {
  await db.close();
});

describe("a class's substitutions for the coming week", () => {
  it("shows the pupil tomorrow's substitute, and not cancelled, past or far-off ones", async () => {
    const mine = await list(t.users.studentA);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.period_number, 1);
    assert.equal(mine[0]!.subject_tg, "Math");
    assert.equal(mine[0]!.teacher_name, "Two Teacher");
  });

  it("shows the same to a parent of the class", async () => {
    assert.equal((await list(t.users.parentA)).length, 1);
  });

  it("is not for a pupil of another class", async () => {
    assert.equal(await errorOf(() => list(t.users.student2A)), "forbidden");
  });
});
