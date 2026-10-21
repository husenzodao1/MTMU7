import type { Db } from "./harness.mts";

/** The school seeded by migration 00012. */
export const SCHOOL_A = "00000000-0000-0000-0000-000000000001";
export const SCHOOL_B = "0000000b-0000-0000-0000-00000000000b";

let counter = 0;
export function newId(): string {
  counter += 1;
  return `a0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export interface Tenants {
  schoolA: string;
  schoolB: string;
  regionId: string;
  districtId: string;
  users: {
    adminA: string;
    directorA: string;
    teacherA: string;
    teacher2A: string;
    librarianA: string;
    studentA: string;
    student2A: string;
    parentA: string;
    staffA: string;
    pendingA: string;
    blockedA: string;
    formerAdminA: string;
    adminB: string;
    teacherB: string;
    studentB: string;
    superAdmin: string;
    districtAdmin: string;
    otherDistrictAdmin: string;
  };
}

// Every account its own number: a number already on another account of the
// school is refused (00077).
let phoneSerial = 0;
const nextPhone = () => `+99255${String(++phoneSerial).padStart(7, "0")}`;

async function createUser(
  db: Db,
  school: string,
  roleSlug: string | null,
  label: string,
  opts: { status?: string; active?: boolean } = {}
): Promise<string> {
  const id = newId();
  const email = `${label}.${id.slice(-6)}@example.test`;
  await db.query(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())`, [id, email]);
  await db.query(
    `INSERT INTO public.users (id, school_id, email, first_name, last_name, phone, status, is_active)
     VALUES ($1, $2, $3, $4, 'Test', $7, $5, $6)`,
    [id, school, email, label, opts.status ?? "active", opts.active ?? true, nextPhone()]
  );
  if (roleSlug) {
    await db.query(
      `INSERT INTO public.user_roles (user_id, role_id, school_id)
       SELECT $1, r.id, r.school_id FROM public.roles r WHERE r.school_id = $2 AND r.slug = $3`,
      [id, school, roleSlug]
    );
  }
  return id;
}

/**
 * Two schools in different districts with a user for every role, a platform
 * super admin and district-scoped administrators. Inserted as superuser, so
 * API guards do not apply to fixture setup.
 */
export async function seedTenants(db: Db): Promise<Tenants> {
  const regionId = newId();
  const districtId = newId();
  const otherDistrictId = newId();
  await db.query(`INSERT INTO public.regions (id, code, name_tg) VALUES ($1, 'R1', 'Region 1')`, [regionId]);
  await db.query(
    `INSERT INTO public.districts (id, region_id, code, name_tg) VALUES ($1, $3, 'D1', 'District 1'), ($2, $3, 'D2', 'District 2')`,
    [districtId, otherDistrictId, regionId]
  );
  await db.query(`UPDATE public.schools SET district_id = $1 WHERE id = $2`, [districtId, SCHOOL_A]);
  await db.query(
    `INSERT INTO public.schools (id, short_name, full_name, slug, id_prefix, district_id)
     VALUES ($1, 'School B', 'School B full name', 'school-b', 'SB', $2)`,
    [SCHOOL_B, otherDistrictId]
  );

  const users = {
    adminA: await createUser(db, SCHOOL_A, "admin", "adminA"),
    directorA: await createUser(db, SCHOOL_A, "director", "directorA"),
    teacherA: await createUser(db, SCHOOL_A, "teacher", "teacherA"),
    teacher2A: await createUser(db, SCHOOL_A, "teacher", "teacher2A"),
    librarianA: await createUser(db, SCHOOL_A, "librarian", "librarianA"),
    studentA: await createUser(db, SCHOOL_A, "student", "studentA"),
    student2A: await createUser(db, SCHOOL_A, "student", "student2A"),
    parentA: await createUser(db, SCHOOL_A, "parent", "parentA"),
    staffA: await createUser(db, SCHOOL_A, "staff", "staffA"),
    pendingA: await createUser(db, SCHOOL_A, null, "pendingA", { status: "pending", active: false }),
    blockedA: await createUser(db, SCHOOL_A, "student", "blockedA", { status: "blocked", active: false }),
    formerAdminA: await createUser(db, SCHOOL_A, "admin", "formerAdminA", { status: "blocked", active: false }),
    adminB: await createUser(db, SCHOOL_B, "admin", "adminB"),
    teacherB: await createUser(db, SCHOOL_B, "teacher", "teacherB"),
    studentB: await createUser(db, SCHOOL_B, "student", "studentB"),
    superAdmin: await createUser(db, SCHOOL_A, null, "superAdmin"),
    districtAdmin: await createUser(db, SCHOOL_A, null, "districtAdmin"),
    otherDistrictAdmin: await createUser(db, SCHOOL_A, null, "otherDistrictAdmin"),
  };

  await db.query(`INSERT INTO public.admin_scopes (user_id, scope_type, scope_role) VALUES ($1, 'platform', 'super_admin')`, [users.superAdmin]);
  await db.query(
    `INSERT INTO public.admin_scopes (user_id, scope_type, scope_role, district_id) VALUES ($1, 'district', 'district_admin', $2), ($3, 'district', 'district_admin', $4)`,
    [users.districtAdmin, districtId, users.otherDistrictAdmin, otherDistrictId]
  );

  return { schoolA: SCHOOL_A, schoolB: SCHOOL_B, regionId, districtId, users };
}

/**
 * Hands `submit_registration` back to ordinary callers for the length of a test
 * run.
 *
 * 00045 revoked it: the school issues logins now, and nobody signs themselves
 * up. The function itself stays in the database so the rows it wrote still make
 * sense and so anything left pending can still be settled, and the tests that
 * describe how it behaves stay with it. They would otherwise be deleted
 * alongside a function that is still there — leaving the next person to re-grant
 * it with nothing to tell them what it does.
 *
 * That the shipped grant really is revoked is asserted separately, before this
 * is called.
 */
export async function allowSelfRegistrationInTests(db: Db): Promise<void> {
  await db.query(
    `GRANT EXECUTE ON FUNCTION public.submit_registration(text, text, text, text, text, uuid, jsonb, text) TO authenticated`
  );
  // 00045 also closed every school that existed when it ran, which includes the
  // one the migrations seed and the fixtures build on.
  await db.query(`UPDATE public.schools SET settings = settings - 'registration_open'`);
}
