import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asService, asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let studentLogin: string;
let studentEmail: string;

const LOOKUP_SECRET = "a-server-side-secret-of-at-least-32-chars";

const lookup = (login: string, secret: string | null) =>
  asAnon(db, (tx) => one<{ email: string | null }>(tx, `SELECT public.login_lookup($1, $2) AS email`, [login, secret])).then(
    (r) => r!.email
  );

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  const student = await one<{ public_id: string; email: string }>(db, `SELECT public_id, email FROM public.users WHERE id = $1`, [
    t.users.studentA,
  ]);
  studentLogin = student!.public_id;
  studentEmail = student!.email;
});
after(async () => {
  await db.close();
});

describe("before a secret has been set", () => {
  it("answers nothing, for every login and every secret", async () => {
    assert.equal(await lookup(studentLogin, LOOKUP_SECRET), null);
    assert.equal(await lookup(studentLogin, null), null);
  });
});

describe("setting the secret", () => {
  it("is refused to everyone but the platform itself", async () => {
    assert.equal(
      await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.set_login_secret($1)`, [LOOKUP_SECRET]))),
      "permission denied for function set_login_secret"
    );
    assert.equal(
      await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT public.set_login_secret($1)`, [LOOKUP_SECRET]))),
      "permission denied for function set_login_secret"
    );
  });

  it("refuses a secret short enough to be guessed", async () => {
    assert.equal(await errorOf(() => asService(db, (tx) => tx.query(`SELECT public.set_login_secret('short')`))), "weak_secret");
  });

  it("stores only a digest of it", async () => {
    await asService(db, (tx) => tx.query(`SELECT public.set_login_secret($1)`, [LOOKUP_SECRET]));
    const stored = await one<{ secret_sha256: string }>(db, `SELECT secret_sha256 FROM public.login_secret WHERE id = 1`);
    assert.match(stored!.secret_sha256, /^[0-9a-f]{64}$/);
    assert.ok(!stored!.secret_sha256.includes(LOOKUP_SECRET));
  });
});

describe("looking a login up", () => {
  it("gives the address the school issued the login against", async () => {
    assert.equal(await lookup(studentLogin, LOOKUP_SECRET), studentEmail);
  });

  it("does not care how the login was typed", async () => {
    assert.equal(await lookup(`  ${studentLogin.toLowerCase()} `, LOOKUP_SECRET), studentEmail);
  });

  it("tells a caller without the secret nothing at all", async () => {
    // Not "no such login" and not "wrong secret" — the same silence for both,
    // so the sequence MT10001, MT10002, … yields no addresses.
    assert.equal(await lookup(studentLogin, "wrong-secret-but-also-at-least-32-chars"), null);
    assert.equal(await lookup(studentLogin, ""), null);
    assert.equal(await lookup(studentLogin, null), null);
  });

  it("answers nothing for a login nobody holds", async () => {
    assert.equal(await lookup("MT99999", LOOKUP_SECRET), null);
  });

  it("answers nothing for an account that may not sign in", async () => {
    for (const userId of [t.users.blockedA, t.users.pendingA]) {
      const login = await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE id = $1`, [userId]);
      const status = await one<{ status: string; is_active: boolean }>(
        db,
        `SELECT status, is_active FROM public.users WHERE id = $1`,
        [userId]
      );
      const usable = status!.is_active && !["blocked", "rejected"].includes(status!.status);
      assert.equal(await lookup(login!.public_id, LOOKUP_SECRET), usable ? studentEmail : null, `login for ${status!.status}`);
    }
  });
});

describe("vouching for an address nobody can reach", () => {
  it("is refused to someone who may not edit accounts", async () => {
    assert.equal(
      await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.confirm_account($1)`, [t.users.student2A]))),
      "forbidden"
    );
    assert.equal(
      await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.confirm_account($1)`, [t.users.studentA]))),
      "forbidden"
    );
  });

  it("is refused across schools", async () => {
    assert.equal(
      await errorOf(() => asUser(db, t.users.adminB, (tx) => tx.query(`SELECT public.confirm_account($1)`, [t.users.studentA]))),
      "forbidden"
    );
  });

  it("marks the address confirmed and says who did it", async () => {
    await db.query(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1`, [t.users.student2A]);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.confirm_account($1)`, [t.users.student2A]));
    const row = await one<{ confirmed: boolean }>(db, `SELECT email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE id = $1`, [
      t.users.student2A,
    ]);
    assert.equal(row!.confirmed, true);
    const audit = await one<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.audit_logs WHERE action = 'confirm_account' AND entity_id = $1`,
      [t.users.student2A]
    );
    assert.equal(audit!.n, "1");
  });
});

describe("the session snapshot", () => {
  it("says whether the address has been proved", async () => {
    await db.query(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1`, [t.users.studentA]);
    const unproved = await asUser(db, t.users.studentA, (tx) =>
      one<{ a: { user: { email_verified: boolean } } }>(tx, `SELECT public.get_my_access() AS a`)
    );
    assert.equal(unproved!.a.user.email_verified, false);

    await db.query(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1`, [t.users.studentA]);
    const proved = await asUser(db, t.users.studentA, (tx) =>
      one<{ a: { user: { email_verified: boolean } } }>(tx, `SELECT public.get_my_access() AS a`)
    );
    assert.equal(proved!.a.user.email_verified, true);
  });
});

describe("signing in with a nickname", () => {
  it("finds the account the nickname belongs to", async () => {
    await db.query(`UPDATE public.users SET nickname = 'ali_k' WHERE id = $1`, [t.users.studentA]);
    assert.equal(await lookup("ali_k", LOOKUP_SECRET), studentEmail);
    assert.equal(await lookup("  ALI_K ", LOOKUP_SECRET), studentEmail, "typed as it was remembered, not as it was stored");
  });

  it("still answers nothing without the secret", async () => {
    assert.equal(await lookup("ali_k", "wrong-secret-but-also-at-least-32-chars"), null);
  });

  it("answers nothing when two schools use the same nickname", async () => {
    // A nickname is unique inside a school, not across the platform. Picking
    // one of two people would sign somebody into the wrong account.
    await db.query(`UPDATE public.users SET nickname = 'ali_k' WHERE id = $1`, [t.users.studentB]);
    assert.equal(await lookup("ali_k", LOOKUP_SECRET), null);
    await db.query(`UPDATE public.users SET nickname = NULL WHERE id = $1`, [t.users.studentB]);
  });

  it("answers nothing for a blocked account", async () => {
    await db.query(`UPDATE public.users SET nickname = 'blocked_one' WHERE id = $1`, [t.users.blockedA]);
    assert.equal(await lookup("blocked_one", LOOKUP_SECRET), null);
  });
});
