import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let conversation: string;

const TOKEN = "fcm-token-" + "a".repeat(140) + ":APA91b_x-y";
const OTHER = "fcm-token-" + "b".repeat(140);

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  conversation = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.parentA])))!.id;
});
after(async () => {
  await db.close();
});

const save = (userId: string, token: string, platform = "android", locale: string | null = "ru") =>
  asUser(db, userId, (tx) => tx.query(`SELECT public.save_device_token($1, $2, $3)`, [token, platform, locale]));

describe("phones that get notifications from the app", () => {
  it("remembers the signed-in person's phone, and nothing that is not a token", async () => {
    await save(t.users.parentA, TOKEN);
    const mine = await asUser(db, t.users.parentA, (tx) => rows<{ platform: string; locale: string }>(tx, `SELECT platform, locale FROM public.device_tokens`));
    assert.deepEqual(mine, [{ platform: "android", locale: "ru" }]);
    assert.match((await errorOf(() => save(t.users.parentA, "short"))) ?? "", /invalid_device/);
    assert.match((await errorOf(() => save(t.users.parentA, OTHER, "windows"))) ?? "", /invalid_device/);
    assert.match((await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT public.save_device_token($1, 'ios')`, [OTHER])))) ?? "", /permission denied/);
  });

  it("shows nobody else's phones, and cannot be written to directly", async () => {
    const theirs = await asUser(db, t.users.teacherA, (tx) => rows(tx, `SELECT token FROM public.device_tokens`));
    assert.equal(theirs.length, 0);
    const direct = await errorOf(() => asUser(db, t.users.teacherA, (tx) =>
      tx.query(`INSERT INTO public.device_tokens (user_id, school_id, token, platform) VALUES ($1, $2, $3, 'ios')`, [t.users.teacherA, SCHOOL_A, OTHER])));
    assert.match(direct ?? "", /permission denied/);
  });

  it("gives a shared phone to whoever signed in last", async () => {
    await save(t.users.studentA, TOKEN, "android", "tg");
    const owner = await one<{ user_id: string }>(db, `SELECT user_id FROM public.device_tokens WHERE token = $1`, [TOKEN]);
    assert.equal(owner?.user_id, t.users.studentA);
    await save(t.users.parentA, TOKEN);
  });

  it("hands the phone out with the browsers when a message arrives", async () => {
    const message = (await asUser(db, t.users.teacherA, (tx) => one<{ id: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content) VALUES ($1, $2, $3, 'Салом') RETURNING id`,
      [conversation, t.users.teacherA, SCHOOL_A])))!.id;
    const claim = await asService(db, (tx) => one<{ p: { devices: Array<{ token: string; platform: string; locale: string; user_id: string }> } }>(tx,
      `SELECT public.claim_message_push($1) AS p`, [message]));
    assert.deepEqual(claim?.p.devices, [{ token: TOKEN, platform: "android", locale: "ru", user_id: t.users.parentA }]);
  });

  it("forgets a phone on sign-out, and ones Firebase says are gone", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.forget_my_device_token($1)`, [TOKEN]));
    assert.ok(await one(db, `SELECT 1 FROM public.device_tokens WHERE token = $1`, [TOKEN]), "somebody else's token is not theirs to forget");
    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.forget_my_device_token($1)`, [TOKEN]));
    assert.equal(await one(db, `SELECT 1 FROM public.device_tokens WHERE token = $1`, [TOKEN]), undefined);

    await save(t.users.parentA, OTHER, "ios");
    const userCall = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.forget_device_tokens($1)`, [[OTHER]])));
    assert.match(userCall ?? "", /permission denied/);
    const removed = await asService(db, (tx) => one<{ n: number }>(tx, `SELECT public.forget_device_tokens($1) AS n`, [[OTHER]]));
    assert.equal(removed?.n, 1);
  });
});
