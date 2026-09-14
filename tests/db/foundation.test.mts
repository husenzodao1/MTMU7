import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

const can = (userId: string, school: string, perm: string) =>
  asUser(db, userId, async (tx) =>
    (await one<{ ok: boolean }>(tx, `SELECT app.can($1, $2) AS ok`, [school, perm]))!.ok
  );

describe("school provisioning", () => {
  it("provisions all system roles with permissions for a new school", async () => {
    const roleRows = await rows<{ slug: string; perms: number }>(
      db,
      `SELECT r.slug, count(rp.permission_id)::int AS perms
       FROM public.roles r LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
       WHERE r.school_id = $1 GROUP BY r.slug ORDER BY r.slug`,
      [t.schoolB]
    );
    assert.deepEqual(
      roleRows.map((r) => r.slug),
      ["admin", "director", "librarian", "parent", "staff", "student", "teacher", "vice_principal"]
    );
    for (const r of roleRows) assert.ok(r.perms > 0, `${r.slug} has permissions`);
  });

  it("gives distinct public IDs to users of different schools (FUN-015)", async () => {
    const ids = await rows<{ public_id: string }>(
      db,
      `SELECT public_id FROM public.users WHERE id = ANY($1)`,
      [[t.users.adminA, t.users.adminB]]
    );
    assert.equal(new Set(ids.map((r) => r.public_id)).size, 2);
    assert.ok(ids.some((r) => r.public_id.startsWith("SB")));
  });

  it("rejects duplicate id_prefix across schools", async () => {
    const error = await errorOf(() =>
      db.query(`INSERT INTO public.schools (short_name, full_name, slug, id_prefix) VALUES ('X','X','dup-prefix','SB')`)
    );
    assert.match(error ?? "", /schools_id_prefix_unique/);
  });
});

describe("authorization predicate app.can", () => {
  it("grants own-school permissions from roles", async () => {
    assert.equal(await can(t.users.teacherA, t.schoolA, "grades.enter"), true);
    assert.equal(await can(t.users.studentA, t.schoolA, "grades.enter"), false);
    assert.equal(await can(t.users.librarianA, t.schoolA, "library.publish"), true);
    assert.equal(await can(t.users.librarianA, t.schoolA, "grades.view"), false);
  });

  it("never grants permissions in another school", async () => {
    assert.equal(await can(t.users.adminA, t.schoolB, "users.view"), false);
    assert.equal(await can(t.users.teacherB, t.schoolA, "grades.enter"), false);
  });

  it("gives district admins read-only oversight of their district only", async () => {
    assert.equal(await can(t.users.districtAdmin, t.schoolA, "students.view"), true);
    assert.equal(await can(t.users.districtAdmin, t.schoolA, "audit.view"), true);
    assert.equal(await can(t.users.districtAdmin, t.schoolA, "students.create"), false);
    assert.equal(await can(t.users.districtAdmin, t.schoolB, "students.view"), false);
    assert.equal(await can(t.users.otherDistrictAdmin, t.schoolB, "students.view"), true);
  });

  it("gives the platform super admin every permission everywhere", async () => {
    assert.equal(await can(t.users.superAdmin, t.schoolB, "users.assign_roles"), true);
  });

  it("revokes all access for pending and blocked accounts", async () => {
    assert.equal(await can(t.users.blockedA, t.schoolA, "library.view"), false);
    const access = await asUser(db, t.users.pendingA, (tx) =>
      one<{ a: { permissions: string[] } }>(tx, `SELECT public.get_my_access() AS a`)
    );
    assert.deepEqual(access!.a.permissions, []);
  });
});

describe("users: protected fields and privacy (SEC-004)", () => {
  it("prevents a pending user from activating their own account", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.pendingA, (tx) =>
        tx.query(`UPDATE public.users SET status = 'active', is_active = true WHERE id = $1`, [t.users.pendingA])
      )
    );
    assert.match(error ?? "", /account status/);
  });

  it("prevents a student from changing official name fields", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.studentA, (tx) =>
        tx.query(`UPDATE public.users SET first_name = 'Hacker' WHERE id = $1`, [t.users.studentA])
      )
    );
    assert.match(error ?? "", /official profile fields/);
  });

  it("prevents changing school_id or super admin flag through the API", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) =>
        tx.query(`UPDATE public.users SET is_active = is_active, first_name = first_name WHERE id = $1`, [t.users.studentA]).then(() =>
          tx.query(`UPDATE public.users SET status = status WHERE id = $1`, [t.users.studentA])
        )
      )
    );
    assert.equal(error, null, "no-op updates are allowed");
    const noPrivilege = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.users SET school_id = $1 WHERE id = $2`, [t.schoolB, t.users.studentA]))
    );
    assert.match(noPrivilege ?? "", /permission denied/);
  });

  it("lets a user change their own phone", async () => {
    const updated = await asUser(db, t.users.studentA, (tx) =>
      tx.query(`UPDATE public.users SET phone = '+992111111111' WHERE id = $1`, [t.users.studentA])
    );
    assert.equal(updated.affectedRows, 1);
  });

  it("does not expose email or phone through the directory", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.studentA, (tx) => tx.query(`SELECT email FROM public.users WHERE id = $1`, [t.users.teacherA]))
    );
    assert.match(error ?? "", /permission denied/);
  });

  it("isolates the user directory by school", async () => {
    const visible = await asUser(db, t.users.adminA, (tx) =>
      rows<{ id: string }>(tx, `SELECT id FROM public.users WHERE id = ANY($1)`, [[t.users.adminB, t.users.studentB]])
    );
    assert.equal(visible.length, 0);
  });

  it("blocks API inserts into users", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) =>
        tx.query(`INSERT INTO public.users (id, school_id, email, first_name, last_name) VALUES (gen_random_uuid(), $1, 'x@y.z', 'a', 'b')`, [t.schoolA])
      )
    );
    assert.match(error ?? "", /permission denied/);
  });

  it("admin_search_users returns private fields only for authorized staff of that school", async () => {
    const result = await asUser(db, t.users.adminA, (tx) =>
      rows<{ email: string; total_count: number }>(tx, `SELECT * FROM public.admin_search_users(p_role => 'student')`)
    );
    assert.ok(result.length >= 2);
    assert.ok(result.every((r) => r.email.includes("@")));
    const forbidden = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT * FROM public.admin_search_users()`)));
    assert.match(forbidden ?? "", /forbidden/);
    const crossSchool = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) => tx.query(`SELECT * FROM public.admin_search_users(p_school_id => $1)`, [t.schoolB]))
    );
    assert.match(crossSchool ?? "", /forbidden/);
  });
});

describe("account administration RPCs", () => {
  it("blocks and unblocks with history, but never the actor's own account", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'blocked', 'test')`, [t.users.student2A]));
    const blocked = await one<{ status: string; is_active: boolean }>(db, `SELECT status, is_active FROM public.users WHERE id = $1`, [t.users.student2A]);
    assert.deepEqual(blocked, { status: "blocked", is_active: false });
    const history = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.user_status_history WHERE user_id = $1 AND action = 'blocked'`, [t.users.student2A]);
    assert.equal(history!.n, 1);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'active')`, [t.users.student2A]));

    const self = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'blocked')`, [t.users.adminA])));
    assert.match(self ?? "", /own account/);
  });

  it("forbids teachers and other schools' admins from changing status", async () => {
    const teacher = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'blocked')`, [t.users.studentA])));
    assert.match(teacher ?? "", /forbidden/);
    const otherSchool = await errorOf(() => asUser(db, t.users.adminB, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'blocked')`, [t.users.studentA])));
    assert.match(otherSchool ?? "", /forbidden/);
  });

  it("prevents privilege escalation when assigning roles", async () => {
    const adminRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'admin'`, [t.schoolA]);
    const teacherRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'teacher'`, [t.schoolA]);
    // Director lacks roles.manage/modules.manage, so cannot grant the admin role.
    const escalation = await errorOf(() =>
      asUser(db, t.users.directorA, (tx) => tx.query(`SELECT public.admin_set_user_roles($1, $2)`, [t.users.teacherA, [adminRole!.id]]))
    );
    assert.match(escalation ?? "", /cannot be assigned/);
    // Admin can.
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_roles($1, $2)`, [t.users.teacher2A, [teacherRole!.id]]));
    // Nobody changes their own roles.
    const self = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_roles($1, $2)`, [t.users.adminA, [teacherRole!.id]])));
    assert.match(self ?? "", /own roles/);
  });

  it("does not allow direct user_roles inserts that escalate", async () => {
    const adminRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'admin'`, [t.schoolA]);
    const error = await errorOf(() =>
      asUser(db, t.users.directorA, (tx) =>
        tx.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)`, [t.users.staffA, adminRole!.id, t.schoolA])
      )
    );
    assert.match(error ?? "", /row-level security/);
  });

  it("keeps the school admin role immutable and blocks granting unheld permissions", async () => {
    const adminRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'admin'`, [t.schoolA]);
    const error = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_role_permissions($1, $2)`, [adminRole!.id, ["news.view"]])));
    assert.match(error ?? "", /always has every school permission/);
    const platformPerm = await errorOf(() =>
      asUser(db, t.users.adminA, async (tx) => {
        const role = await one<{ id: string }>(tx, `INSERT INTO public.roles (school_id, slug, name_tg, level) VALUES ($1, 'custom_x', 'Custom', 5) RETURNING id`, [t.schoolA]);
        await tx.query(`SELECT public.admin_set_role_permissions($1, $2)`, [role!.id, ["schools.create"]]);
      })
    );
    assert.match(platformPerm ?? "", /unknown permission/);
  });
});

describe("deactivated administrators (NULL-safe authorization)", () => {
  it("cannot use administrative RPCs after being blocked", async () => {
    const teacherRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'teacher'`, [t.schoolA]);
    const calls: Array<[string, unknown[]]> = [
      [`SELECT public.admin_set_user_status($1, 'blocked')`, [t.users.studentA]],
      [`SELECT public.admin_set_user_roles($1, $2)`, [t.users.staffA, [teacherRole!.id]]],
      [`SELECT * FROM public.admin_search_users()`, []],
      [`SELECT public.import_students('[{"first_name":"a","last_name":"b"}]'::jsonb, false)`, []],
      [`SELECT public.admin_dashboard()`, []],
    ];
    for (const [sql, params] of calls) {
      const error = await errorOf(() => asUser(db, t.users.formerAdminA, (tx) => tx.query(sql, params)));
      assert.ok(error && /forbidden/.test(error), `blocked admin must be refused: ${sql} -> ${error}`);
    }
  });

  it("refuses administrators of an archived school (app.can must not return NULL)", async () => {
    const school = "0000000c-0000-0000-0000-00000000000c";
    await db.query(`INSERT INTO public.schools (id, short_name, full_name, slug, id_prefix) VALUES ($1, 'C', 'School C', 'school-c', 'SC')`, [school]);
    const ids = ["c0000000-0000-4000-8000-000000000001", "c0000000-0000-4000-8000-000000000002"];
    for (const [i, role] of [[0, "admin"], [1, "student"]] as const) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [ids[i], `c${i}@example.test`]);
      await db.query(`INSERT INTO public.users (id, school_id, email, first_name, last_name) VALUES ($1, $2, $3, 'C', 'User')`, [ids[i], school, `c${i}@example.test`]);
      await db.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) SELECT $1, id, school_id FROM public.roles WHERE school_id = $2 AND slug = $3`, [ids[i], school, role]);
    }
    await db.query(`UPDATE public.schools SET status = 'archived' WHERE id = $1`, [school]);
    const error = await errorOf(() => asUser(db, ids[0]!, (tx) => tx.query(`SELECT public.admin_set_user_status($1, 'blocked')`, [ids[1]])));
    assert.match(error ?? "", /forbidden/);
    const can = await asUser(db, ids[0]!, (tx) => one<{ ok: boolean | null }>(tx, `SELECT app.can($1, 'users.deactivate') AS ok`, [school]));
    assert.strictEqual(can!.ok, false);
  });

  it("sees no school data and cannot write through RLS", async () => {
    const users = await asUser(db, t.users.formerAdminA, (tx) => rows(tx, `SELECT id FROM public.users WHERE id <> $1`, [t.users.formerAdminA]));
    assert.equal(users.length, 0);
    const update = await asUser(db, t.users.formerAdminA, (tx) => tx.query(`UPDATE public.schools SET phone = '0' WHERE id = $1`, [t.schoolA]));
    assert.equal(update.affectedRows, 0);
    const adminRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'admin'`, [t.schoolA]);
    const grant = await asUser(db, t.users.formerAdminA, (tx) =>
      one<{ ok: boolean }>(tx, `SELECT app.can_grant_role($1) AS ok`, [adminRole!.id]));
    assert.equal(grant!.ok, false);
    const can = await asUser(db, t.users.formerAdminA, (tx) => one<{ ok: boolean | null }>(tx, `SELECT app.can($1, 'users.view') AS ok`, [t.schoolA]));
    assert.strictEqual(can!.ok, false, "app.can must never return NULL");
  });
});

describe("audit logging (SEC-012)", () => {
  it("records role changes with the real actor", async () => {
    const librarianRole = await one<{ id: string }>(db, `SELECT id FROM public.roles WHERE school_id = $1 AND slug = 'librarian'`, [t.schoolA]);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.admin_set_user_roles($1, $2)`, [t.users.staffA, [librarianRole!.id]]));
    const entries = await rows<{ user_id: string; action: string; school_id: string }>(
      db,
      `SELECT user_id, action, school_id FROM public.audit_logs
       WHERE entity_type = 'user_role' AND user_id = $1 AND (new_values ->> 'user_id' = $2 OR old_values ->> 'user_id' = $2)`,
      [t.users.adminA, t.users.staffA]
    );
    assert.deepEqual(entries.map((e) => e.action).sort(), ["create", "delete"]);
    assert.ok(entries.every((e) => e.school_id === t.schoolA));
  });

  it("stamps actor and school from the session in write_audit_log", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.write_audit_log('export', 'report', NULL, NULL, NULL, '{"k":1}')`));
    const entry = await one<{ user_id: string; school_id: string }>(
      db,
      `SELECT user_id, school_id FROM public.audit_logs WHERE action = 'export' ORDER BY created_at DESC LIMIT 1`
    );
    assert.deepEqual(entry, { user_id: t.users.teacherA, school_id: t.schoolA });
  });

  it("is readable only with audit.view in that school and not writable directly", async () => {
    const teacherView = await asUser(db, t.users.teacherA, (tx) => rows(tx, `SELECT id FROM public.audit_logs`));
    assert.equal(teacherView.length, 0);
    const adminBView = await asUser(db, t.users.adminB, (tx) => rows<{ school_id: string }>(tx, `SELECT school_id FROM public.audit_logs`));
    assert.ok(adminBView.every((r) => r.school_id === t.schoolB));
    const direct = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) => tx.query(`INSERT INTO public.audit_logs (school_id, action, entity_type) VALUES ($1, 'create', 'x')`, [t.schoolA]))
    );
    assert.match(direct ?? "", /permission denied/);
  });
});

describe("schools and platform configuration", () => {
  it("lets a school admin update the profile but not platform-controlled fields", async () => {
    const ok = await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.schools SET phone = '+992 00 000 00 00' WHERE id = $1`, [t.schoolA]));
    assert.equal(ok.affectedRows, 1);
    const prefix = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.schools SET id_prefix = 'ZZ' WHERE id = $1`, [t.schoolA])));
    assert.match(prefix ?? "", /platform administrator/);
    const other = await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.schools SET phone = '1' WHERE id = $1`, [t.schoolB]));
    assert.equal(other.affectedRows, 0);
  });

  it("refuses to disable core modules", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.adminA, (tx) =>
        tx.query(`UPDATE public.school_modules SET is_enabled = false WHERE school_id = $1 AND module_id = (SELECT id FROM public.modules WHERE slug = 'dashboard')`, [t.schoolA])
      )
    );
    assert.match(error ?? "", /core modules/);
  });

  it("exposes only active schools and public identity to anonymous visitors", async () => {
    const schools = await asAnon(db, (tx) => rows<{ slug: string }>(tx, `SELECT slug FROM public.list_public_schools()`));
    assert.ok(schools.some((s) => s.slug === "school-b"));
    const identity = await asAnon(db, (tx) => rows(tx, `SELECT footer_attribution_en FROM public.platform_identity`));
    assert.equal(identity.length, 1);
    const users = await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT id FROM public.users`)));
    assert.match(users ?? "", /permission denied/);
  });
});

describe("function hardening (SEC-006)", () => {
  it("pins search_path on every SECURITY DEFINER function", async () => {
    const unsafe = await rows<{ fn: string }>(
      db,
      `SELECT p.oid::regprocedure::text AS fn
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public', 'app') AND p.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`
    );
    assert.deepEqual(unsafe, []);
  });
});
