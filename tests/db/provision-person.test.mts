import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

interface Result {
  valid: boolean;
  errors: Array<{ row: number; field: string; code: string }>;
  userId?: string;
  personId?: string;
  login?: string;
  password?: string | null;
  created?: number;
}

const provision = (actor: string, kind: string, row: Record<string, string>, roleId?: string | null) =>
  asUser(db, actor, (tx) =>
    one<{ r: Result }>(tx, `SELECT public.provision_person($1, $2::jsonb, $3) AS r`, [kind, JSON.stringify(row), roleId ?? null])
  ).then((r) => r!.r);

const roleId = (slug: string) =>
  one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = $2`, [SCHOOL_A, slug]).then((r) => r!.id);

const teacher = (over: Record<string, string> = {}) => ({
  employee_number: "41",
  last_name: "Назаров",
  first_name: "Ҷамшед",
  position: "муовини директор",
  email: "j.nazarov@maktab.tj",
  ...over,
});

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

describe("adding one member of staff", () => {
  let added: Result;

  before(async () => {
    added = await provision(t.users.adminA, "staff", {
      ...teacher(),
      position_title: "Муовини директор оид ба корҳои таълимӣ",
      qualification: "Донишгоҳи давлатии Хуҷанд",
      hire_date: "2020-09-01",
      max_weekly_hours: "18",
    }, await roleId("vice_principal"));
  });

  it("issues a login and a password to hand over", async () => {
    assert.equal(added.valid, true);
    assert.match(added.login ?? "", /^[A-Z0-9]+$/);
    assert.match(added.password ?? "", /^[23456789abcdefghijkmnpqrstuvwxyz]{10}$/);
  });

  it("gives them the post that was chosen, and only that one", async () => {
    const held = await rows<{ slug: string }>(
      db,
      `SELECT r.slug FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [added.userId]
    );
    assert.deepEqual(held, [{ slug: "vice_principal" }]);
  });

  it("carries the access that post is meant to carry", async () => {
    const access = await asUser(db, added.userId!, (tx) =>
      one<{ a: { permissions: string[] } }>(tx, `SELECT public.get_my_access() AS a`)
    );
    const permissions = access!.a.permissions;
    for (const needed of ["timetable.manage", "students.update", "students.import"]) {
      assert.ok(permissions.includes(needed), `a deputy head must be able to ${needed}`);
    }
  });

  it("keeps the parts of the post a spreadsheet has no column for", async () => {
    const staff = await one<{ position: string; hours: string; hire: string }>(
      db,
      `SELECT position, max_weekly_hours::text AS hours, hire_date::text AS hire FROM public.staff WHERE user_id = $1`,
      [added.userId]
    );
    assert.equal(staff!.position, "Муовини директор оид ба корҳои таълимӣ");
    assert.equal(staff!.hours, "18.0");
    assert.equal(staff!.hire, "2020-09-01");
  });

  it("leaves the address unproved, so they still have to read the code", async () => {
    const account = await one<{ unconfirmed: boolean }>(
      db,
      `SELECT email_confirmed_at IS NULL AS unconfirmed FROM auth.users WHERE id = $1`,
      [added.userId]
    );
    assert.equal(account!.unconfirmed, true);
  });
});

describe("the post that is offered", () => {
  it("is never the administrator's", async () => {
    const admin = await roleId("admin");
    assert.equal(
      await errorOf(() => provision(t.users.adminA, "staff", teacher({ employee_number: "42", email: "x42@maktab.tj" }), admin)),
      "invalid_role"
    );
    const offered = await asUser(db, t.users.adminA, (tx) =>
      tx.query<{ slug: string }>(`SELECT slug FROM public.grantable_roles()`)
    );
    assert.ok(!offered.rows.some((r) => r.slug === "admin"), "a list that offers what will be refused wastes people's time");
  });

  it("is never one from another school", async () => {
    const other = await one<{ id: string }>(
      db,
      `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'teacher'`,
      [t.schoolB]
    );
    assert.equal(
      await errorOf(() => provision(t.users.adminA, "staff", teacher({ employee_number: "43", email: "x43@maktab.tj" }), other!.id)),
      "invalid_role"
    );
  });

  it("is never more than the person handing it out already holds", async () => {
    // A teacher holds neither users.approve nor roles.manage, so they may not
    // hand anybody a post that carries them.
    const offered = await asUser(db, t.users.teacherA, (tx) =>
      tx.query<{ slug: string }>(`SELECT slug FROM public.grantable_roles()`)
    );
    assert.deepEqual(offered.rows, [], "someone who may not grant a role is offered none");
  });
});

describe("a sheet that is not right yet", () => {
  it("is refused with the same messages the import gives, and writes nothing", async () => {
    const before = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM public.staff WHERE school_id = $1`, [SCHOOL_A]);
    const result = await provision(t.users.adminA, "staff", teacher({ employee_number: "", email: "not-an-address" }));
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((e) => `${e.field}:${e.code}`).sort(),
      ["email:invalid_email", "employee_number:required"]
    );
    const after = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM public.staff WHERE school_id = $1`, [SCHOOL_A]);
    assert.equal(after!.n, before!.n);
  });

  it("is refused to somebody who may not add people at all", async () => {
    assert.equal(
      await errorOf(() => provision(t.users.studentA, "staff", teacher({ employee_number: "44", email: "x44@maktab.tj" }))),
      "forbidden"
    );
  });
});

describe("adding somebody the school already holds", () => {
  it("updates them and does not reissue their password", async () => {
    const again = await provision(t.users.adminA, "staff", teacher({ last_name: "Назарзода" }));
    assert.equal(again.valid, true);
    assert.equal(again.password, null, "a password already handed over is not replaced");
    const named = await rows<{ last_name: string }>(
      db,
      `SELECT last_name FROM public.staff WHERE school_id = $1 AND employee_number = '41'`,
      [SCHOOL_A]
    );
    assert.deepEqual(named, [{ last_name: "Назарзода" }]);
  });
});

describe("the director", () => {
  it("is offered, and carries the whole school with them", async () => {
    const director = await provision(
      t.users.adminA,
      "staff",
      teacher({ employee_number: "50", email: "director@maktab.tj", position: "директор" }),
      await roleId("director")
    );
    assert.equal(director.valid, true);

    const access = await asUser(db, director.userId!, (tx) =>
      one<{ a: { permissions: string[] } }>(tx, `SELECT public.get_my_access() AS a`)
    );
    const held = access!.a.permissions;
    // Every journal in the school, not only their own: grades.update is what
    // app.may_keep_journal accepts in place of teaching the class.
    for (const needed of ["grades.update", "grades.approve", "timetable.manage", "students.import", "users.update", "settings.update"]) {
      assert.ok(held.includes(needed), `a director must be able to ${needed}`);
    }
  });

  it("may write in a journal that is not theirs", async () => {
    const director = await one<{ id: string }>(
      db,
      `SELECT u.id FROM public.users u WHERE u.email = 'director@maktab.tj'`
    );
    const mine = await asUser(db, director!.id, (tx) =>
      one<{ ok: boolean }>(
        tx,
        `SELECT app.may_keep_journal(cs.id) AS ok FROM public.class_subjects cs LIMIT 1`
      )
    );
    assert.equal(mine!.ok, true);
  });
});
