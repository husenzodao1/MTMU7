import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";
import { seedAcademic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let academic: Awaited<ReturnType<typeof seedAcademic>>;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  academic = await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const phoneOf = async (userId: string) =>
  (await one<{ phone: string }>(db, `SELECT phone FROM public.users WHERE id = $1`, [userId]))!.phone;

const seen = (actor: string, target: string) =>
  asUser(db, actor, (tx) => one<{ phone: string | null }>(tx, `SELECT public.contact_phone($1) AS phone`, [target])).then((r) => r!.phone);

const found = (actor: string, query: string) =>
  asUser(db, actor, (tx) => rows<{ id: string; phone: string | null }>(tx, `SELECT id, phone FROM public.search_people($1)`, [query]));

describe("WhatsApp numbers (00099)", () => {
  it("gives the staff a pupil's number, by profile and by search", async () => {
    assert.equal(await seen(t.users.teacherA, t.users.studentA), await phoneOf(t.users.studentA));
    const hits = await found(t.users.teacherA, "studentA");
    assert.equal(hits.find((h) => h.id === t.users.studentA)?.phone, await phoneOf(t.users.studentA));
  });

  it("gives a parent their own child's number and nobody else's child's", async () => {
    assert.equal(await seen(t.users.parentA, t.users.studentA), await phoneOf(t.users.studentA));
    assert.equal(await seen(t.users.parentA, t.users.student2A), null);
    const hits = await found(t.users.parentA, "student2A");
    const other = hits.find((h) => h.id === t.users.student2A);
    assert.ok(other, "the pupil is still found by name");
    assert.equal(other.phone, null, "but without their number");
  });

  it("gives a pupil their teacher's number", async () => {
    assert.equal(await seen(t.users.student2A, t.users.teacherA), await phoneOf(t.users.teacherA));
  });

  it("stays inside the school, and gives nothing for accounts that are not active", async () => {
    assert.equal(await seen(t.users.teacherA, t.users.studentB), null);
    assert.equal(await seen(t.users.teacherA, t.users.pendingA), null);
    const hits = await found(t.users.teacherA, "studentB");
    assert.ok(!hits.some((h) => h.id === t.users.studentB));
  });

  it("finds a person by the portal number on their card", async () => {
    const card = (await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE id = $1`, [t.users.teacher2A]))!;
    const hits = await found(t.users.parentA, card.public_id.toLowerCase());
    assert.deepEqual(hits.map((h) => h.id), [t.users.teacher2A]);
  });

  it("falls back to the number an import wrote on the parent's record", async () => {
    await db.query(`UPDATE public.users SET phone = NULL WHERE id = $1`, [t.users.parentA]);
    await db.query(`UPDATE public.guardians SET phone = '+992 93 555 0101' WHERE user_id = $1`, [t.users.parentA]);
    assert.equal(await seen(t.users.teacherA, t.users.parentA), "+992 93 555 0101");
  });

  it("is not open to somebody signed out", async () => {
    const error = await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT public.contact_phone($1)`, [t.users.teacherA])));
    assert.match(error ?? "", /permission denied/);
  });
});

/**
 * 00101: pupils reach pupils, and a boy reaches a girl of another class only
 * when the school says so. studentA sits in 9A, student2A in 9B.
 */
describe("pupils reaching pupils (00101)", () => {
  const gender = (user: string, value: string | null) => db.query(`UPDATE public.students SET gender = $2 WHERE user_id = $1`, [user, value]);
  const rule = (actor: string, target: string) =>
    asUser(db, actor, (tx) => one<{ card: { rule: string; phone: string | null; request: string | null } }>(tx, `SELECT public.contact_card($1) AS card`, [target])).then((r) => r!.card);
  const ask = (actor: string, target: string) =>
    asUser(db, actor, (tx) => one<{ status: string }>(tx, `SELECT public.ask_contact_permission($1) AS status`, [target])).then((r) => r!.status);
  const searched = (actor: string, query: string) =>
    asUser(db, actor, (tx) => rows<{ id: string; phone: string | null; contact: string }>(tx, `SELECT id, phone, contact FROM public.find_people($1)`, [query]));

  it("lets a boy reach a boy and a girl reach anyone", async () => {
    await gender(t.users.studentA, "male");
    await gender(t.users.student2A, "male");
    assert.deepEqual(await rule(t.users.student2A, t.users.studentA), { rule: "open", phone: await phoneOf(t.users.studentA), request: null, accounts: [] });
    await gender(t.users.student2A, "female");
    assert.equal((await rule(t.users.student2A, t.users.studentA)).rule, "open", "girl to boy");
    await gender(t.users.studentA, "female");
    assert.equal((await rule(t.users.student2A, t.users.studentA)).rule, "open", "girl to girl");
  });

  it("asks the school before a boy reaches a girl of another class", async () => {
    await gender(t.users.studentA, "female");
    await gender(t.users.student2A, "male");
    assert.deepEqual(await rule(t.users.student2A, t.users.studentA), { rule: "ask", phone: null, request: null, accounts: [] });
    const hit = (await searched(t.users.student2A, "studentA")).find((h) => h.id === t.users.studentA);
    assert.deepEqual(hit && { phone: hit.phone, contact: hit.contact }, { phone: null, contact: "ask" });
    // A boy whose gender was never recorded is asked the same.
    await gender(t.users.student2A, null);
    assert.equal((await rule(t.users.student2A, t.users.studentA)).rule, "ask");
    // A girl who gave no number and no account: nothing to ask for.
    const phone = await phoneOf(t.users.studentA);
    await db.query(`UPDATE public.users SET phone = NULL WHERE id = $1`, [t.users.studentA]);
    try {
      assert.equal((await rule(t.users.student2A, t.users.studentA)).rule, "none");
      const error = await errorOf(() => asUser(db, t.users.student2A, (tx) => tx.query(`SELECT public.ask_contact_permission($1)`, [t.users.studentA])));
      assert.match(error ?? "", /forbidden/);
    } finally {
      await db.query(`UPDATE public.users SET phone = $2 WHERE id = $1`, [t.users.studentA, phone]);
    }
  });

  it("lets the desk say yes, and then the number is there", async () => {
    await gender(t.users.studentA, "female");
    await gender(t.users.student2A, "male");
    assert.equal(await ask(t.users.student2A, t.users.studentA), "pending");
    assert.equal(await ask(t.users.student2A, t.users.studentA), "pending", "asking twice keeps one request");
    assert.equal((await rule(t.users.student2A, t.users.studentA)).request, "pending");
    const told = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE template_key = 'contact.request'`);
    assert.ok(told!.n >= 1, "the desk is told");

    const request = (await one<{ id: string }>(db, `SELECT id FROM public.contact_permissions WHERE requester_id = $1`, [t.users.student2A]))!;
    const refused = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.decide_contact_permission($1, true)`, [request.id])));
    assert.match(refused ?? "", /forbidden/, "a teacher without the desk's permission cannot decide");
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.decide_contact_permission($1, true)`, [request.id]));
    assert.deepEqual(await rule(t.users.student2A, t.users.studentA), { rule: "open", phone: await phoneOf(t.users.studentA), request: "approved", accounts: [] });
    const answered = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = $1 AND template_key = 'contact.approved'`, [t.users.student2A]);
    assert.equal(answered!.n, 1, "the pupil who asked is told");
  });

  it("opens the girls of one's own class without asking", async () => {
    await db.query(`DELETE FROM public.contact_permissions`);
    await gender(t.users.studentA, "female");
    await gender(t.users.student2A, "male");
    await db.query(`UPDATE public.enrollments SET class_id = $1 WHERE student_id = $2`, [academic.class9A, academic.students.student2A]);
    try {
      assert.equal((await rule(t.users.student2A, t.users.studentA)).rule, "open");
    } finally {
      await db.query(`UPDATE public.enrollments SET class_id = $1 WHERE student_id = $2`, [academic.class9B, academic.students.student2A]);
    }
  });

  it("refuses a request where there is nothing to ask, and keeps a parent out as before", async () => {
    await gender(t.users.studentA, "male");
    assert.equal(await ask(t.users.student2A, t.users.studentA), "approved", "already open");
    const error = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.ask_contact_permission($1)`, [t.users.student2A])));
    assert.match(error ?? "", /forbidden/);
    assert.equal((await rule(t.users.parentA, t.users.student2A)).rule, "none");
  });
});

describe("accounts on a profile (00101)", () => {
  it("are written by their owner only and shown by the same rule as the number", async () => {
    await asUser(db, t.users.studentA, (tx) =>
      tx.query(`INSERT INTO public.user_social_accounts (user_id, school_id, platform, handle) VALUES ($1, $2, 'instagram', 'student.a')`, [t.users.studentA, t.schoolA])
    );
    const forged = await errorOf(() =>
      asUser(db, t.users.student2A, (tx) =>
        tx.query(`INSERT INTO public.user_social_accounts (user_id, school_id, platform, handle) VALUES ($1, $2, 'telegram', 'x')`, [t.users.studentA, t.schoolA])
      )
    );
    assert.match(forged ?? "", /row-level security/);
    const bad = await errorOf(() =>
      asUser(db, t.users.studentA, (tx) =>
        tx.query(`INSERT INTO public.user_social_accounts (user_id, school_id, platform, handle) VALUES ($1, $2, 'telegram', 'javascript:alert(1)')`, [t.users.studentA, t.schoolA])
      )
    );
    assert.match(bad ?? "", /handle_check/);
    const card = (actor: string) =>
      asUser(db, actor, (tx) => one<{ card: { accounts: unknown[] } }>(tx, `SELECT public.contact_card($1) AS card`, [t.users.studentA])).then((r) => r!.card.accounts);
    assert.deepEqual(await card(t.users.teacherA), [{ platform: "instagram", handle: "student.a" }]);
    assert.deepEqual(await card(t.users.parentA), [{ platform: "instagram", handle: "student.a" }], "the pupil's own parent");
    const direct = await asUser(db, t.users.teacherA, (tx) => rows(tx, `SELECT * FROM public.user_social_accounts WHERE user_id = $1`, [t.users.studentA]));
    assert.equal(direct.length, 0, "never read straight from the table");
  });
});
