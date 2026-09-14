import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db, type Tx } from "./harness.mts";
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

const putObject = (tx: Tx, bucket: string, name: string, owner?: string) =>
  tx.query(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ($1, $2, $3)`, [bucket, name, owner ?? null]);
const canSee = (tx: Tx, bucket: string, name: string) =>
  one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = $1 AND name = $2`, [bucket, name]).then((r) => r!.n === 1);

describe("storage policies (SEC-011)", () => {
  it("confines avatar uploads to the user's own folder", async () => {
    await asUser(db, t.users.studentA, (tx) => putObject(tx, "avatars", `${SCHOOL_A}/${t.users.studentA}/me.webp`));
    const other = await errorOf(() => asUser(db, t.users.studentA, (tx) => putObject(tx, "avatars", `${SCHOOL_A}/${t.users.teacherA}/x.webp`)));
    assert.match(other ?? "", /row-level security/);
    const traversal = await errorOf(() => asUser(db, t.users.studentA, (tx) => putObject(tx, "avatars", `${SCHOOL_A}/../${t.schoolB}/x.webp`)));
    assert.match(traversal ?? "", /row-level security/);
  });

  it("allows library uploads only for library staff within their school", async () => {
    const path = `${SCHOOL_A}/books/physics.pdf`;
    assert.match((await errorOf(() => asUser(db, t.users.teacherA, (tx) => putObject(tx, "library-files", path)))) ?? "", /row-level security/);
    assert.match((await errorOf(() => asUser(db, t.users.adminB, (tx) => putObject(tx, "library-files", path)))) ?? "", /row-level security/);
    await asUser(db, t.users.librarianA, (tx) => putObject(tx, "library-files", path));
  });

  it("serves protected files only to users who can see the referencing record", async () => {
    const path = `${SCHOOL_A}/books/physics.pdf`;
    await db.query(`INSERT INTO public.library_items (school_id, title, status, visibility, file_url, file_name, file_size, file_type)
                    VALUES ($1, 'Physics', 'published', 'teachers', $2, 'physics.pdf', 100, 'pdf')`, [SCHOOL_A, path]);
    assert.equal(await asUser(db, t.users.teacherA, (tx) => canSee(tx, "library-files", path)), true);
    assert.equal(await asUser(db, t.users.studentA, (tx) => canSee(tx, "library-files", path)), false);
    assert.equal(await asUser(db, t.users.teacherB, (tx) => canSee(tx, "library-files", path)), false);
    assert.equal(await asAnon(db, (tx) => canSee(tx, "library-files", path)), false);
  });

  it("exposes public documents anonymously and keeps drafts private", async () => {
    const publicPath = `${SCHOOL_A}/documents/charter.pdf`;
    const draftPath = `${SCHOOL_A}/documents/draft.pdf`;
    await asUser(db, t.users.adminA, async (tx) => {
      await putObject(tx, "documents", publicPath);
      await putObject(tx, "documents", draftPath);
      await tx.query(`INSERT INTO public.documents (school_id, title, access, status, storage_path, file_name, mime_type, size_bytes) VALUES
        ($1, 'Charter', 'public', 'published', $2, 'charter.pdf', 'application/pdf', 10),
        ($1, 'Draft', 'school', 'draft', $3, 'draft.pdf', 'application/pdf', 10)`, [SCHOOL_A, publicPath, draftPath]);
    });
    assert.equal(await asAnon(db, (tx) => canSee(tx, "documents", publicPath)), true);
    assert.equal(await asAnon(db, (tx) => canSee(tx, "documents", draftPath)), false);
    assert.equal(await asUser(db, t.users.studentA, (tx) => canSee(tx, "documents", draftPath)), false);
    assert.equal(await asUser(db, t.users.adminA, (tx) => canSee(tx, "documents", draftPath)), true);
  });
});

describe("dashboards", () => {
  before(async () => {
    await db.query(`INSERT INTO public.bell_periods (school_id, period_number, start_time, end_time) VALUES ($1, 1, '08:00', '08:45'), ($1, 2, '08:55', '09:40')`, [SCHOOL_A]);
    const dow = (await one<{ d: number }>(db, `SELECT least(extract(isodow FROM current_date)::int, 6) AS d`))!.d;
    await db.query(`INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number)
                    VALUES ($1, $2, $3, $4, $5, 1), ($1, $2, $3, $6, $5, 2)`, [SCHOOL_A, a.yearA, a.class9A, a.mathA, dow, a.physicsA]);
    await db.query(`INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, period_number, status)
                    VALUES ($1, $2, $3, $4, current_date, 1, 'present'), ($1, $5, $3, $4, current_date, 1, 'absent')`,
      [SCHOOL_A, a.students.studentA, a.class9A, a.mathA, a.students.unlinkedA]);
    await db.query(`INSERT INTO public.grades (school_id, student_id, class_subject_id, assessment_type_id, score, max_score) VALUES ($1, $2, $3, $4, 4, 5)`,
      [SCHOOL_A, a.students.studentA, a.mathA, a.assessmentTest]);
  });

  it("builds the admin dashboard from real data and refuses unauthorized callers", async () => {
    const d = await asUser(db, t.users.adminA, (tx) => one<{ d: Record<string, any> }>(tx, `SELECT public.admin_dashboard() AS d`));
    assert.equal(Number(d!.d.counts.students_active), 3);
    assert.equal(Number(d!.d.attendance_today.absent), 1);
    assert.ok(Array.isArray(d!.d.alerts));
    assert.ok(Array.isArray(d!.d.recent_activity));
    assert.match((await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.admin_dashboard()`)))) ?? "", /forbidden/);
    assert.match((await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_dashboard($1)`, [t.schoolB])))) ?? "", /forbidden/);
  });

  it("shows a teacher today's lessons with attendance state", async () => {
    const today = await asUser(db, t.users.teacherA, (tx) => one<{ d: { lessons: Array<{ class_name: string; attendance_marked: boolean; period_number: number }> } }>(tx, `SELECT public.teacher_today() AS d`));
    const isSunday = (await one<{ s: boolean }>(db, `SELECT extract(isodow FROM current_date) = 7 AS s`))!.s;
    if (!isSunday) {
      assert.equal(today!.d.lessons.length, 1);
      assert.equal(today!.d.lessons[0]!.attendance_marked, true);
    }
    const student = await asUser(db, t.users.studentA, (tx) => one<{ d: { is_teacher: boolean } }>(tx, `SELECT public.teacher_today() AS d`));
    assert.equal(student!.d.is_teacher, false);
  });

  it("gives students and guardians an overview only of their own child", async () => {
    const own = await asUser(db, t.users.studentA, (tx) => one<{ d: { student: { class_name: string }; latest_grades: unknown[] } }>(tx, `SELECT public.student_overview() AS d`));
    assert.equal(own!.d.student.class_name, "9A");
    assert.equal(own!.d.latest_grades.length, 1);
    const children = await asUser(db, t.users.parentA, (tx) => rows<{ id: string }>(tx, `SELECT id FROM public.my_children()`));
    assert.deepEqual(children.map((c) => c.id), [a.students.studentA]);
    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.student_overview($1)`, [a.students.studentA]));
    assert.match((await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.student_overview($1)`, [a.students.student2A])))) ?? "", /forbidden/);
    assert.match((await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.student_overview($1)`, [a.students.student2A])))) ?? "", /forbidden/);
  });
});

describe("reports and analytics", () => {
  it("runs every report for authorized staff", async () => {
    await asUser(db, t.users.directorA, async (tx) => {
      const enrollment = await rows<{ class_name: string; active_count: number }>(tx, `SELECT * FROM public.report_enrollment()`);
      assert.equal(Number(enrollment.find((r) => r.class_name === "9A")!.active_count), 2);
      const attendance = await rows<{ attendance_rate: string }>(tx, `SELECT * FROM public.report_attendance(current_date - 7, current_date)`);
      assert.equal(attendance.length, 2);
      const grades = await rows(tx, `SELECT * FROM public.report_grades($1)`, [a.class9A]);
      assert.ok(grades.length >= 2);
      const workload = await rows<{ teacher_name: string; planned_weekly_hours: string }>(tx, `SELECT * FROM public.report_teacher_workload()`);
      assert.ok(workload.some((w) => Number(w.planned_weekly_hours) === 5));
      await tx.query(`SELECT public.report_library()`);
      const activity = await rows(tx, `SELECT * FROM public.report_content_activity(current_date - 90, current_date)`);
      assert.ok(activity.length >= 3);
      const analytics = await one<{ a: { attendance_weekly: unknown[] } }>(tx, `SELECT public.analytics_overview() AS a`);
      assert.ok(analytics!.a.attendance_weekly.length >= 1);
    });
  });

  it("refuses reports to teachers, students and other schools", async () => {
    for (const userId of [t.users.teacherA, t.users.studentA]) {
      assert.match((await errorOf(() => asUser(db, userId, (tx) => tx.query(`SELECT * FROM public.report_enrollment()`)))) ?? "", /forbidden/);
    }
    assert.match((await errorOf(() => asUser(db, t.users.adminB, (tx) => tx.query(`SELECT * FROM public.report_grades($1)`, [a.class9A])))) ?? "", /forbidden/);
  });

  it("gives district administrators an overview of their schools only", async () => {
    const overview = await asUser(db, t.users.districtAdmin, (tx) => rows<{ school_id: string; students: number }>(tx, `SELECT * FROM public.scope_school_overview()`));
    assert.deepEqual(overview.map((s) => s.school_id), [SCHOOL_A]);
    const report = await asUser(db, t.users.districtAdmin, (tx) => rows(tx, `SELECT * FROM public.report_enrollment(NULL, $1)`, [SCHOOL_A]));
    assert.ok(report.length > 0);
    assert.match((await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT * FROM public.scope_school_overview()`)))) ?? "", /forbidden/);
  });
});
