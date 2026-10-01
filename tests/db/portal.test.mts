import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
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
  await db.query(`INSERT INTO public.bell_periods (school_id, period_number, start_time, end_time) VALUES ($1, 1, '08:00', '08:45')`, [SCHOOL_A]);
  await db.query(
    `INSERT INTO public.timetable_entries (school_id, academic_year_id, class_id, class_subject_id, day_of_week, period_number)
     VALUES ($1, $2, $3, $4, 1, 1), ($1, $2, $5, $6, 2, 1)`,
    [SCHOOL_A, a.yearA, a.class9A, a.mathA, a.class9B, a.math9B]
  );
});
after(async () => {
  await db.close();
});

describe("portal timetables", () => {
  it("shows a class timetable with teacher names to its students and their guardians", async () => {
    for (const userId of [t.users.studentA, t.users.parentA]) {
      const entries = await asUser(db, userId, (tx) =>
        rows<{ teacher_name: string; start_time: string }>(tx, `SELECT * FROM public.class_timetable($1)`, [a.class9A]));
      assert.equal(entries.length, 1);
      assert.match(entries[0]!.teacher_name, /A/);
      assert.equal(entries[0]!.start_time, "08:00:00");
    }
  });

  it("refuses other schools and unrelated guardians", async () => {
    assert.match((await errorOf(() => asUser(db, t.users.studentB, (tx) => tx.query(`SELECT * FROM public.class_timetable($1)`, [a.class9A])))) ?? "", /forbidden/);
    assert.match((await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT * FROM public.class_timetable($1)`, [a.class9B])))) ?? "", /forbidden/);
  });

  it("lists only the caller's own teaching slots", async () => {
    const mine = await asUser(db, t.users.teacherA, (tx) => rows<{ class_name: string }>(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.deepEqual(mine.map((m) => m.class_name), ["9A"]);
    const other = await asUser(db, t.users.teacher2A, (tx) => rows<{ class_name: string }>(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.deepEqual(other.map((m) => m.class_name), ["9B"]);
    const student = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT * FROM public.my_teaching_timetable()`));
    assert.equal(student.length, 0);
  });
});

describe("portal today functions", () => {
  it("default to the school's own calendar day, not the database's UTC day", async () => {
    // Pick whichever of the two zones currently disagrees with the session's
    // calendar day; they are 25 hours apart, so one of them always does.
    const zone = (await one<{ tz: string }>(db, `SELECT CASE
        WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date <> current_date THEN 'Pacific/Kiritimati'
        ELSE 'Pacific/Niue' END AS tz`))!.tz;
    const previous = (await one<{ tz: string }>(db, `SELECT timezone AS tz FROM public.schools WHERE id = $1`, [SCHOOL_A]))!.tz;
    await db.query(`UPDATE public.schools SET timezone = $2 WHERE id = $1`, [SCHOOL_A, zone]);
    try {
      const local = (await one<{ d: string }>(db, `SELECT app.school_today($1)::text AS d`, [SCHOOL_A]))!.d;
      const utc = (await one<{ d: string }>(db, `SELECT current_date::text AS d`))!.d;
      assert.notEqual(local, utc, "the fixture must exercise a differing calendar day");

      const teacher = await asUser(db, t.users.teacherA, (tx) => one<{ j: { date: string } }>(tx, `SELECT public.teacher_today() AS j`));
      assert.equal(teacher!.j.date, local);
      const student = await asUser(db, t.users.studentA, (tx) => one<{ j: { date: string } }>(tx, `SELECT public.student_overview() AS j`));
      assert.equal(student!.j.date, local);

      // An explicit date still wins over the school default.
      const explicit = await asUser(db, t.users.teacherA, (tx) =>
        one<{ j: { date: string } }>(tx, `SELECT public.teacher_today($1::date) AS j`, [utc]));
      assert.equal(explicit!.j.date, utc);
    } finally {
      await db.query(`UPDATE public.schools SET timezone = $2 WHERE id = $1`, [SCHOOL_A, previous]);
    }
  });
});

describe("announcement attachments", () => {
  it("are readable only by the announcement audience", async () => {
    const path = `${SCHOOL_A}/announcements/0f0f0f0f-0000-4000-8000-000000000001.pdf`;
    await asUser(db, t.users.adminA, async (tx) => {
      await tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', $1)`, [path]);
      await tx.query(
        `INSERT INTO public.announcements (school_id, title, body, status, audience_type, attachment_path, attachment_name)
         VALUES ($1, 'Staff only', 'x', 'published', 'staff', $2, 'plan.pdf')`, [SCHOOL_A, path]);
    });
    const see = (userId: string) => asUser(db, userId, (tx) => rows(tx, `SELECT id FROM storage.objects WHERE name = $1`, [path]));
    assert.equal((await see(t.users.teacherA)).length, 1);
    assert.equal((await see(t.users.studentA)).length, 0);
    assert.equal((await see(t.users.adminB)).length, 0);
    const upload = await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', $1)`, [`${SCHOOL_A}/announcements/x.pdf`])));
    assert.match(upload ?? "", /row-level security/);
  });
});

describe("what a pupil is told their attendance is", () => {
  interface Term {
    present: number;
    late: number;
    absent: number;
    excused: number;
    total: number;
    lessons: number;
  }

  const overview = () =>
    asUser(db, t.users.studentA, (tx) =>
      one<{ j: { attendance_term: Term } }>(tx, `SELECT public.student_overview() AS j`)
    ).then((r) => r!.j.attendance_term);

  it("counts the lessons that were held, not the rows the register happens to hold", async () => {
    // This is how a class journal is actually kept: the teacher rules a column
    // for each lesson and writes only the exceptions. Counting 'present' rows
    // told a pupil with one late mark that their attendance was nought.
    await db.query(`DELETE FROM public.attendance_records WHERE student_id = $1`, [a.students.studentA]);
    await db.query(`DELETE FROM public.journal_columns WHERE class_subject_id = $1`, [a.mathA]);
    for (let back = 1; back <= 10; back += 1) {
      await db.query(
        `INSERT INTO public.journal_columns (school_id, class_subject_id, academic_term_id, kind, column_date, assessment_type_id)
         VALUES ($1, $2, $3, 'lesson', current_date - $4::int, $5)`,
        [SCHOOL_A, a.mathA, a.termCurrent, back, a.assessmentTest]
      );
    }
    await db.query(
      `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
       VALUES ($1, $2, $3, $4, current_date - 1, 'absent')`,
      [SCHOOL_A, a.students.studentA, a.class9A, a.mathA]
    );

    const summary = await overview();
    assert.equal(summary.lessons, 10, "ten columns were ruled");
    assert.equal(summary.absent, 1);
    assert.equal(summary.present, 0, "a blank square is not a row");
    // 9 of 10 — which is what the page now shows, instead of 0%.
    assert.equal(Math.round(((summary.lessons - summary.absent - summary.excused) / summary.lessons) * 100), 90);
  });

  it("still works for a school that calls the roll every lesson", async () => {
    await db.query(`DELETE FROM public.journal_columns WHERE class_subject_id = $1`, [a.mathA]);
    await db.query(`DELETE FROM public.attendance_records WHERE student_id = $1`, [a.students.studentA]);
    for (let back = 1; back <= 4; back += 1) {
      await db.query(
        `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
         VALUES ($1, $2, $3, $4, current_date - $5::int, $6)`,
        [SCHOOL_A, a.students.studentA, a.class9A, a.mathA, back, back === 1 ? "absent" : "present"]
      );
    }
    const summary = await overview();
    assert.equal(summary.lessons, 0, "no columns were ruled");
    assert.equal(summary.total, 4, "so the register's own rows are the lessons");
    assert.equal(Math.max(summary.lessons, summary.total) - summary.absent - summary.excused, 3);
  });

  it("does not hold a lesson against a pupil who had not arrived yet", async () => {
    await db.query(`UPDATE public.enrollments SET enrolled_on = current_date - 3 WHERE student_id = $1`, [
      a.students.studentA,
    ]);
    await db.query(`DELETE FROM public.attendance_records WHERE student_id = $1`, [a.students.studentA]);
    for (let back = 1; back <= 10; back += 1) {
      await db.query(
        `INSERT INTO public.journal_columns (school_id, class_subject_id, academic_term_id, kind, column_date, assessment_type_id)
         VALUES ($1, $2, $3, 'lesson', current_date - $4::int, $5)`,
        [SCHOOL_A, a.mathA, a.termCurrent, back, a.assessmentTest]
      );
    }
    const summary = await overview();
    assert.equal(summary.lessons, 3, "only the lessons since they joined the class");
    await db.query(`UPDATE public.enrollments SET enrolled_on = current_date - 60 WHERE student_id = $1`, [
      a.students.studentA,
    ]);
  });
});
