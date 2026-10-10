import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const addClass = (name: string, year = a.yearA) =>
  db.query(`INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, $3, 10) RETURNING id`, [
    SCHOOL_A,
    year,
    name,
  ]);

describe("a class entered twice", () => {
  it("is refused whether the A is Latin or Cyrillic, spaced or dashed", async () => {
    await addClass("10A"); // Latin A
    for (const twin of ["10А", "10 А", "10-а", " 10a "]) {
      assert.match((await errorOf(() => addClass(twin))) ?? "", /duplicate key/, twin);
    }
  });

  it("is a different class in another year, or once the first is archived", async () => {
    const next = await one<{ id: string }>(
      db,
      `INSERT INTO public.academic_years (school_id, name, start_date, end_date) VALUES ($1, 'next-year', current_date + 300, current_date + 600) RETURNING id`,
      [SCHOOL_A]
    );
    await addClass("10А", next!.id);
    await db.query(`UPDATE public.classes SET is_active = false WHERE school_id = $1 AND name = '10A'`, [SCHOOL_A]);
    await addClass("10А");
    assert.match(
      (await errorOf(() => db.query(`UPDATE public.classes SET is_active = true WHERE school_id = $1 AND name = '10A'`, [SCHOOL_A]))) ?? "",
      /duplicate key/,
      "the archived twin cannot come back beside the new one"
    );
  });
});

describe("the rest of the school's lists", () => {
  it("refuses a room, a year, a subject in a class and a lesson in a slot the second time", async () => {
    await db.query(`INSERT INTO public.rooms (school_id, name) VALUES ($1, 'Кабинети 12')`, [SCHOOL_A]);
    assert.match((await errorOf(() => db.query(`INSERT INTO public.rooms (school_id, name) VALUES ($1, ' кабинети  12 ')`, [SCHOOL_A]))) ?? "", /duplicate key/);

    await db.query(
      `INSERT INTO public.academic_years (school_id, name, start_date, end_date) VALUES ($1, '2030-2031', '2030-09-01', '2031-05-31')`,
      [SCHOOL_A]
    );
    assert.match(
      (await errorOf(() =>
        db.query(`INSERT INTO public.academic_years (school_id, name, start_date, end_date) VALUES ($1, '2030 - 2031', '2030-09-01', '2031-05-31')`, [SCHOOL_A])
      )) ?? "",
      /duplicate key/
    );

    // No group: the same subject twice in one class used to go through.
    assert.match(
      (await errorOf(() =>
        db.query(`INSERT INTO public.class_subjects (school_id, class_id, subject_id) VALUES ($1, $2, $3)`, [SCHOOL_A, a.class9A, a.mathSubject])
      )) ?? "",
      /duplicate key/
    );

    const lesson = `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number)
                    VALUES ($1, $2, $3, $4, 2, 3)`;
    await db.query(lesson, [SCHOOL_A, a.yearA, a.class9A, a.mathA]);
    assert.match((await errorOf(() => db.query(lesson, [SCHOOL_A, a.yearA, a.class9A, a.physicsA]))) ?? "", /duplicate key|conflict/);
  });
});

describe("a telephone number on two accounts", () => {
  const phoneOf = (user: string) => one<{ phone: string }>(db, `SELECT phone FROM public.users WHERE id = $1`, [user]).then((r) => r!.phone);

  it("is named before the account form saves", async () => {
    const taken = await phoneOf(t.users.studentA);
    const inUse = (phone: string, except: string | null = null) =>
      asUser(db, t.users.adminA, (tx) => one<{ r: boolean }>(tx, `SELECT public.phone_in_use($1, $2) AS r`, [phone, except])).then((r) => r!.r);
    assert.equal(await inUse(taken.replace("+992", "")), true, "the same number, written without the country code");
    assert.equal(await inUse(taken, t.users.studentA), false, "the account's own number is not a clash");
    assert.equal(await inUse("+992 90 111 22 33"), false);
    assert.equal(await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.phone_in_use('+992901112233')`))), "forbidden");
  });

  it("is named row by row in an import, whether it is in the file twice or already on somebody", async () => {
    const taken = await phoneOf(t.users.teacherA);
    const email = (await one<{ email: string }>(db, `SELECT email FROM public.users WHERE id = $1`, [t.users.teacherA]))!.email;
    const conflicts = await asUser(db, t.users.adminA, (tx) =>
      one<{ r: Array<{ row: number; code: string }> }>(tx, `SELECT public.import_phone_conflicts($1::jsonb) AS r`, [
        JSON.stringify([
          { phone: "+992 93 000 11 22" },
          { phone: "93-000-11-22" },
          { phone: taken },
          { phone: taken, email },
          { phone: "" },
        ]),
      ])
    ).then((r) => r!.r.map((e) => `${e.row}:${e.code}`));
    assert.deepEqual(conflicts, ["2:duplicate_in_file", "3:duplicate_existing", "4:duplicate_in_file"]);
  });

  it("is refused by the database whatever writes it, but an account keeps its own", async () => {
    const taken = await phoneOf(t.users.studentA);
    assert.match(
      (await errorOf(() => db.query(`UPDATE public.users SET phone = $1 WHERE id = $2`, [taken, t.users.teacherA]))) ?? "",
      /phone_taken/
    );
    await db.query(`UPDATE public.users SET phone = $1, first_name = first_name WHERE id = $2`, [taken, t.users.studentA]);
  });
});
