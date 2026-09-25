import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, type Tenants, allowSelfRegistrationInTests } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  await allowSelfRegistrationInTests(db);
});
after(async () => {
  await db.close();
});

type NewSchool = { id: string; slug: string };

function createSchool(
  actor: string,
  args: {
    short?: string;
    full?: string;
    slug?: string;
    prefix?: string;
    adminEmail?: string | null;
    photo?: string | null;
    links?: Record<string, string>;
  } = {}
) {
  return asUser(db, actor, (tx) =>
    one<{ r: NewSchool }>(
      tx,
      `SELECT public.create_school($1, $2, $3, $4, $5, $6, NULL, NULL, $7::jsonb) AS r`,
      [
        args.short ?? "Maktab 42",
        args.full ?? "Muassisai tahsiloti miyonai umumii raqami 42",
        args.slug ?? "maktab-42",
        args.prefix ?? "M42",
        args.adminEmail ?? null,
        args.photo ?? null,
        JSON.stringify(args.links ?? {}),
      ]
    )
  );
}

/** A verified address, as Supabase would have left it after the email code. */
async function authUser(email: string): Promise<string> {
  const id = newId();
  await db.query(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, now())`, [id, email]);
  return id;
}

const register = (uid: string, slug: string, role: string | null) =>
  asUser(db, uid, (tx) =>
    one<{ r: { status: string } }>(
      tx,
      `SELECT public.submit_registration($1, 'First', 'Last', NULL, $2, NULL, '{}'::jsonb, NULL) AS r`,
      [slug, role]
    )
  );

describe("creating a school", () => {
  it("is refused to everyone but the platform owner", async () => {
    assert.equal(await errorOf(() => createSchool(t.users.adminA, { slug: "nope-a", prefix: "NA" })), "forbidden");
    assert.equal(await errorOf(() => createSchool(t.users.directorA, { slug: "nope-b", prefix: "NB" })), "forbidden");
    assert.equal(await errorOf(() => createSchool(t.users.studentA, { slug: "nope-c", prefix: "NC" })), "forbidden");
  });

  it("builds the school with its own roles", async () => {
    const created = await createSchool(t.users.superAdmin, { slug: "maktab-42", prefix: "M42" });
    assert.ok(created!.r.id);
    assert.equal(created!.r.slug, "maktab-42");

    // trg_provision_school does the rest, so a new school is usable at once.
    const roles = await db.query<{ slug: string }>(
      `SELECT slug FROM public.roles WHERE school_id = $1 ORDER BY slug`,
      [created!.r.id]
    );
    const slugs = roles.rows.map((r) => r.slug);
    assert.ok(slugs.includes("admin"), `expected an admin role, got ${slugs.join(", ")}`);
    assert.ok(slugs.includes("student"), `expected a student role, got ${slugs.join(", ")}`);

    const perms = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.role_permissions rp
       JOIN public.roles r ON r.id = rp.role_id WHERE r.school_id = $1`,
      [created!.r.id]
    );
    assert.ok(perms.rows[0]!.n > 0, "a new school should inherit role permissions");
  });

  it("refuses a malformed slug, prefix or address, and anything already taken", async () => {
    assert.equal(await errorOf(() => createSchool(t.users.superAdmin, { slug: "Maktab 43", prefix: "M43" })), "invalid_slug");
    assert.equal(await errorOf(() => createSchool(t.users.superAdmin, { slug: "maktab-43", prefix: "toolong" })), "invalid_prefix");
    assert.equal(await errorOf(() => createSchool(t.users.superAdmin, { slug: "maktab-43", prefix: "M43", short: "" })), "invalid_name");
    assert.equal(
      await errorOf(() => createSchool(t.users.superAdmin, { slug: "maktab-43", prefix: "M43", adminEmail: "not-an-address" })),
      "invalid_email"
    );
    assert.equal(await errorOf(() => createSchool(t.users.superAdmin, { slug: "maktab-42", prefix: "M99" })), "slug_taken");
    assert.equal(await errorOf(() => createSchool(t.users.superAdmin, { slug: "maktab-99", prefix: "M42" })), "prefix_taken");
  });

  it("keeps only known social accounts, and only over https", async () => {
    const created = await createSchool(t.users.superAdmin, {
      slug: "maktab-44",
      prefix: "M44",
      links: {
        telegram: "https://t.me/example",
        instagram: "http://instagram.com/example", // not https
        whatsapp: "javascript:alert(1)", // hostile
        tiktok: "https://tiktok.com/@example", // unknown key
      },
    });
    const school = await one<{ social_links: Record<string, string> }>(
      db,
      `SELECT social_links FROM public.schools WHERE id = $1`,
      [created!.r.id]
    );
    assert.deepEqual(school!.social_links, { telegram: "https://t.me/example" });
  });
});

describe("the nominated administrator", () => {
  it("becomes the school's active administrator on registration", async () => {
    const created = await createSchool(t.users.superAdmin, {
      slug: "maktab-50",
      prefix: "M50",
      adminEmail: "Head.Teacher@maktab50.tj", // stored and matched case-insensitively
    });
    const uid = await authUser("head.teacher@maktab50.tj");
    const result = await register(uid, "maktab-50", null);
    assert.equal(result!.r.status, "active");

    const granted = await rows<{ slug: string }>(
      db,
      `SELECT r.slug FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [uid]
    );
    assert.deepEqual(granted.map((r) => r.slug), ["admin"]);

    const school = await one<{ admin_claimed_at: Date | null }>(
      db,
      `SELECT admin_claimed_at FROM public.schools WHERE id = $1`,
      [created!.r.id]
    );
    assert.ok(school!.admin_claimed_at, "the claim should be closed once used");
  });

  it("cannot be claimed twice", async () => {
    await createSchool(t.users.superAdmin, { slug: "maktab-51", prefix: "M51", adminEmail: "boss@maktab51.tj" });
    const first = await authUser("boss@maktab51.tj");
    assert.equal((await register(first, "maktab-51", null))!.r.status, "active");

    // The same address, on a second account. GoTrue holds one account per
    // address, so the only way there is for the first to give the address up —
    // a handover. The claim is spent all the same.
    await db.query(`UPDATE auth.users SET email = 'former.boss@maktab51.tj' WHERE id = $1`, [first]);
    const second = await authUser("boss@maktab51.tj");
    const error = await errorOf(() => register(second, "maktab-51", null));
    assert.ok(error, "a second claim must not silently succeed");
    const granted = await rows(
      db,
      `SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.slug = 'admin'`,
      [second]
    );
    assert.equal(granted.length, 0, "the second account must not receive the admin role");
  });

  it("gives an ordinary applicant no special treatment", async () => {
    await createSchool(t.users.superAdmin, { slug: "maktab-52", prefix: "M52", adminEmail: "boss@maktab52.tj" });
    const uid = await authUser("someone.else@maktab52.tj");
    const result = await register(uid, "maktab-52", "student");
    assert.equal(result!.r.status, "pending");
    const granted = await rows(db, `SELECT 1 FROM public.user_roles WHERE user_id = $1`, [uid]);
    assert.equal(granted.length, 0, "an applicant holds no role until a person approves them");
  });
});
