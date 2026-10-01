import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

/**
 * The ~70-school scenario of the specification (§13, §82). PGlite runs in this
 * process, so the timings below are not production numbers; what this proves is
 * that tenant isolation and the hot administrative queries stay correct and
 * index-backed when every table holds rows from 70 tenants at once.
 */
const SCHOOLS = 70;
const STUDENTS_PER_SCHOOL = 30;

let db: Db;
let t: Tenants;
const schoolIds: string[] = [];
let firstAdmin = "";

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);

  for (let i = 0; i < SCHOOLS; i += 1) {
    const schoolId = newId();
    schoolIds.push(schoolId);
    // Inserting a school provisions its roles and modules (trigger, 00022).
    await db.query(
      `INSERT INTO public.schools (id, short_name, full_name, slug, id_prefix, district_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [schoolId, `School ${i}`, `School number ${i}`, `school-${i}`, `S${String(i).padStart(2, "0")}`, t.districtId]
    );
    const year = await one<{ id: string }>(db,
      `INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
       VALUES ($1, '2026/2027', current_date - 60, current_date + 240, true) RETURNING id`, [schoolId]);
    const klass = await one<{ id: string }>(db,
      `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, '9A', 9) RETURNING id`,
      [schoolId, year!.id]);
    await db.query(
      `INSERT INTO public.students (school_id, first_name, last_name, student_number)
       SELECT $1, 'Student', 'Number ' || g, 'S-' || g FROM generate_series(1, $2) g`,
      [schoolId, STUDENTS_PER_SCHOOL]
    );
    await db.query(
      `INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
       SELECT $1, s.id, $2, $3, current_date - 30 FROM public.students s WHERE s.school_id = $1`,
      [schoolId, klass!.id, year!.id]
    );

    const adminId = newId();
    const email = `admin${i}@example.test`;
    await db.query(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())`, [adminId, email]);
    await db.query(
      `INSERT INTO public.users (id, school_id, email, first_name, last_name, status, is_active)
       VALUES ($1, $2, $3, 'Admin', $4, 'active', true)`, [adminId, schoolId, email, `Of ${i}`]);
    await db.query(
      `INSERT INTO public.user_roles (user_id, role_id, school_id)
       SELECT $1, r.id, r.school_id FROM public.roles r WHERE r.school_id = $2 AND r.slug = 'admin'`,
      [adminId, schoolId]
    );
    if (i === 0) firstAdmin = adminId;
  }
});

after(async () => {
  await db.close();
});

describe(`platform with ${SCHOOLS} schools`, () => {
  it("provisions every school with its own roles and modules", async () => {
    const counts = await one<{ schools: string; roles: string; modules: string }>(db,
      `SELECT (SELECT count(*) FROM public.schools) AS schools,
              (SELECT count(DISTINCT school_id) FROM public.roles) AS roles,
              (SELECT count(DISTINCT school_id) FROM public.school_modules) AS modules`);
    assert.equal(Number(counts!.schools), SCHOOLS + 2, "the two seeded schools plus the new ones");
    assert.equal(Number(counts!.roles), SCHOOLS + 2);
    assert.equal(Number(counts!.modules), SCHOOLS + 2);
  });

  it("keeps every tenant's records invisible to the other 69 administrators", async () => {
    const own = schoolIds[0]!;
    const visible = await asUser(db, firstAdmin, (tx) =>
      rows<{ school_id: string }>(tx, `SELECT DISTINCT school_id FROM public.students`));
    assert.deepEqual(visible.map((r) => r.school_id), [own]);

    const students = await asUser(db, firstAdmin, (tx) => one<{ n: string }>(tx, `SELECT count(*) AS n FROM public.students`));
    assert.equal(Number(students!.n), STUDENTS_PER_SCHOOL);

    for (const table of ["enrollments", "classes", "academic_years", "users"]) {
      const foreign = await asUser(db, firstAdmin, (tx) =>
        one<{ n: string }>(tx, `SELECT count(*) AS n FROM public.${table} WHERE school_id <> $1`, [own]));
      assert.equal(Number(foreign!.n), 0, `${table} leaks rows from other schools`);
    }

    // The seeded school's own administrator is equally confined.
    const other = await asUser(db, t.users.adminA, (tx) =>
      one<{ n: string }>(tx, `SELECT count(*) AS n FROM public.students WHERE school_id <> $1`, [SCHOOL_A]));
    assert.equal(Number(other!.n), 0);
  });

  it("serves the dashboard of one school without scanning the others", async () => {
    const started = Date.now();
    const dashboard = await asUser(db, firstAdmin, (tx) => one<{ d: { counts: { students_active: number } } }>(tx, `SELECT public.admin_dashboard() AS d`));
    const elapsed = Date.now() - started;
    assert.equal(Number(dashboard!.d.counts.students_active), STUDENTS_PER_SCHOOL);
    // Generous: catches a plan that walks every tenant, not a performance target.
    assert.ok(elapsed < 5000, `admin_dashboard took ${elapsed}ms with ${SCHOOLS} schools`);

    const plan = await rows<{ "QUERY PLAN": string }>(db,
      `EXPLAIN SELECT id FROM public.students WHERE school_id = $1`, [schoolIds[1]!]);
    const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
    assert.match(text, /Index|Bitmap/, `students by school should use an index:\n${text}`);
  });

  it("publishes only schools that are active and public", async () => {
    await db.query(`UPDATE public.schools SET status = 'archived' WHERE id = $1`, [schoolIds[1]!]);
    const listed = await asAnon(db, (tx) => rows<{ slug: string }>(tx, `SELECT slug FROM public.list_public_schools()`));
    const slugs = listed.map((s) => s.slug);
    assert.ok(slugs.includes("school-0"), "an active school is listed");
    assert.ok(!slugs.includes("school-1"), "an archived school is not listed");
    await db.query(`UPDATE public.schools SET status = 'active' WHERE id = $1`, [schoolIds[1]!]);
  });
});
