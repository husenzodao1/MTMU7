import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

async function customRole(slug: string, permissions: string[]): Promise<string> {
  const role = await one<{ id: string }>(db, `INSERT INTO public.roles (school_id, slug, name_tg, level) VALUES ($1, $2, $2, 5) RETURNING id`, [SCHOOL_A, slug]);
  await db.query(
    `INSERT INTO public.role_permissions (role_id, permission_id) SELECT $1, p.id FROM public.permissions p WHERE p.slug = ANY ($2)`,
    [role!.id, permissions]
  );
  return role!.id;
}

async function userWithRole(roleId: string): Promise<string> {
  const id = newId();
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@example.test`]);
  await db.query(`INSERT INTO public.users (id, school_id, email, first_name, last_name) VALUES ($1, $2, $3, 'Role', 'Manager')`, [id, SCHOOL_A, `${id}@example.test`]);
  await db.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)`, [id, roleId, SCHOOL_A]);
  return id;
}

const slugsOf = (roleId: string) =>
  rows<{ slug: string }>(db, `SELECT p.slug FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1 ORDER BY p.slug`, [roleId]);

describe("delegated role management (00032)", () => {
  let editor: string;
  let target: string;

  before(async () => {
    editor = await userWithRole(await customRole("role_manager", ["roles.view", "roles.manage", "news.view", "events.view"]));
    target = await customRole("club_leader", ["news.view", "library.update"]);
  });

  it("lets an editor change permissions they hold while keeping ones they do not", async () => {
    await asUser(db, editor, (tx) => tx.query(`SELECT public.admin_set_role_permissions($1, $2)`, [target, ["library.update", "events.view"]]));
    assert.deepEqual((await slugsOf(target)).map((r) => r.slug), ["events.view", "library.update"]);
  });

  it("still refuses adding or removing permissions the editor does not hold", async () => {
    const add = await errorOf(() =>
      asUser(db, editor, (tx) => tx.query(`SELECT public.admin_set_role_permissions($1, $2)`, [target, ["library.update", "events.view", "library.archive"]]))
    );
    assert.match(add ?? "", /cannot grant a permission you do not hold/);
    const remove = await errorOf(() => asUser(db, editor, (tx) => tx.query(`SELECT public.admin_set_role_permissions($1, $2)`, [target, ["events.view"]])));
    assert.match(remove ?? "", /cannot revoke a permission you do not hold/);
    assert.deepEqual((await slugsOf(target)).map((r) => r.slug), ["events.view", "library.update"]);
  });
});

describe("admin dashboard", () => {
  it("counts today's attendance by the school's calendar date", async () => {
    const dashboard = await asUser(db, t.users.adminA, (tx) => one<{ d: { attendance_today: Record<string, number> } }>(tx, `SELECT public.admin_dashboard() AS d`));
    assert.ok(dashboard?.d.attendance_today);
    assert.equal(typeof dashboard!.d.attendance_today.students_marked, "number");
  });
});
