import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
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

const insertGrade = (userId: string, classSubject: string, student: string, score = 4, extra = "") =>
  asUser(db, userId, (tx) =>
    one<{ id: string }>(
      tx,
      `INSERT INTO public.grades (school_id, student_id, class_subject_id, assessment_type_id, score, max_score${extra ? ", grade_date" : ""})
       VALUES ($1, $2, $3, $4, $5, 5${extra ? `, ${extra}` : ""}) RETURNING id`,
      [SCHOOL_A, student, classSubject, a.assessmentTest, score]
    )
  );

describe("people records", () => {
  it("lets staff see students but students only themselves", async () => {
    const teacherView = await asUser(db, t.users.teacherA, (tx) => rows(tx, `SELECT id FROM public.students`));
    assert.equal(teacherView.length, 3);
    const studentView = await asUser(db, t.users.studentA, (tx) => rows<{ id: string }>(tx, `SELECT id FROM public.students`));
    assert.deepEqual(studentView.map((r) => r.id), [a.students.studentA]);
    const parentView = await asUser(db, t.users.parentA, (tx) => rows<{ id: string }>(tx, `SELECT id FROM public.students`));
    assert.deepEqual(parentView.map((r) => r.id), [a.students.studentA]);
  });

  it("never exposes another school's students", async () => {
    const view = await asUser(db, t.users.adminB, (tx) => rows<{ id: string }>(tx, `SELECT id FROM public.students`));
    assert.deepEqual(view.map((r) => r.id), [a.students.studentB]);
  });

  it("requires students.archive to change a student's status", async () => {
    const vp = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.students SET status = 'archived' WHERE id = $1`, [a.students.unlinkedA]))
    );
    assert.equal(vp, null, "teachers have no update policy: statement affects 0 rows");
    const result = await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.students SET status = 'archived' WHERE id = $1`, [a.students.unlinkedA]));
    assert.equal(result.affectedRows, 0);
    const ok = await asUser(db, t.users.directorA, (tx) => tx.query(`UPDATE public.students SET status = 'inactive' WHERE id = $1`, [a.students.unlinkedA]));
    assert.equal(ok.affectedRows, 1);
    await db.query(`UPDATE public.students SET status = 'active' WHERE id = $1`, [a.students.unlinkedA]);
  });

  it("has no hard-delete path for student records", async () => {
    const result = await asUser(db, t.users.adminA, (tx) => tx.query(`DELETE FROM public.students WHERE id = $1`, [a.students.unlinkedA]));
    assert.equal(result.affectedRows, 0);
  });

  it("rejects linking a student record to an account from another school", async () => {
    const error = await errorOf(() =>
      db.query(`INSERT INTO public.students (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'X', 'Y')`, [SCHOOL_A, t.users.teacherB])
    );
    assert.match(error ?? "", /cross-school/);
  });

  it("allows only one active enrollment per student per academic year", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) =>
        tx.query(`INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id) VALUES ($1, $2, $3, $4)`,
          [SCHOOL_A, a.students.studentA, a.class9B, a.yearA])
      )
    );
    assert.match(error ?? "", /idx_enrollments_one_active/);
  });
});

describe("gradebook", () => {
  it("lets a teacher grade only the class subjects they teach", async () => {
    const own = await insertGrade(t.users.teacherA, a.mathA, a.students.studentA);
    assert.ok(own?.id);
    const other = await errorOf(() => insertGrade(t.users.teacherA, a.physicsA, a.students.studentA));
    assert.match(other ?? "", /row-level security/);
    const crossSchool = await errorOf(() => insertGrade(t.users.teacherB, a.mathA, a.students.studentA));
    assert.match(crossSchool ?? "", /row-level security|cross-school/);
  });

  it("forbids students and parents from entering grades", async () => {
    assert.match((await errorOf(() => insertGrade(t.users.studentA, a.mathA, a.students.studentA))) ?? "", /row-level security/);
    assert.match((await errorOf(() => insertGrade(t.users.parentA, a.mathA, a.students.studentA))) ?? "", /row-level security/);
  });

  it("rejects grades for students not enrolled in the class and scores above maximum", async () => {
    const notEnrolled = await errorOf(() => insertGrade(t.users.teacherA, a.mathA, a.students.student2A));
    assert.match(notEnrolled ?? "", /not enrolled/);
    const tooHigh = await errorOf(() => insertGrade(t.users.teacherA, a.mathA, a.students.studentA, 7));
    assert.match(tooHigh ?? "", /grades_score_check/);
  });

  it("assigns the term automatically and blocks teachers from locked terms", async () => {
    const grade = await insertGrade(t.users.teacherA, a.mathA, a.students.unlinkedA, 5);
    const stored = await one<{ academic_term_id: string; entered_by: string }>(db, `SELECT academic_term_id, entered_by FROM public.grades WHERE id = $1`, [grade!.id]);
    assert.deepEqual(stored, { academic_term_id: a.termCurrent, entered_by: t.users.teacherA });

    const locked = await errorOf(() => insertGrade(t.users.teacherA, a.mathA, a.students.studentA, 3, "current_date - 40"));
    assert.match(locked ?? "", /locked/);
    const adminOk = await insertGrade(t.users.adminA, a.mathA, a.students.studentA, 3, "current_date - 40");
    assert.ok(adminOk?.id);
  });

  it("shows grades to the student, their guardian and their teachers only", async () => {
    const student = await asUser(db, t.users.studentA, (tx) => rows<{ student_id: string }>(tx, `SELECT student_id FROM public.grades`));
    assert.ok(student.length > 0 && student.every((g) => g.student_id === a.students.studentA));
    const parent = await asUser(db, t.users.parentA, (tx) => rows<{ student_id: string }>(tx, `SELECT student_id FROM public.grades`));
    assert.ok(parent.length > 0 && parent.every((g) => g.student_id === a.students.studentA));
    const otherStudent = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.grades`));
    assert.equal(otherStudent.length, 0);
    const otherTeacher = await asUser(db, t.users.teacherB, (tx) => rows(tx, `SELECT id FROM public.grades`));
    assert.equal(otherTeacher.length, 0);
    const homeroom = await asUser(db, t.users.teacher2A, (tx) => rows(tx, `SELECT id FROM public.grades WHERE class_subject_id = $1`, [a.mathA]));
    assert.equal(homeroom.length, 0, "teacher2A teaches physics in 9A but is not its homeroom teacher");
  });

  it("requires grades.approve to approve and protects approved grades", async () => {
    const grade = await insertGrade(t.users.teacherA, a.mathA, a.students.studentA, 2);
    const teacherApprove = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.grades SET status = 'approved' WHERE id = $1`, [grade!.id]))
    );
    assert.match(teacherApprove ?? "", /grades.approve/);
    await asUser(db, t.users.directorA, (tx) => tx.query(`UPDATE public.grades SET status = 'approved' WHERE id = $1`, [grade!.id]));
    const approved = await one<{ approved_by: string }>(db, `SELECT approved_by FROM public.grades WHERE id = $1`, [grade!.id]);
    assert.equal(approved!.approved_by, t.users.directorA);
    const teacherEdit = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.grades SET score = 5 WHERE id = $1`, [grade!.id]))
    );
    assert.match(teacherEdit ?? "", /approved grades/);
  });

  it("audits grade corrections with old and new values", async () => {
    const grade = await insertGrade(t.users.teacherA, a.mathA, a.students.studentA, 3);
    await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.grades SET score = 4 WHERE id = $1`, [grade!.id]));
    const entry = await one<{ old_values: { score: string }; new_values: { score: string }; user_id: string }>(
      db, `SELECT old_values, new_values, user_id FROM public.audit_logs WHERE entity_type = 'grade' AND entity_id = $1`, [grade!.id]);
    assert.equal(Number(entry!.old_values.score), 3);
    assert.equal(Number(entry!.new_values.score), 4);
    assert.equal(entry!.user_id, t.users.teacherA);
  });
});

describe("attendance", () => {
  const mark = (userId: string, classId: string, classSubject: string | null, student: string, date = "app.school_today($1)") =>
    asUser(db, userId, (tx) =>
      tx.query(
        `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
         VALUES ($1, $2, $3, $4, ${date}, 'present')`,
        [SCHOOL_A, student, classId, classSubject]
      )
    );

  it("lets a subject teacher mark lessons and the homeroom teacher mark daily attendance", async () => {
    await mark(t.users.teacherA, a.class9A, a.mathA, a.students.studentA);
    await mark(t.users.teacherA, a.class9A, null, a.students.studentA);
    const notHomeroom = await errorOf(() => mark(t.users.teacher2A, a.class9A, null, a.students.unlinkedA));
    assert.match(notHomeroom ?? "", /row-level security/);
    const notTeacher = await errorOf(() => mark(t.users.teacherA, a.class9A, a.physicsA, a.students.unlinkedA));
    assert.match(notTeacher ?? "", /row-level security/);
  });

  it("prevents duplicate marks, future dates and late corrections by teachers", async () => {
    const duplicate = await errorOf(() => mark(t.users.teacherA, a.class9A, a.mathA, a.students.studentA));
    assert.match(duplicate ?? "", /attendance_unique/);
    const future = await errorOf(() => mark(t.users.teacherA, a.class9A, a.mathA, a.students.unlinkedA, "app.school_today($1) + 1"));
    assert.match(future ?? "", /future date/);
    const late = await errorOf(() => mark(t.users.teacherA, a.class9A, a.mathA, a.students.unlinkedA, "app.school_today($1) - 20"));
    assert.match(late ?? "", /correction window/);
    await mark(t.users.adminA, a.class9A, a.mathA, a.students.unlinkedA, "app.school_today($1) - 20");
  });

  it("lets a substitute teacher mark attendance only for the covered lesson", async () => {
    const day = (await one<{ d: string; dow: number }>(
      db,
      `SELECT (app.school_today($1) - CASE WHEN extract(isodow FROM app.school_today($1)) = 7 THEN 1 ELSE 0 END)::text AS d`,
      [SCHOOL_A]
    ))!.d;
    const dow = (await one<{ dow: number }>(db, `SELECT extract(isodow FROM $1::date)::int AS dow`, [day]))!.dow;
    const entry = (await asUser(db, t.users.adminA, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, teacher_id, day_of_week, period_number)
         VALUES ($1, $2, $3, $4, $5, $6, 7) RETURNING id`,
        [SCHOOL_A, a.yearA, a.class9A, a.mathA, a.staff.teacherA, dow])))!.id;
    const markAs = (period: number) =>
      asUser(db, t.users.teacher2A, (tx) =>
        tx.query(
          `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, period_number, status)
           VALUES ($1, $2, $3, $4, $5::date, $6, 'present')`,
          [SCHOOL_A, a.students.unlinkedA, a.class9A, a.mathA, day, period]));

    const before = await errorOf(() => markAs(7));
    assert.match(before ?? "", /row-level security/);
    await asUser(db, t.users.adminA, (tx) =>
      tx.query(`INSERT INTO public.substitutions (school_id, timetable_entry_id, substitution_date, substitute_teacher_id) VALUES ($1, $2, $3::date, $4)`,
        [SCHOOL_A, entry, day, a.staff.teacher2A]));
    await markAs(7);
    const otherPeriod = await errorOf(() => markAs(8));
    assert.match(otherPeriod ?? "", /row-level security/);
    const grade = await errorOf(() => insertGrade(t.users.teacher2A, a.mathA, a.students.unlinkedA));
    assert.match(grade ?? "", /row-level security/);
    await db.query(`DELETE FROM public.attendance_records WHERE class_subject_id = $1 AND period_number = 7`, [a.mathA]);
    await db.query(`DELETE FROM public.timetable_entries WHERE id = $1`, [entry]);
  });

  it("resolves 'today' in the school's time zone and rejects unknown zones", async () => {
    const zones = await one<{ utc: string; school: string; expected: string }>(
      db,
      `SELECT (now() AT TIME ZONE 'UTC')::date::text AS utc, app.school_today($1)::text AS school,
              (now() AT TIME ZONE 'Asia/Dushanbe')::date::text AS expected`,
      [SCHOOL_A]
    );
    assert.equal(zones!.school, zones!.expected);
    const invalid = await errorOf(() => db.query(`UPDATE public.schools SET timezone = 'Mars/Olympus' WHERE id = $1`, [SCHOOL_A]));
    assert.match(invalid ?? "", /invalid time zone/);
    await db.query(`UPDATE public.schools SET timezone = 'Pacific/Kiritimati' WHERE id = $1`, [SCHOOL_A]);
    const far = await one<{ school: string; expected: string }>(
      db,
      `SELECT app.school_today($1)::text AS school, (now() AT TIME ZONE 'Pacific/Kiritimati')::date::text AS expected`,
      [SCHOOL_A]
    );
    assert.equal(far!.school, far!.expected);
    await db.query(`UPDATE public.schools SET timezone = 'Asia/Dushanbe' WHERE id = $1`, [SCHOOL_A]);
  });

  it("shows attendance to the family and not to other students", async () => {
    const parent = await asUser(db, t.users.parentA, (tx) => rows(tx, `SELECT id FROM public.attendance_records`));
    assert.ok(parent.length >= 2);
    const other = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.attendance_records`));
    assert.equal(other.length, 0);
  });
});

describe("homework", () => {
  let assignment: string;

  it("hides drafts from students and shows published work only to the class", async () => {
    assignment = (await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.homework_assignments (school_id, class_subject_id, title, due_at, max_score)
         VALUES ($1, $2, 'Exercises 1-10', now() + interval '2 days', 10) RETURNING id`, [SCHOOL_A, a.mathA])
    ))!.id;
    const draftVisible = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT id FROM public.homework_assignments`));
    assert.equal(draftVisible.length, 0);
    await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.homework_assignments SET status = 'published' WHERE id = $1`, [assignment]));
    const published = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT id FROM public.homework_assignments`));
    assert.equal(published.length, 1);
    const otherClass = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.homework_assignments`));
    assert.equal(otherClass.length, 0);
  });

  it("lets a student submit but not grade themselves", async () => {
    await asUser(db, t.users.studentA, (tx) =>
      tx.query(`INSERT INTO public.homework_submissions (school_id, assignment_id, student_id, content, score, status)
                VALUES ($1, $2, $3, 'my answer', 10, 'reviewed')`, [SCHOOL_A, assignment, a.students.studentA]));
    const stored = await one<{ status: string; score: string | null }>(db,
      `SELECT status, score FROM public.homework_submissions WHERE assignment_id = $1`, [assignment]);
    assert.deepEqual(stored, { status: "submitted", score: null });
    const forOther = await errorOf(() =>
      asUser(db, t.users.studentA, (tx) =>
        tx.query(`INSERT INTO public.homework_submissions (school_id, assignment_id, student_id, content) VALUES ($1, $2, $3, 'x')`,
          [SCHOOL_A, assignment, a.students.unlinkedA])));
    assert.match(forOther ?? "", /row-level security|not enrolled/);
  });

  it("lets the teacher review and then locks the submission", async () => {
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(`UPDATE public.homework_submissions SET status = 'reviewed', score = 9, feedback = 'Good' WHERE assignment_id = $1`, [assignment]));
    const reviewed = await one<{ reviewed_by: string; score: string }>(db,
      `SELECT reviewed_by, score FROM public.homework_submissions WHERE assignment_id = $1`, [assignment]);
    assert.equal(reviewed!.reviewed_by, t.users.teacherA);
    const edit = await errorOf(() =>
      asUser(db, t.users.studentA, (tx) => tx.query(`UPDATE public.homework_submissions SET content = 'changed' WHERE assignment_id = $1`, [assignment])));
    assert.match(edit ?? "", /reviewed submission/);
    const overMax = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.homework_submissions SET score = 11 WHERE assignment_id = $1`, [assignment])));
    assert.match(overMax ?? "", /maximum/);
  });
});

describe("timetable", () => {
  const slot = (userId: string, classId: string, classSubject: string, day: number, period: number, room: string | null = null) =>
    asUser(db, userId, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number, room_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [SCHOOL_A, a.yearA, classId, classSubject, day, period, room]));

  it("detects teacher, class and room conflicts", async () => {
    const room = (await one<{ id: string }>(db, `INSERT INTO public.rooms (school_id, name) VALUES ($1, '201') RETURNING id`, [SCHOOL_A]))!.id;
    await slot(t.users.adminA, a.class9A, a.mathA, 1, 1, room);
    const classConflict = await errorOf(() => slot(t.users.adminA, a.class9A, a.physicsA, 1, 1));
    assert.match(classConflict ?? "", /timetable_class_conflict/);
    await slot(t.users.adminA, a.class9A, a.physicsA, 1, 2);
    const teacherConflict = await errorOf(() => slot(t.users.adminA, a.class9B, a.math9B, 1, 2));
    assert.match(teacherConflict ?? "", /timetable_teacher_conflict/);
    const roomConflict = await errorOf(() => slot(t.users.adminA, a.class9B, a.math9B, 1, 1, room));
    assert.match(roomConflict ?? "", /timetable_room_conflict/);
  });

  it("requires timetable.manage", async () => {
    const error = await errorOf(() => slot(t.users.teacherA, a.class9A, a.mathA, 2, 1));
    assert.match(error ?? "", /row-level security/);
  });

  it("rejects substitutes who are already teaching in that slot", async () => {
    const entry = await one<{ id: string }>(db, `SELECT id FROM public.timetable_entries WHERE class_subject_id = $1`, [a.physicsA]);
    const weekday = await one<{ d: string }>(db, `SELECT (current_date + ((8 - extract(isodow FROM current_date)::int) % 7))::text AS d`);
    const error = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) =>
        tx.query(`INSERT INTO public.substitutions (school_id, timetable_entry_id, substitution_date, substitute_teacher_id) VALUES ($1, $2, $3::date, $4)`,
          [SCHOOL_A, entry!.id, weekday!.d, a.staff.teacher2A])));
    assert.match(error ?? "", /already teaching|does not match/);
  });
});

describe("legacy data migration (00024)", () => {
  it("moves class_students and teacher_subjects into enrollments and class_subjects", async () => {
    const legacy = await createDatabase({ upTo: "00023_core_rls_and_accounts.sql" });
    const tenants = await seedTenants(legacy);
    const year = (await one<{ id: string }>(legacy, `SELECT id FROM public.academic_years WHERE school_id = $1 AND is_current`, [tenants.schoolA]))!.id;
    const klass = (await one<{ id: string }>(legacy, `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, '5A', 5) RETURNING id`, [tenants.schoolA, year]))!.id;
    const subject = (await one<{ id: string }>(legacy, `INSERT INTO public.subjects (school_id, name_tg) VALUES ($1, 'History') RETURNING id`, [tenants.schoolA]))!.id;
    await legacy.query(`INSERT INTO public.class_students (class_id, student_id, school_id) VALUES ($1, $2, $3)`, [klass, tenants.users.studentA, tenants.schoolA]);
    await legacy.query(`INSERT INTO public.teacher_subjects (teacher_id, subject_id, class_id, school_id, academic_year_id) VALUES ($1, $2, $3, $4, $5)`,
      [tenants.users.teacherA, subject, klass, tenants.schoolA, year]);

    const migration = readFileSync(join(import.meta.dirname, "..", "..", "supabase", "migrations", "00024_academic_core.sql"), "utf8");
    await legacy.exec(migration);

    const enrollment = await one<{ class_id: string; status: string }>(legacy,
      `SELECT e.class_id, e.status FROM public.enrollments e JOIN public.students s ON s.id = e.student_id WHERE s.user_id = $1`, [tenants.users.studentA]);
    assert.deepEqual(enrollment, { class_id: klass, status: "active" });
    const assignment = await one<{ user_id: string }>(legacy,
      `SELECT st.user_id FROM public.class_subjects cs JOIN public.staff st ON st.id = cs.teacher_id WHERE cs.class_id = $1 AND cs.subject_id = $2`, [klass, subject]);
    assert.equal(assignment!.user_id, tenants.users.teacherA);
    const writable = await errorOf(() =>
      asUser(legacy, tenants.users.adminA, (tx) => tx.query(`INSERT INTO public.class_students (class_id, student_id, school_id) VALUES ($1, $2, $3)`, [klass, tenants.users.student2A, tenants.schoolA])));
    assert.match(writable ?? "", /permission denied/);
    await legacy.close();
  });
});
