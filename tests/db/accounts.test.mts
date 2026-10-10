import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;
let class3A: string;

interface Saved {
  valid: boolean;
  errors: Array<{ field: string; code: string }>;
  userId?: string;
  login?: string;
  password?: string | null;
}

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  class3A = (await one<{ id: string }>(db,
    `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, '3А', 3) RETURNING id`,
    [SCHOOL_A, a.yearA]))!.id;
});
after(async () => {
  await db.close();
});

const save = (actor: string, userId: string | null, data: Record<string, unknown>) =>
  asUser(db, actor, async (tx) => (await one<{ r: Saved }>(tx, `SELECT public.save_account($1, $2) AS r`, [userId, JSON.stringify(data)]))!.r);

const pupil = (klass: string, extra: Record<string, unknown> = {}) => ({
  kind: "student",
  last_name: "Karimov",
  first_name: "Aziz",
  date_of_birth: "2017-03-04",
  gender: "male",
  student: { class_id: klass, positions: [], ...extra },
});

describe("a pupil, added from one form", () => {
  it("will not add a young pupil without a parent", async () => {
    const result = await save(t.users.adminA, null, pupil(class3A));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "guardian_required"));
  });

  it("adds the pupil, their parent and a login, with no address of their own", async () => {
    const result = await save(t.users.adminA, null, pupil(class3A, {
      guardians: [{ last_name: "Karimova", first_name: "Madina", phone: "+992 90 123 45 67", relationship: "mother" }],
      positions: ["monitor"],
    }));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.ok(result.password && result.password.length >= 10);
    const row = await one<{ email: string; confirmed: boolean; class_name: string; guardians: number; monitor: number }>(db, `
      SELECT u.email, au.email_confirmed_at IS NOT NULL AS confirmed,
             (SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(s.id)) AS class_name,
             (SELECT count(*)::int FROM public.student_guardians sg WHERE sg.student_id = s.id) AS guardians,
             (SELECT count(*)::int FROM public.class_positions cp WHERE cp.student_id = s.id AND cp.position = 'monitor') AS monitor
      FROM public.users u JOIN auth.users au ON au.id = u.id JOIN public.students s ON s.user_id = u.id
      WHERE u.id = $1`, [result.userId]);
    assert.match(row!.email, /\.invalid$/);
    assert.equal(row!.confirmed, true);
    assert.equal(row!.class_name, "3А");
    assert.equal(row!.guardians, 1);
    assert.equal(row!.monitor, 1);
  });

  it("finds the same parent by telephone for a brother, and keeps one monitor per class", async () => {
    const result = await save(t.users.adminA, null, {
      ...pupil(class3A, { guardians: [{ last_name: "Karimova", first_name: "Madina", phone: "901234567", relationship: "mother" }], positions: ["monitor"] }),
      first_name: "Bahrom",
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const counts = await one<{ guardians: number; monitors: number }>(db, `
      SELECT (SELECT count(*)::int FROM public.guardians WHERE last_name = 'Karimova') AS guardians,
             (SELECT count(*)::int FROM public.class_positions WHERE class_id = $1 AND position = 'monitor') AS monitors`, [class3A]);
    assert.deepEqual(counts, { guardians: 1, monitors: 1 });
  });

  it("moves a pupil to another class as a transfer, taking their posts with the old class", async () => {
    const created = await save(t.users.adminA, null, { ...pupil(a.class9A), last_name: "Nazarov", email: "nazarov@example.test" });
    assert.equal(created.valid, true, JSON.stringify(created.errors));
    await save(t.users.adminA, created.userId!, { ...pupil(a.class9A, { positions: ["cleanliness"] }), last_name: "Nazarov", email: "nazarov@example.test" });
    const moved = await save(t.users.adminA, created.userId!, { ...pupil(a.class9B), last_name: "Nazarov", email: "nazarov@example.test" });
    assert.equal(moved.valid, true, JSON.stringify(moved.errors));
    const row = await one<{ active: string; transferred: number; posts: number }>(db, `
      SELECT (SELECT c.name FROM public.classes c WHERE c.id = app.student_current_class(s.id)) AS active,
             (SELECT count(*)::int FROM public.enrollments e WHERE e.student_id = s.id AND e.status = 'transferred') AS transferred,
             (SELECT count(*)::int FROM public.class_positions cp WHERE cp.student_id = s.id) AS posts
      FROM public.students s WHERE s.user_id = $1`, [created.userId]);
    assert.deepEqual(row, { active: "9B", transferred: 1, posts: 0 });
  });
});

describe("the homeroom teacher", () => {
  it("adds a pupil to their own class, and to no other", async () => {
    const own = await save(t.users.teacherA, null, { ...pupil(a.class9A), last_name: "Olimov", email: "olimov@example.test" });
    assert.equal(own.valid, true, JSON.stringify(own.errors));
    const other = await errorOf(() => save(t.users.teacherA, null, { ...pupil(a.class9B), last_name: "Rahimov", email: "rahimov@example.test" }));
    assert.match(other ?? "", /forbidden/);
  });

  it("sees their own class in the directory and nobody else", async () => {
    const directory = await asUser(db, t.users.teacherA, (tx) =>
      one<{ d: { scope: string; rows: Array<{ class_name: string; category: string }> } }>(tx, `SELECT public.account_directory('all', NULL, NULL, 100, 0) AS d`));
    assert.equal(directory!.d.scope, "homeroom");
    assert.ok(directory!.d.rows.length > 0);
    assert.ok(directory!.d.rows.every((r) => r.class_name === "9A" && r.category === "student"));
  });

  it("changes a pupil of their class but not a pupil of another, nor a teacher", async () => {
    const theirs = await asUser(db, t.users.teacherA, (tx) => one<{ ok: boolean }>(tx, `SELECT app.may_manage_account($1) AS ok`, [t.users.studentA]));
    assert.equal(theirs!.ok, true);
    const notTheirs = await asUser(db, t.users.teacherA, (tx) => one<{ ok: boolean }>(tx, `SELECT app.may_manage_account($1) AS ok`, [t.users.student2A]));
    assert.equal(notTheirs!.ok, false);
    const colleague = await asUser(db, t.users.teacherA, (tx) => one<{ ok: boolean }>(tx, `SELECT app.may_manage_account($1) AS ok`, [t.users.teacher2A]));
    assert.equal(colleague!.ok, false);
  });
});

describe("staff and administrators", () => {
  it("makes a teacher with the next free number and a homeroom class", async () => {
    const result = await save(t.users.adminA, null, {
      kind: "teacher", last_name: "Saidova", first_name: "Nigina", email: "saidova@example.test",
      staff: { position: "Омӯзгори математика", homeroom_class_id: class3A },
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const row = await one<{ number: string; homeroom: string; category: string }>(db, `
      SELECT s.employee_number AS number,
             (SELECT c.name FROM public.classes c WHERE c.homeroom_staff_id = s.id) AS homeroom,
             app.account_category(s.user_id) AS category
      FROM public.staff s WHERE s.user_id = $1`, [result.userId]);
    assert.equal(row!.homeroom, "3А");
    assert.equal(row!.category, "teacher");
    assert.match(row!.number, /^\d+$/);
  });

  it("asks a teacher for an e-mail, and a pupil's parents for nothing of the kind", async () => {
    const result = await save(t.users.adminA, null, { kind: "teacher", last_name: "X", first_name: "Y" });
    assert.ok(result.errors.some((e) => e.field === "email" && e.code === "required"));
  });

  it("lets only an administrator make an administrator", async () => {
    const byDirector = await errorOf(() => save(t.users.directorA, null, { kind: "admin", last_name: "New", first_name: "Admin", email: "newadmin@example.test" }));
    assert.match(byDirector ?? "", /forbidden/);
    const byAdmin = await save(t.users.adminA, null, { kind: "admin", last_name: "New", first_name: "Admin", email: "newadmin@example.test" });
    assert.equal(byAdmin.valid, true, JSON.stringify(byAdmin.errors));
    const category = await one<{ c: string }>(db, `SELECT app.account_category($1) AS c`, [byAdmin.userId]);
    assert.equal(category!.c, "admin");
    const directorTouchesAdmin = await asUser(db, t.users.directorA, (tx) => one<{ ok: boolean }>(tx, `SELECT app.may_manage_account($1) AS ok`, [byAdmin.userId]));
    assert.equal(directorTouchesAdmin!.ok, false);
  });

  it("will not turn a pupil into a teacher", async () => {
    const result = await save(t.users.adminA, t.users.studentA, { kind: "teacher", last_name: "A", first_name: "Student", email: "x1@example.test" });
    assert.ok(result.errors.some((e) => e.code === "kind_locked"));
  });
});

describe("passwords and the second step", () => {
  it("issues a new password to somebody the caller manages, and never to themselves", async () => {
    const fresh = await asUser(db, t.users.teacherA, (tx) => one<{ r: { login: string; password: string } }>(tx, `SELECT public.reset_account_password($1) AS r`, [t.users.studentA]));
    assert.ok(fresh!.r.password.length >= 10);
    const self = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.reset_account_password($1)`, [t.users.adminA])));
    assert.match(self ?? "", /forbidden/);
  });

  it("switches off a lost second step for an administrator of accounts only", async () => {
    await db.query(`INSERT INTO auth.mfa_factors (user_id, factor_type, status) VALUES ($1, 'totp', 'verified')`, [t.users.studentA]);
    const byTeacher = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.reset_account_mfa($1)`, [t.users.studentA])));
    assert.match(byTeacher ?? "", /forbidden/);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.reset_account_mfa($1)`, [t.users.studentA]));
    const left = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM auth.mfa_factors WHERE user_id = $1`, [t.users.studentA]);
    assert.equal(left!.n, 0);
  });
});

describe("the directory", () => {
  it("counts each kind and filters by it", async () => {
    const all = await asUser(db, t.users.adminA, (tx) =>
      one<{ d: { counts: Record<string, number>; total: number } }>(tx, `SELECT public.account_directory('all') AS d`));
    assert.ok((all!.d.counts.student ?? 0) >= 3);
    assert.ok((all!.d.counts.admin ?? 0) >= 1);
    const teachers = await asUser(db, t.users.adminA, (tx) =>
      one<{ d: { rows: Array<{ category: string }> } }>(tx, `SELECT public.account_directory('teachers') AS d`));
    assert.ok(teachers!.d.rows.length > 0 && teachers!.d.rows.every((r) => r.category === "teacher"));
  });

  it("answers nobody without the right, and a pupil least of all", async () => {
    const pupilAsks = await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.account_directory('all')`)));
    assert.match(pupilAsks ?? "", /forbidden/);
  });
});

describe("the register workbook", () => {
  const importRows = (rows: unknown[], dryRun: boolean) =>
    asUser(db, t.users.adminA, async (tx) =>
      (await one<{ r: { valid: boolean; errors: Array<{ field: string; code: string }>; credentials: Array<{ login: string }> } }>(tx,
        `SELECT public.import_people('students', $1, $2, 0, 300) AS r`, [JSON.stringify(rows), dryRun]))!.r);

  it("imports a first-grader with no address and links the parent written beside them", async () => {
    const rows = [{
      class_name: "1А", last_name: "Nazarov", first_name: "Firdavs", date_of_birth: "2019-09-01", email: "",
      guardian_name: "Nazarova Shahlo", guardian_phone: "+992 93 555 44 33", guardian_relationship: "модар",
    }];
    const preview = await importRows(rows, true);
    assert.equal(preview.valid, true, JSON.stringify(preview.errors));
    const done = await importRows(rows, false);
    const login = done.credentials[0]!.login;
    const linked = await asUser(db, t.users.adminA, (tx) =>
      one<{ n: number }>(tx, `SELECT public.import_guardians($1) AS n`, [JSON.stringify([{ ...rows[0], login }])]));
    assert.equal(linked!.n, 1);
    const row = await one<{ email: string; confirmed: boolean; relationship: string }>(db, `
      SELECT u.email, au.email_confirmed_at IS NOT NULL AS confirmed, sg.relationship
      FROM public.users u JOIN auth.users au ON au.id = u.id
      JOIN public.students s ON s.user_id = u.id
      JOIN public.student_guardians sg ON sg.student_id = s.id
      WHERE u.public_id = $1`, [login]);
    assert.match(row!.email, /\.invalid$/);
    assert.equal(row!.confirmed, true);
    assert.equal(row!.relationship, "mother");
  });

  it("still asks an older pupil for an address", async () => {
    const preview = await importRows([{ class_name: "7А", last_name: "Older", first_name: "Pupil", date_of_birth: "2013-01-01", email: "" }], true);
    assert.equal(preview.valid, false);
    assert.ok(preview.errors.some((e) => e.field === "email" && e.code === "required"));
  });
});
