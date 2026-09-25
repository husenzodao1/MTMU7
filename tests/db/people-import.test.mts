import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;

interface Outcome {
  valid: boolean;
  total: number;
  errors: Array<{ row: number; field: string; code: string }>;
  created: number;
  updated: number;
  credentials: Array<{ row: number; login: string; password: string }>;
  newClasses: string[];
}

type Row = Record<string, string>;

const importAs = (actor: string, kind: string, sheet: Row[], dryRun = false) =>
  asUser(db, actor, (tx) =>
    one<{ r: Outcome }>(tx, `SELECT public.import_people($1, $2::jsonb, $3) AS r`, [kind, JSON.stringify(sheet), dryRun])
  ).then((r) => r!.r);

const run = (sheet: Row[], dryRun = false) => importAs(t.users.adminA, "students", sheet, dryRun);
const runStaff = (sheet: Row[], dryRun = false) => importAs(t.users.adminA, "staff", sheet, dryRun);

const pupil = (over: Partial<Row> = {}): Row => ({
  class_name: "5А",
  last_name: "Каримов",
  first_name: "Алӣ",
  date_of_birth: "2015-03-04",
  email: "ali.karimov@maktab.tj",
  phone: "+992900000001",
  login: "",
  ...over,
});

const problems = (outcome: Outcome) => outcome.errors.map((e) => `${e.row}:${e.field}:${e.code}`).sort();

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  // Brings the current academic year the importer enrols pupils into.
  await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

describe("who may hand the school its register", () => {
  it("nobody without the permission to import it", async () => {
    assert.equal(await errorOf(() => importAs(t.users.teacherA, "students", [pupil()])), "forbidden");
    assert.equal(await errorOf(() => importAs(t.users.studentA, "staff", [pupil()])), "forbidden");
  });
});

describe("a sheet that is not right yet", () => {
  it("reports every problem at once and writes nothing", async () => {
    const before = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM public.students`);
    const outcome = await run(
      [
        pupil({ last_name: "", email: "not-an-address" }),
        pupil({ class_name: "", date_of_birth: "04.03.2015" }),
        pupil({ email: "ali.karimov@maktab.tj" }),
        pupil({ first_name: "Салим", email: "ali.karimov@maktab.tj" }),
      ],
      true
    );
    assert.equal(outcome.valid, false);
    assert.deepEqual(problems(outcome), [
      "1:email:invalid_email",
      "1:last_name:required",
      "2:class_name:required",
      "2:date_of_birth:invalid_date",
      "3:email:duplicate_in_file",
      "4:email:duplicate_in_file",
    ]);
    const after = await one<{ n: string }>(db, `SELECT count(*)::text AS n FROM public.students`);
    assert.equal(after!.n, before!.n, "a preview writes nothing");
  });

  it("says which classes it is about to bring into being", async () => {
    const outcome = await run([pupil({ class_name: "5А" }), pupil({ class_name: "5Б", email: "b@maktab.tj" })], true);
    assert.deepEqual(outcome.newClasses, ["5А", "5Б"], "a typo in a class name shows up here, before anything exists");
  });

  it("refuses a login nobody holds, rather than inventing a second pupil", async () => {
    const outcome = await run([pupil({ login: "MT99999" })], true);
    assert.deepEqual(problems(outcome), ["1:login:unknown_login"]);
  });
});

describe("the first import", () => {
  let first: Outcome;

  before(async () => {
    first = await run([
      pupil(),
      pupil({ first_name: "Салим", last_name: "Раҳимов", email: "salim@maktab.tj", date_of_birth: "2015-07-19" }),
      pupil({ class_name: "5Б", first_name: "Нилуфар", last_name: "Саидова", email: "nilufar@maktab.tj", date_of_birth: "2015-01-30" }),
    ]);
  });

  it("creates the classes the sheet mentions", async () => {
    assert.deepEqual(first.newClasses.sort(), ["5А", "5Б"]);
    const classes = await rows<{ name: string; grade_level: number }>(
      db,
      `SELECT name, grade_level FROM public.classes WHERE school_id = $1 AND name IN ('5А', '5Б') ORDER BY name`,
      [t.schoolA]
    );
    assert.deepEqual(classes.map((c) => c.grade_level), [5, 5], "the number in the name is the year group");
  });

  it("issues a login and a password for every new person", async () => {
    assert.equal(first.created, 3);
    assert.equal(first.credentials.length, 3);
    for (const credential of first.credentials) {
      assert.match(credential.login, /^[A-Z0-9]+$/);
      assert.match(credential.password, /^[23456789abcdefghijkmnpqrstuvwxyz]{10}$/);
    }
  });

  it("never writes the password down", async () => {
    const password = first.credentials[0]!.password;
    const leaked = await rows(
      db,
      `SELECT 1 FROM public.users WHERE $1 IN (email, first_name, last_name, coalesce(phone, ''))
       UNION ALL SELECT 1 FROM public.audit_logs WHERE metadata::text LIKE '%' || $1 || '%'`,
      [password]
    );
    assert.deepEqual(leaked, [], "it exists in the workbook the office downloads, and nowhere else");
  });

  it("enrols each pupil in the class the sheet put them in", async () => {
    const enrolled = await rows<{ name: string; cls: string }>(
      db,
      `SELECT st.first_name AS name, c.name AS cls
       FROM public.students st
       JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active'
       JOIN public.classes c ON c.id = e.class_id
       WHERE st.school_id = $1 AND c.name IN ('5А', '5Б') ORDER BY st.first_name`,
      [t.schoolA]
    );
    assert.deepEqual(enrolled, [
      { name: "Алӣ", cls: "5А" },
      { name: "Нилуфар", cls: "5Б" },
      { name: "Салим", cls: "5А" },
    ]);
  });

  it("gives them the role that lets the portal open", async () => {
    const roles = await rows<{ slug: string }>(
      db,
      `SELECT DISTINCT r.slug FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       JOIN public.users u ON u.id = ur.user_id
       WHERE u.email = 'ali.karimov@maktab.tj'`
    );
    assert.deepEqual(roles, [{ slug: "student" }]);
  });

  it("leaves the address unproved, so the code still has to arrive", async () => {
    const account = await one<{ unconfirmed: boolean }>(
      db,
      `SELECT au.email_confirmed_at IS NULL AS unconfirmed FROM auth.users au WHERE au.email = 'ali.karimov@maktab.tj'`
    );
    assert.equal(account!.unconfirmed, true);
  });
});

describe("importing the same workbook again", () => {
  it("updates what changed and issues nobody a new password", async () => {
    const login = await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE email = 'ali.karimov@maktab.tj'`);
    const before = await one<{ hash: string }>(
      db,
      `SELECT encrypted_password AS hash FROM auth.users WHERE email = 'ali.karimov@maktab.tj'`
    );

    const outcome = await run([pupil({ login: login!.public_id, phone: "+992900000099" })]);
    assert.equal(outcome.created, 0, "nobody new");
    assert.equal(outcome.updated, 1);
    assert.deepEqual(outcome.credentials, [], "a password already handed out is not replaced");

    const after = await one<{ hash: string; phone: string }>(
      db,
      `SELECT au.encrypted_password AS hash, u.phone FROM auth.users au JOIN public.users u ON u.id = au.id
       WHERE au.email = 'ali.karimov@maktab.tj'`
    );
    assert.equal(after!.hash, before!.hash, "correcting a telephone number must not lock a pupil out");
    assert.equal(after!.phone, "+992900000099");
  });

  it("recognises a pupil by class, name and birthday when the login column is blank", async () => {
    const outcome = await run([pupil({ phone: "+992900000077" })]);
    assert.equal(outcome.created, 0);
    assert.equal(outcome.updated, 1);
    const count = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.students WHERE school_id = $1 AND first_name = 'Алӣ'`,
      [t.schoolA]
    );
    assert.equal(count!.n, "1", "one pupil, not two");
  });

  it("enrols a new pupil from the start of the year, not the day the sheet was read", async () => {
    // A school hands the portal over mid-term and types in the marks it already
    // has on paper. Enrolling everybody on the day of the import would have the
    // register refuse every one of them.
    const enrolled = await one<{ on: string; year: string }>(
      db,
      `SELECT e.enrolled_on::text AS on, y.start_date::text AS year
       FROM public.enrollments e
       JOIN public.academic_years y ON y.id = e.academic_year_id
       JOIN public.students st ON st.id = e.student_id
       JOIN public.users u ON u.id = st.user_id
       WHERE u.email = 'ali.karimov@maktab.tj' AND e.status = 'active'`
    );
    assert.equal(enrolled!.on, enrolled!.year);
  });

  it("moves a pupil to a new class and keeps where they came from", async () => {
    const login = await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE email = 'ali.karimov@maktab.tj'`);
    await run([pupil({ login: login!.public_id, class_name: "5Б" })]);
    const history = await rows<{ cls: string; status: string }>(
      db,
      `SELECT c.name AS cls, e.status FROM public.enrollments e
       JOIN public.classes c ON c.id = e.class_id
       JOIN public.students st ON st.id = e.student_id
       JOIN public.users u ON u.id = st.user_id
       WHERE u.email = 'ali.karimov@maktab.tj' ORDER BY e.status`
    );
    assert.deepEqual(history, [
      { cls: "5Б", status: "active" },
      { cls: "5А", status: "transferred" },
    ]);

    // A transfer is a date in the record. The new class starts the day they
    // moved, not back at September, or the old class's marks would still be
    // acceptable in the new one.
    const moved = await one<{ on: string; today: string }>(
      db,
      `SELECT e.enrolled_on::text AS on, current_date::text AS today
       FROM public.enrollments e
       JOIN public.students st ON st.id = e.student_id
       JOIN public.users u ON u.id = st.user_id
       WHERE u.email = 'ali.karimov@maktab.tj' AND e.status = 'active'`
    );
    assert.equal(moved!.on, moved!.today);
  });

  it("makes a changed address prove itself again", async () => {
    const login = await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE email = 'ali.karimov@maktab.tj'`);
    await db.query(`UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'ali.karimov@maktab.tj'`);
    await run([pupil({ login: login!.public_id, class_name: "5Б", email: "ali.new@maktab.tj" })]);
    const account = await one<{ unconfirmed: boolean }>(
      db,
      `SELECT email_confirmed_at IS NULL AS unconfirmed FROM auth.users WHERE email = 'ali.new@maktab.tj'`
    );
    assert.equal(account!.unconfirmed, true);
  });
});

describe("the teachers' sheet", () => {
  const teacher = (over: Partial<Row> = {}): Row => ({
    employee_number: "14",
    last_name: "Ҳусейнов",
    first_name: "Фаррух",
    position: "омӯзгор",
    email: "farrukh@maktab.tj",
    homeroom_class: "",
    login: "",
    ...over,
  });

  it("insists on the number the timetable will call them by", async () => {
    const outcome = await runStaff(
      [teacher({ employee_number: "" }), teacher({ employee_number: "не рақам!", email: "second@maktab.tj" })],
      true
    );
    assert.deepEqual(problems(outcome), ["1:employee_number:required", "2:employee_number:invalid_number"]);
  });

  it("refuses a post the school does not have", async () => {
    const outcome = await runStaff([teacher({ position: "космонавт" })], true);
    assert.deepEqual(problems(outcome), ["1:position:invalid_enum"]);
  });

  it("creates the teacher, their account and their number", async () => {
    const outcome = await runStaff([teacher(), teacher({ employee_number: "19", last_name: "Раҷабова", first_name: "Зарина", email: "zarina@maktab.tj", position: "муовини директор", homeroom_class: "5А" })]);
    assert.equal(outcome.created, 2);
    const staff = await rows<{ employee_number: string; staff_type: string }>(
      db,
      `SELECT employee_number, staff_type FROM public.staff WHERE school_id = $1 AND employee_number IN ('14', '19') ORDER BY employee_number`,
      [t.schoolA]
    );
    assert.deepEqual(staff, [
      { employee_number: "14", staff_type: "teacher" },
      { employee_number: "19", staff_type: "vice_principal" },
    ]);
  });

  it("puts the class teacher in charge of their class", async () => {
    const homeroom = await one<{ number: string }>(
      db,
      `SELECT s.employee_number AS number FROM public.classes c
       JOIN public.staff s ON s.id = c.homeroom_staff_id
       WHERE c.school_id = $1 AND c.name = '5А'`,
      [t.schoolA]
    );
    assert.equal(homeroom!.number, "19");
  });

  it("knows the same teacher by their number on the next import", async () => {
    const outcome = await runStaff([teacher({ last_name: "Ҳусейнзода" })]);
    assert.equal(outcome.created, 0);
    assert.equal(outcome.updated, 1);
    const named = await rows<{ last_name: string }>(
      db,
      `SELECT last_name FROM public.staff WHERE school_id = $1 AND employee_number = '14'`,
      [t.schoolA]
    );
    assert.deepEqual(named, [{ last_name: "Ҳусейнзода" }]);
  });

  it("will not let one number stand for two people in the same file", async () => {
    const outcome = await runStaff([teacher(), teacher({ email: "other@maktab.tj" })], true);
    assert.deepEqual(problems(outcome), ["2:employee_number:duplicate_in_file"]);
  });
});
