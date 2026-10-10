import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, SCHOOL_A, type Tenants, allowSelfRegistrationInTests } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  await allowSelfRegistrationInTests(db);
});
after(async () => {
  await db.close();
});

async function authUser(verified = true): Promise<string> {
  const id = newId();
  await db.query(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, ${verified ? "now()" : "NULL"})`, [
    id,
    `reg.${id.slice(-8)}@example.test`,
  ]);
  return id;
}

// A telephone number belongs to one account in a school (00077), so each
// registration brings its own.
let phoneSerial = 0;
const submit = (uid: string, args: { slug?: string; role?: string | null; classId?: string | null; code?: string | null }) =>
  asUser(db, uid, (tx) =>
    one<{ r: { status: string; request_id: string } }>(
      tx,
      `SELECT public.submit_registration($1, 'First', 'Last', NULL, $2, $3, $5::jsonb, $4) AS r`,
      [
        args.slug ?? "mtmu-7",
        args.role ?? null,
        args.classId ?? null,
        args.code ?? null,
        JSON.stringify({ phone: `+9929000${String(++phoneSerial).padStart(5, "0")}`, evil: "x" }),
      ]
    )
  );

describe("registration options", () => {
  it("offers only self-service roles and current classes to anonymous visitors", async () => {
    const options = await asAnon(db, (tx) =>
      one<{ o: { roles: Array<{ slug: string }>; classes: Array<{ name: string }> } }>(tx, `SELECT public.get_registration_options('mtmu-7') AS o`)
    );
    assert.deepEqual(options!.o.roles.map((r) => r.slug).sort(), ["parent", "student", "teacher"]);
    assert.ok(options!.o.classes.some((c) => c.name === "9A"));
    const unknown = await asAnon(db, (tx) => one<{ o: unknown }>(tx, `SELECT public.get_registration_options('nope') AS o`));
    assert.equal(unknown!.o, null);
  });
});

describe("self-registration", () => {
  it("creates a pending account without any access and strips unknown details", async () => {
    const uid = await authUser();
    const result = await submit(uid, { role: "student", classId: a.class9A });
    assert.equal(result!.r.status, "pending");
    const user = await one<{ status: string; is_active: boolean; public_id: string }>(db, `SELECT status, is_active, public_id FROM public.users WHERE id = $1`, [uid]);
    assert.equal(user!.status, "pending");
    assert.equal(user!.is_active, false);
    const request = await one<{ additional_data: Record<string, string> }>(db, `SELECT additional_data FROM public.registration_requests WHERE auth_user_id = $1`, [uid]);
    assert.deepEqual(Object.keys(request!.additional_data), ["phone"]);
    const access = await asUser(db, uid, (tx) => one<{ a: { permissions: string[] } }>(tx, `SELECT public.get_my_access() AS a`));
    assert.deepEqual(access!.a.permissions, []);
  });

  it("rejects administrator roles, roles not open for self-service and unverified email", async () => {
    assert.match((await errorOf(async () => submit(await authUser(), { role: "admin" }))) ?? "", /invalid_role/);
    assert.match((await errorOf(async () => submit(await authUser(), { role: "director" }))) ?? "", /invalid_role/);
    assert.match((await errorOf(async () => submit(await authUser(false), { role: "student" }))) ?? "", /email_not_verified/);
  });

  it("refuses duplicate registration and classes from another school", async () => {
    const uid = await authUser();
    await submit(uid, { role: "parent" });
    assert.match((await errorOf(() => submit(uid, { role: "parent" }))) ?? "", /already_registered/);
    assert.match((await errorOf(async () => submit(await authUser(), { role: "student", classId: a.classB }))) ?? "", /invalid_class/);
  });

  it("honours a school's closed registration setting", async () => {
    await db.query(`UPDATE public.schools SET settings = settings || '{"registration_open": false}' WHERE id = $1`, [t.schoolB]);
    assert.match((await errorOf(async () => submit(await authUser(), { slug: "school-b", role: "student" }))) ?? "", /registration_closed/);
    await db.query(`UPDATE public.schools SET settings = settings - 'registration_open' WHERE id = $1`, [t.schoolB]);
  });
});

describe("invitation codes", () => {
  const createCode = (userId: string, school: string, roleSlug: string, extra: Record<string, unknown> = {}) =>
    asUser(db, userId, (tx) =>
      one<{ code: string }>(
        tx,
        `INSERT INTO public.invitation_codes (school_id, role_id, code, max_uses, created_by, person_type, person_id, expires_at)
         SELECT $1, r.id, $2, 1, $3, $4, $5, $6 FROM public.roles r WHERE r.school_id = $1 AND r.slug = $7
         RETURNING code`,
        [school, `INV${newId().slice(-6).toUpperCase()}`, userId, extra.person_type ?? null, extra.person_id ?? null, extra.expires_at ?? null, roleSlug]
      )
    );

  it("activates a teacher immediately, creates the staff record and consumes the code", async () => {
    const code = await createCode(t.users.adminA, SCHOOL_A, "teacher");
    const uid = await authUser();
    const result = await submit(uid, { code: code!.code });
    assert.equal(result!.r.status, "active");
    const staff = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.staff WHERE user_id = $1`, [uid]);
    assert.equal(staff!.n, 1);
    const access = await asUser(db, uid, (tx) => one<{ a: { permissions: string[] } }>(tx, `SELECT public.get_my_access() AS a`));
    assert.ok(access!.a.permissions.includes("grades.enter"));
    assert.match((await errorOf(async () => submit(await authUser(), { code: code!.code }))) ?? "", /invalid_invitation/);
  });

  it("links a personal code to the existing student record", async () => {
    const code = await createCode(t.users.adminA, SCHOOL_A, "student", { person_type: "student", person_id: a.students.unlinkedA });
    const uid = await authUser();
    await submit(uid, { code: code!.code });
    const linked = await one<{ user_id: string }>(db, `SELECT user_id FROM public.students WHERE id = $1`, [a.students.unlinkedA]);
    assert.equal(linked!.user_id, uid);
  });

  it("rejects expired codes and codes from another school", async () => {
    const expired = await createCode(t.users.adminA, SCHOOL_A, "teacher", { expires_at: new Date(Date.now() - 1000).toISOString() });
    assert.match((await errorOf(async () => submit(await authUser(), { code: expired!.code }))) ?? "", /invalid_invitation/);
    const other = await createCode(t.users.adminB, t.schoolB, "teacher");
    assert.match((await errorOf(async () => submit(await authUser(), { code: other!.code, slug: "mtmu-7" }))) ?? "", /invalid_invitation/);
  });

  it("does not let invitation managers issue administrator codes", async () => {
    const error = await errorOf(() => createCode(t.users.adminA, SCHOOL_A, "admin"));
    assert.match(error ?? "", /admin-level/);
  });
});

describe("approval queue", () => {
  it("approves a student into a class with a people record and enrollment", async () => {
    const uid = await authUser();
    const { r } = (await submit(uid, { role: "student", classId: a.class9B }))!;
    const teacher = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [r.request_id])));
    assert.match(teacher ?? "", /forbidden/);
    const otherSchool = await errorOf(() => asUser(db, t.users.adminB, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [r.request_id])));
    assert.match(otherSchool ?? "", /forbidden/);

    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [r.request_id]));
    const enrollment = await one<{ class_id: string }>(db,
      `SELECT e.class_id FROM public.enrollments e JOIN public.students s ON s.id = e.student_id WHERE s.user_id = $1 AND e.status = 'active'`, [uid]);
    assert.equal(enrollment!.class_id, a.class9B);
    const again = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [r.request_id])));
    assert.match(again ?? "", /already_reviewed/);
  });

  it("lets a director approve teachers and requires a reason to reject", async () => {
    const teacherUid = await authUser();
    const teacherReq = (await submit(teacherUid, { role: "teacher" }))!.r;
    await asUser(db, t.users.directorA, (tx) => tx.query(`SELECT public.review_registration($1, true)`, [teacherReq.request_id]));
    const status = await one<{ status: string }>(db, `SELECT status FROM public.users WHERE id = $1`, [teacherUid]);
    assert.equal(status!.status, "active");

    const parentUid = await authUser();
    const parentReq = (await submit(parentUid, { role: "parent" }))!.r;
    const noReason = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, false)`, [parentReq.request_id])));
    assert.match(noReason ?? "", /reason_required/);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, false, NULL, NULL, 'Unknown applicant')`, [parentReq.request_id]));
    const rejected = await one<{ status: string }>(db, `SELECT status FROM public.users WHERE id = $1`, [parentUid]);
    assert.equal(rejected!.status, "rejected");
  });

  it("never approves directly into the administrator role", async () => {
    const uid = await authUser();
    const req = (await submit(uid, { role: "teacher" }))!.r;
    const adminRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'admin'`, [SCHOOL_A]);
    const error = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.review_registration($1, true, $2)`, [req.request_id, adminRole!.id])));
    assert.match(error ?? "", /role_not_allowed/);
  });
});

describe("student lifecycle", () => {
  it("transfers a student between classes keeping history", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.transfer_student_class($1, $2, 'parent request')`, [a.students.student2A, a.class9A]));
    const history = await rows<{ class_id: string; status: string }>(db,
      `SELECT class_id, status FROM public.enrollments WHERE student_id = $1 ORDER BY created_at`, [a.students.student2A]);
    assert.deepEqual(history.map((h) => h.status), ["transferred", "active"]);
    assert.equal(history[1]!.class_id, a.class9A);
    const forbidden = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.transfer_student_class($1, $2)`, [a.students.student2A, a.class9B])));
    assert.match(forbidden ?? "", /forbidden/);
  });

  it("graduates a student and their account", async () => {
    await asUser(db, t.users.directorA, (tx) => tx.query(`SELECT public.change_student_status($1, 'graduated')`, [[a.students.student2A]]));
    const student = await one<{ status: string }>(db, `SELECT status FROM public.students WHERE id = $1`, [a.students.student2A]);
    const user = await one<{ status: string }>(db, `SELECT status FROM public.users WHERE id = $1`, [t.users.student2A]);
    const active = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.enrollments WHERE student_id = $1 AND status = 'active'`, [a.students.student2A]);
    assert.equal(student!.status, "graduated");
    assert.equal(user!.status, "graduated");
    assert.equal(active!.n, 0);
  });
});

describe("validated import", () => {
  const rowsInput = [
    { first_name: "Ali", last_name: "Karimov", date_of_birth: "2012-03-04", class_name: "9a", student_number: "IMP-1" },
    { first_name: "Madina", last_name: "Rahimova", gender: "female", class_name: "9A", student_number: "IMP-2" },
  ];

  it("reports row errors in preview without writing anything", async () => {
    const bad = [
      { first_name: "", last_name: "X" },
      { first_name: "A", last_name: "B", date_of_birth: "04.03.2012", class_name: "12Z", student_number: "S-001" },
      { first_name: "C", last_name: "D", student_number: "DUP" },
      { first_name: "E", last_name: "F", student_number: "DUP", gender: "other" },
    ];
    const result = await asUser(db, t.users.adminA, (tx) =>
      one<{ r: { valid: boolean; errors: Array<{ row: number; code: string }> } }>(tx, `SELECT public.import_students($1::jsonb, true) AS r`, [JSON.stringify(bad)]));
    const codes = result!.r.errors.map((e) => `${e.row}:${e.code}`).sort();
    assert.equal(result!.r.valid, false);
    assert.deepEqual(codes, ["1:required", "2:duplicate_existing", "2:invalid_date", "2:unknown_class", "4:duplicate_in_file", "4:invalid_enum"]);
    const written = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.students WHERE school_id = '${SCHOOL_A}' AND first_name IN ('A', 'C', 'E')`);
    assert.equal(written!.n, 0);
  });

  it("imports valid rows with enrollment and audit, only for authorized staff", async () => {
    const forbidden = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.import_students($1::jsonb, false)`, [JSON.stringify(rowsInput)])));
    assert.match(forbidden ?? "", /forbidden/);
    const result = await asUser(db, t.users.adminA, (tx) =>
      one<{ r: { created: number } }>(tx, `SELECT public.import_students($1::jsonb, false) AS r`, [JSON.stringify(rowsInput)]));
    assert.equal(result!.r.created, 2);
    const enrolled = await one<{ n: number }>(db,
      `SELECT count(*)::int AS n FROM public.enrollments e JOIN public.students s ON s.id = e.student_id
       WHERE s.student_number IN ('IMP-1', 'IMP-2') AND e.class_id = $1`, [a.class9A]);
    assert.equal(enrolled!.n, 2);
    const audit = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'import' AND entity_type = 'students'`);
    assert.equal(audit!.n, 1);
  });
});
