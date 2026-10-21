import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

/**
 * 00096: the pupil's name in one cell, surname first, as the school keeps its
 * lists; a file of the old template still read; and one login for a pupil's
 * parents — the father's, or else the mother's — with both kept on the card.
 */

let db: Db;
let t: Tenants;

interface Outcome {
  valid: boolean;
  errors: Array<{ row: number; field: string; code: string }>;
  created: number;
  parents: Array<{ row: number; relation: string; login: string | null; password: string | null }>;
}

const register = (data: Array<Record<string, string>>, dryRun: boolean) =>
  asUser(db, t.users.adminA, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.import_people('students', $1::jsonb, $2, 0, 500) AS r`, [JSON.stringify(data), dryRun])
  ).then((r) => r!.r);

const pupil = (fields: Record<string, string>) => ({
  class_name: "7А",
  date_of_birth: "2013-04-05",
  gender: "",
  email: "",
  phone: "",
  ...fields,
});

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

describe("the pupils' register in one line", () => {
  it("reads «Насаб Ном Номи падар» from one cell, and the father's name may be two words", async () => {
    const outcome = await register(
      [
        pupil({ full_name: "Абдуллоев  Фаррух Саидович", father_name: "Абдуллоев Саид Каримович", father_phone: "+992 91 700 00 01" }),
        pupil({ full_name: "Қодирова Мавзуна Раҳим қизи", date_of_birth: "2013-06-07", mother_name: "Қодирова Гулнора Олимовна", mother_phone: "+992 91 700 00 02" }),
      ],
      false
    );
    assert.equal(outcome.valid, true, JSON.stringify(outcome.errors));
    const made = await rows<{ last_name: string; first_name: string; middle_name: string | null }>(
      db,
      `SELECT last_name, first_name, middle_name FROM public.students
       WHERE school_id = $1 AND last_name IN ('Абдуллоев', 'Қодирова') ORDER BY last_name`,
      [SCHOOL_A]
    );
    assert.deepEqual(made, [
      { last_name: "Абдуллоев", first_name: "Фаррух", middle_name: "Саидович" },
      { last_name: "Қодирова", first_name: "Мавзуна", middle_name: "Раҳим қизи" },
    ]);
  });

  it("says when the cell has only one word, or nothing", async () => {
    const outcome = await register(
      [pupil({ full_name: "Каримов" }), pupil({ full_name: "", date_of_birth: "2013-01-02" })],
      true
    );
    const named = outcome.errors.filter((e) => e.field === "full_name").map((e) => `${e.row}:${e.code}`);
    assert.deepEqual(named, ["1:full_name_parts", "2:required"]);
  });

  it("still reads a file of the old template, with the name in three columns", async () => {
    const outcome = await register(
      [pupil({ last_name: "Абдулло Зода", first_name: "Сино", middle_name: "", date_of_birth: "2013-09-09" })],
      false
    );
    assert.equal(outcome.valid, true, JSON.stringify(outcome.errors));
    const made = await rows<{ first_name: string }>(
      db,
      `SELECT first_name FROM public.students WHERE school_id = $1 AND last_name = 'Абдулло Зода'`,
      [SCHOOL_A]
    );
    assert.deepEqual(made, [{ first_name: "Сино" }]);
  });

  it("gives one login for both parents — the father's — and keeps the mother on the card", async () => {
    const outcome = await register(
      [
        pupil({
          full_name: "Назаров Бехруз Ҷамшедович",
          date_of_birth: "2013-02-03",
          father_name: "Назаров Ҷамшед Олимович",
          father_phone: "+992 91 700 00 10",
          mother_name: "Назарова Зарина Каримовна",
          mother_phone: "+992 91 700 00 11",
        }),
      ],
      false
    );
    assert.equal(outcome.valid, true, JSON.stringify(outcome.errors));
    assert.deepEqual(outcome.parents.map((p) => [p.relation, Boolean(p.login), Boolean(p.password)]), [["father", true, true]]);
    const card = await rows<{ relationship: string; has_login: boolean }>(
      db,
      `SELECT sg.relationship, g.user_id IS NOT NULL AS has_login
       FROM public.student_guardians sg
       JOIN public.guardians g ON g.id = sg.guardian_id
       JOIN public.students s ON s.id = sg.student_id
       WHERE s.school_id = $1 AND s.last_name = 'Назаров' AND s.first_name = 'Бехруз'
       ORDER BY sg.relationship`,
      [SCHOOL_A]
    );
    assert.deepEqual(card, [
      { relationship: "father", has_login: true },
      { relationship: "mother", has_login: false },
    ]);
  });

  it("gives the login to the mother when no father is written, and to the parent who already has one", async () => {
    // A younger child of the same family, written with the mother only: the
    // mother, kept without a login so far, gets one now.
    const first = await register(
      [
        pupil({
          full_name: "Назарова Мадина Ҷамшедовна",
          date_of_birth: "2015-02-03",
          class_name: "5А",
          mother_name: "Назарова Зарина Каримовна",
          mother_phone: "+992 91 700 00 11",
        }),
      ],
      false
    );
    assert.deepEqual(first.parents.map((p) => [p.relation, Boolean(p.password)]), [["mother", true]]);

    // A third child writes both again: the father still holds his login, and
    // nothing new is issued to anybody.
    const again = await register(
      [
        pupil({
          full_name: "Назаров Бехруз Ҷамшедович",
          date_of_birth: "2013-02-03",
          father_name: "Назаров Ҷамшед Олимович",
          father_phone: "+992 91 700 00 10",
          mother_name: "Назарова Зарина Каримовна",
          mother_phone: "+992 91 700 00 11",
        }),
      ],
      false
    );
    assert.deepEqual(again.parents.map((p) => [p.relation, p.password]), [["father", null]]);
  });
});
