import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

/** The account migration 00015 seeds and 00044 repairs: what GoTrue can read. */
const OWNER = "00000000-0000-0000-0000-000000000099";

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

describe("the password the school hands out", () => {
  it("is ten characters a tired secretary can read back", async () => {
    const sample = await rows<{ p: string }>(db, `SELECT app.random_password() AS p FROM generate_series(1, 50)`);
    for (const { p } of sample) {
      assert.match(p, /^[23456789abcdefghijkmnpqrstuvwxyz]{10}$/, p);
    }
    assert.equal(new Set(sample.map((s) => s.p)).size, sample.length, "fifty draws, fifty different passwords");
  });

  it("cannot be asked for through the API", async () => {
    assert.match((await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT app.random_password()`)))) ?? "", /permission denied/);
    assert.match((await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT app.create_login('x@y.tj', 'secret')`)))) ?? "", /permission denied/);
  });
});

describe("an account the platform creates for itself", () => {
  it("is shaped exactly like one GoTrue created", async () => {
    const created = await one<{ id: string }>(db, `SELECT app.create_login('shape.test@maktab.tj', 'parol12345') AS id`);

    // Column-driven on purpose: a column added to auth.users that create_login
    // forgets fails here, rather than in production as an unreadable account.
    const differing = await rows<{ column_name: string }>(
      db,
      `SELECT c.column_name
       FROM information_schema.columns c
       WHERE c.table_schema = 'auth' AND c.table_name = 'users'
         AND c.column_name NOT IN ('id', 'email', 'encrypted_password', 'created_at', 'updated_at',
                                   'last_sign_in_at', 'email_confirmed_at', 'confirmed_at')
         AND (SELECT to_jsonb(n) -> c.column_name FROM auth.users n WHERE n.id = $1)
             IS DISTINCT FROM
             (SELECT to_jsonb(o) -> c.column_name FROM auth.users o WHERE o.id = $2)`,
      [created!.id, OWNER]
    );
    assert.deepEqual(differing.map((d) => d.column_name), [], "every other column must match the account GoTrue can read");
  });

  it("holds a password that verifies, and leaves the address unproved", async () => {
    const created = await one<{ id: string }>(db, `SELECT app.create_login('verify.test@maktab.tj', 'parol12345') AS id`);
    const row = await one<{ ok: boolean; unconfirmed: boolean }>(
      db,
      `SELECT extensions.crypt('parol12345', encrypted_password) = encrypted_password AS ok,
              email_confirmed_at IS NULL AS unconfirmed
       FROM auth.users WHERE id = $1`,
      [created!.id]
    );
    assert.equal(row!.ok, true);
    assert.equal(row!.unconfirmed, true, "the school wrote the address down; the person still has to read it");
    const wrong = await one<{ ok: boolean }>(
      db,
      `SELECT extensions.crypt('wrong-password', encrypted_password) = encrypted_password AS ok FROM auth.users WHERE id = $1`,
      [created!.id]
    );
    assert.equal(wrong!.ok, false);
  });

  it("comes with the email identity GoTrue expects to find", async () => {
    const created = await one<{ id: string }>(db, `SELECT app.create_login('identity.test@maktab.tj', 'parol12345') AS id`);
    const identity = await one<{ provider: string; provider_id: string; verified: boolean }>(
      db,
      `SELECT provider, provider_id, (identity_data ->> 'email_verified')::boolean AS verified
       FROM auth.identities WHERE user_id = $1`,
      [created!.id]
    );
    assert.equal(identity!.provider, "email");
    assert.equal(identity!.provider_id, created!.id);
    assert.equal(identity!.verified, false);
  });

  it("refuses an address that is already somebody's", async () => {
    await db.query(`SELECT app.create_login('taken@maktab.tj', 'parol12345')`);
    assert.match((await errorOf(() => db.query(`SELECT app.create_login('taken@maktab.tj', 'parol12345')`))) ?? "", /duplicate key|unique/i);
  });

  it("refuses something that is not an address at all", async () => {
    assert.equal(await errorOf(() => db.query(`SELECT app.create_login('not-an-address', 'parol12345')`)), "invalid_email");
  });
});

describe("class names as they will be typed", () => {
  it("folds the Latin letters that look like Cyrillic ones", async () => {
    const result = await one<{ a: string; b: string; c: string }>(
      db,
      `SELECT app.normalize_class_name('1a') AS a, app.normalize_class_name(' 1А ') AS b, app.normalize_class_name('11в') AS c`
    );
    assert.equal(result!.a, result!.b, "the Latin A and the Cyrillic А are one class, not two");
    assert.equal(result!.c, "11В");
  });

  it("treats an empty cell as nothing at all", async () => {
    const empty = await one<{ n: string | null }>(db, `SELECT app.normalize_class_name('   ') AS n`);
    assert.equal(empty!.n, null);
  });
});
