import { one, type Db } from "./harness.mts";
import { newId, type Tenants } from "./fixtures.mts";

export interface Academic {
  yearA: string;
  termCurrent: string;
  termLocked: string;
  class9A: string;
  class9B: string;
  mathA: string;
  physicsA: string;
  math9B: string;
  mathSubject: string;
  staff: { teacherA: string; teacher2A: string };
  students: { studentA: string; student2A: string; unlinkedA: string; studentB: string };
  guardianA: string;
  assessmentTest: string;
  classB: string;
  mathB: string;
}

async function id<T extends { id: string }>(db: Db, sql: string, params: unknown[]): Promise<string> {
  return (await one<T>(db, sql, params))!.id;
}

/** Academic structure for both tenants with dates relative to today. */
export async function seedAcademic(db: Db, t: Tenants): Promise<Academic> {
  const yearA = await id(db,
    `INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
     VALUES ($1, 'test-year', current_date - 60, current_date + 240, true) RETURNING id`, [t.schoolA]);
  const yearB = await id(db,
    `INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
     VALUES ($1, 'test-year', current_date - 60, current_date + 240, true) RETURNING id`, [t.schoolB]);

  const termLocked = await id(db,
    `INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date, is_locked)
     VALUES ($1, $2, 'Q0', 'quarter', current_date - 60, current_date - 31, true) RETURNING id`, [t.schoolA, yearA]);
  const termCurrent = await id(db,
    `INSERT INTO public.academic_terms (school_id, academic_year_id, name, kind, start_date, end_date)
     VALUES ($1, $2, 'Q1', 'quarter', current_date - 30, current_date + 60) RETURNING id`, [t.schoolA, yearA]);

  const staffTeacherA = await id(db,
    `INSERT INTO public.staff (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Teacher', 'A') RETURNING id`,
    [t.schoolA, t.users.teacherA]);
  const staffTeacher2A = await id(db,
    `INSERT INTO public.staff (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Teacher', 'Two') RETURNING id`,
    [t.schoolA, t.users.teacher2A]);
  const staffTeacherB = await id(db,
    `INSERT INTO public.staff (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Teacher', 'B') RETURNING id`,
    [t.schoolB, t.users.teacherB]);

  const class9A = await id(db,
    `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, homeroom_staff_id)
     VALUES ($1, $2, '9A', 9, $3) RETURNING id`, [t.schoolA, yearA, staffTeacherA]);
  const class9B = await id(db,
    `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level, homeroom_staff_id)
     VALUES ($1, $2, '9B', 9, $3) RETURNING id`, [t.schoolA, yearA, staffTeacher2A]);
  const classB = await id(db,
    `INSERT INTO public.classes (school_id, academic_year_id, name, grade_level) VALUES ($1, $2, '9A', 9) RETURNING id`,
    [t.schoolB, yearB]);

  const mathSubject = await id(db, `INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Math', 'MATH') RETURNING id`, [t.schoolA]);
  const physics = await id(db, `INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Physics', 'PHYS') RETURNING id`, [t.schoolA]);
  const mathSubjectB = await id(db, `INSERT INTO public.subjects (school_id, name_tg, code) VALUES ($1, 'Math', 'MATH') RETURNING id`, [t.schoolB]);

  const mathA = await id(db,
    `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id, weekly_hours) VALUES ($1, $2, $3, $4, 5) RETURNING id`,
    [t.schoolA, class9A, mathSubject, staffTeacherA]);
  const physicsA = await id(db,
    `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id, weekly_hours) VALUES ($1, $2, $3, $4, 2) RETURNING id`,
    [t.schoolA, class9A, physics, staffTeacher2A]);
  const math9B = await id(db,
    `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id, weekly_hours) VALUES ($1, $2, $3, $4, 5) RETURNING id`,
    [t.schoolA, class9B, mathSubject, staffTeacher2A]);
  const mathB = await id(db,
    `INSERT INTO public.class_subjects (school_id, class_id, subject_id, teacher_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [t.schoolB, classB, mathSubjectB, staffTeacherB]);

  const studentA = await id(db, `INSERT INTO public.students (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Student', 'A') RETURNING id`, [t.schoolA, t.users.studentA]);
  const student2A = await id(db, `INSERT INTO public.students (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Student', 'Two') RETURNING id`, [t.schoolA, t.users.student2A]);
  const unlinkedA = await id(db, `INSERT INTO public.students (school_id, first_name, last_name, student_number) VALUES ($1, 'Unlinked', 'Child', 'S-001') RETURNING id`, [t.schoolA]);
  const studentB = await id(db, `INSERT INTO public.students (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Student', 'B') RETURNING id`, [t.schoolB, t.users.studentB]);

  for (const [school, student, klass] of [
    [t.schoolA, studentA, class9A],
    [t.schoolA, unlinkedA, class9A],
    [t.schoolA, student2A, class9B],
    [t.schoolB, studentB, classB],
  ] as const) {
    await db.query(
      `INSERT INTO public.enrollments (school_id, student_id, class_id, academic_year_id, enrolled_on)
       VALUES ($1, $2, $3, $4, current_date - 60)`,
      [school, student, klass, school === t.schoolA ? yearA : yearB]
    );
  }

  const guardianA = await id(db,
    `INSERT INTO public.guardians (school_id, user_id, first_name, last_name) VALUES ($1, $2, 'Parent', 'A') RETURNING id`,
    [t.schoolA, t.users.parentA]);
  await db.query(`INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship) VALUES ($1, $2, $3, 'mother')`, [studentA, guardianA, t.schoolA]);

  const assessmentTest = await id(db, `SELECT id FROM public.assessment_types WHERE school_id = $1 AND code = 'test'`, [t.schoolA]);

  newId();
  return {
    yearA, termCurrent, termLocked, class9A, class9B, mathA, physicsA, math9B, mathSubject,
    staff: { teacherA: staffTeacherA, teacher2A: staffTeacher2A },
    students: { studentA, student2A, unlinkedA, studentB },
    guardianA, assessmentTest, classB, mathB,
  };
}
