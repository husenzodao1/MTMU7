import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, SCHOOL_A, type Tenants, allowSelfRegistrationInTests } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  // Classes and subjects come from the academic fixtures, not the base tenants.
  await seedAcademic(db, t);
  await allowSelfRegistrationInTests(db);
});
after(async () => {
  await db.close();
});

/** A staff record the deputy head prepared before the person had an account. */
const prepareStaff = (employeeNumber: string, lastName: string) =>
  asUser(db, t.users.adminA, (tx) =>
    one<{ id: string }>(
      tx,
      `INSERT INTO public.staff (school_id, employee_number, first_name, last_name, staff_type)
       VALUES ($1, $2, 'Nomalum', $3, 'teacher') RETURNING id`,
      [SCHOOL_A, employeeNumber, lastName]
    )
  ).then((r) => r!.id);

async function authUser(): Promise<string> {
  const id = newId();
  await db.query(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())`, [
    id,
    `teacher.${id.slice(-8)}@example.test`,
  ]);
  return id;
}

const register = (uid: string, employeeNumber: string | null) =>
  asUser(db, uid, (tx) =>
    one<{ r: { request_id: string } }>(
      tx,
      `SELECT public.submit_registration('mtmu-7', 'Nav', 'Muallim', NULL, 'teacher', NULL, $1::jsonb, NULL) AS r`,
      [JSON.stringify(employeeNumber === null ? {} : { employee_number: employeeNumber })]
    )
  ).then((r) => r!.r.request_id);

const approve = (requestId: string) =>
  asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [requestId]));

const staffOf = (userId: string) =>
  one<{ id: string; employee_number: string | null }>(
    db,
    `SELECT id, employee_number FROM public.staff WHERE user_id = $1`,
    [userId]
  );

describe("claiming a staff number", () => {
  it("attaches the person to the record that already holds their work", async () => {
    const prepared = await prepareStaff("19", "Rahimov");
    const uid = await authUser();
    const request = await register(uid, "19");

    // Nothing is attached while the request is still waiting.
    assert.equal(await staffOf(uid), undefined, "approval, not registration, is what attaches the record");

    await approve(request);
    const linked = await staffOf(uid);
    assert.equal(linked?.id, prepared, "the prepared record is the one they now hold");
    assert.equal(linked?.employee_number, "19");

    // And no second record was created alongside it.
    const all = await rows(db, `SELECT id FROM public.staff WHERE user_id = $1`, [uid]);
    assert.equal(all.length, 1);
  });

  it("does not hand over a number somebody already holds", async () => {
    const taken = await staffOf((await rows<{ user_id: string }>(db, `SELECT user_id FROM public.staff WHERE employee_number = '19'`))[0]!.user_id);
    const uid = await authUser();
    const request = await register(uid, "19");
    await approve(request);

    const theirs = await staffOf(uid);
    assert.ok(theirs, "they still get a staff record of their own");
    assert.notEqual(theirs!.id, taken!.id, "but not the one that is already held");
    assert.equal(theirs!.employee_number, null, "and not the number either, which is taken");
  });

  it("keeps an unknown number for the record it creates", async () => {
    const uid = await authUser();
    const request = await register(uid, "77");
    await approve(request);

    const theirs = await staffOf(uid);
    assert.equal(theirs?.employee_number, "77", "the timetable that names 77 will find them");
  });

  it("leaves the number empty when none was given", async () => {
    const uid = await authUser();
    const request = await register(uid, null);
    await approve(request);

    const theirs = await staffOf(uid);
    assert.ok(theirs, "a teacher still gets a staff record");
    assert.equal(theirs!.employee_number, null);
  });
});

describe("what a claimed record brings with it", () => {
  it("carries the classes the deputy head assigned to that number", async () => {
    const prepared = await prepareStaff("31", "Qosimov");

    // The deputy head gives number 31 a subject in a class, before anyone holds it.
    const klass = await one<{ id: string }>(db, `SELECT id FROM public.classes WHERE school_id = $1 LIMIT 1`, [SCHOOL_A]);
    const subject = await one<{ id: string }>(db, `SELECT id FROM public.subjects WHERE school_id = $1 LIMIT 1`, [SCHOOL_A]);
    assert.ok(klass && subject, "the seed should provide a class and a subject");
    await asUser(db, t.users.adminA, (tx) =>
      tx.query(
        `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (class_id, subject_id, group_label) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
        [SCHOOL_A, klass!.id, subject!.id, prepared]
      )
    );

    const uid = await authUser();
    await approve(await register(uid, "31"));

    const mine = await rows<{ id: string }>(
      db,
      `SELECT cs.id FROM public.class_subjects cs JOIN public.staff s ON s.id = cs.teacher_id WHERE s.user_id = $1`,
      [uid]
    );
    assert.equal(mine.length, 1, "the work assigned to number 31 is now theirs to grade");
  });
});
