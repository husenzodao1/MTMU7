import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, SCHOOL_B, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

const direct = (from: string, to: string) =>
  asUser(db, from, (tx) => one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [to])).then((r) => r!.id);

const post = (userId: string, conversationId: string, content: string) =>
  asUser(db, userId, (tx) =>
    one<{ id: string }>(tx, `INSERT INTO public.messages (conversation_id, sender_id, school_id, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [conversationId, userId, SCHOOL_A, content])).then((r) => r!.id);

const KEY = "B".repeat(87);
const AUTH = "a".repeat(22);

describe("sending a place", () => {
  let conversation: string;
  let placeId: string;

  before(async () => {
    conversation = await direct(t.users.teacherA, t.users.studentA);
  });

  it("goes through for a member, where it used to be rewritten into text and refused", async () => {
    const row = await asUser(db, t.users.teacherA, (tx) => one<{ id: string; type: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, location_lat, location_lng)
       VALUES ($1, $2, $3, 'back gate', 'location', 40.0, 69.0) RETURNING id, type`,
      [conversation, t.users.teacherA, SCHOOL_A]));
    assert.equal(row?.type, "location");
    placeId = row!.id;
    const seen = await asUser(db, t.users.studentA, (tx) => one<{ location_lat: string }>(tx,
      `SELECT location_lat FROM public.get_conversation_messages($1) WHERE id = $2`, [conversation, placeId]));
    assert.equal(Number(seen?.location_lat), 40);
  });

  it("still refuses coordinates on a text message, and a type nobody knows", async () => {
    const text = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, location_lat, location_lng)
       VALUES ($1, $2, $3, 'x', 'sticker', 40.0, 69.0)`, [conversation, t.users.teacherA, SCHOOL_A])));
    assert.match(text ?? "", /messages_location_check/);
  });

  it("cannot be moved afterwards", async () => {
    const moved = await errorOf(() => asUser(db, t.users.teacherA, (tx) =>
      tx.query(`UPDATE public.messages SET location_lat = 41 WHERE id = $1`, [placeId])));
    assert.match(moved ?? "", /protected message field/);
  });

  it("takes the place with it when deleted", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.messages SET is_deleted = true WHERE id = $1`, [placeId]));
    const row = await one<{ location_lat: string | null; type: string }>(db,
      `SELECT location_lat, type FROM public.messages WHERE id = $1`, [placeId]);
    assert.equal(row?.location_lat, null);
    assert.equal(row?.type, "location");
  });
});

describe("web push", () => {
  let conversation: string;

  before(async () => {
    conversation = await direct(t.users.teacherA, t.users.parentA);
  });

  it("keeps a device for the person who said yes, and refuses nonsense", async () => {
    await asUser(db, t.users.parentA, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3, 'ru')`, ["https://push.example.test/parent-1", KEY, AUTH]));
    const bad = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3)`, ["http://insecure.example.test/x", KEY, AUTH])));
    assert.match(bad ?? "", /invalid_subscription/);
    const anon = await errorOf(() => asAnon(db, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3)`, ["https://push.example.test/anon", KEY, AUTH])));
    assert.match(anon ?? "", /permission denied/);
    const direct = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(
      `INSERT INTO public.push_subscriptions (user_id, school_id, endpoint, p256dh, auth) VALUES ($1, $2, 'https://x.test/y', $3, $4)`,
      [t.users.parentA, SCHOOL_A, KEY, AUTH])));
    assert.match(direct ?? "", /permission denied/);
  });

  it("moves a shared device to whoever signed in last", async () => {
    await asUser(db, t.users.studentA, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3)`, ["https://push.example.test/shared", KEY, AUTH]));
    await asUser(db, t.users.teacher2A, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3)`, ["https://push.example.test/shared", KEY, AUTH]));
    const owner = await one<{ user_id: string }>(db, `SELECT user_id FROM public.push_subscriptions WHERE endpoint = 'https://push.example.test/shared'`);
    assert.equal(owner?.user_id, t.users.teacher2A);
    const theirs = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT id FROM public.push_subscriptions`));
    assert.equal(theirs.length, 0);
  });

  it("tells the server who to reach, once, and never the sender", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(
      `SELECT public.save_push_subscription($1, $2, $3)`, ["https://push.example.test/teacher", KEY, AUTH]));
    const message = await post(t.users.teacherA, conversation, "Parents' meeting at five");

    const userCall = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.claim_message_push($1)`, [message])));
    assert.match(userCall ?? "", /permission denied/);

    const first = await asService(db, (tx) => one<{ p: { targets: Array<{ endpoint: string; locale: string }>; sender: string; preview: string } }>(tx,
      `SELECT public.claim_message_push($1) AS p`, [message]));
    assert.deepEqual(first?.p.targets.map((x) => x.endpoint), ["https://push.example.test/parent-1"]);
    assert.equal(first?.p.targets[0]?.locale, "ru");
    assert.equal(first?.p.preview, "Parents' meeting at five");
    assert.match(first?.p.sender ?? "", /teacherA/);

    const again = await asService(db, (tx) => one<{ p: unknown }>(tx, `SELECT public.claim_message_push($1) AS p`, [message]));
    assert.equal(again?.p, null);
  });

  it("stays quiet for a muted conversation", async () => {
    await asUser(db, t.users.parentA, (tx) => tx.query(
      `UPDATE public.conversation_members SET is_muted = true WHERE conversation_id = $1 AND user_id = $2`, [conversation, t.users.parentA]));
    const message = await post(t.users.teacherA, conversation, "muted");
    const claim = await asService(db, (tx) => one<{ p: { targets: unknown[] } }>(tx, `SELECT public.claim_message_push($1) AS p`, [message]));
    assert.equal(claim?.p.targets.length, 0);
  });

  it("forgets endpoints the push service has given up on", async () => {
    const n = await asService(db, (tx) => one<{ n: number }>(tx,
      `SELECT public.forget_push_endpoints(ARRAY['https://push.example.test/parent-1']) AS n`));
    assert.equal(n?.n, 1);
  });
});

describe("online support", () => {
  let conversation: string;

  before(async () => {
    // Asking the school for help is not a messaging privilege: take it away
    // from parents altogether and the desk must still be reachable.
    await db.query(
      `DELETE FROM public.role_permissions rp USING public.roles r, public.permissions p
       WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.school_id = $1 AND r.slug = 'parent' AND p.slug = 'messages.use'`,
      [SCHOOL_A]);
  });

  it("gives each person one conversation with the desk, however often they ask", async () => {
    conversation = (await asUser(db, t.users.parentA, (tx) => one<{ id: string }>(tx, `SELECT public.open_support_conversation() AS id`)))!.id;
    const again = await asUser(db, t.users.parentA, (tx) => one<{ id: string }>(tx, `SELECT public.open_support_conversation() AS id`));
    assert.equal(again?.id, conversation);
    const members = await rows<{ user_id: string }>(db,
      `SELECT user_id FROM public.conversation_members WHERE conversation_id = $1`, [conversation]);
    const ids = members.map((m) => m.user_id);
    assert.ok(ids.includes(t.users.parentA));
    assert.ok(ids.includes(t.users.adminA), "the administrator is on the desk");
    assert.ok(ids.includes(t.users.directorA), "so is the director");
    assert.ok(!ids.includes(t.users.teacherA), "a teacher is not");
    assert.ok(!ids.includes(t.users.formerAdminA), "nor an administrator who has left");
    assert.ok(!ids.includes(t.users.adminB), "nor another school's");
  });

  it("lets them write to it without the messaging permission", async () => {
    await post(t.users.parentA, conversation, "I cannot find my child's marks");
    const reply = await post(t.users.adminA, conversation, "Open Grades in the menu");
    assert.ok(reply);
    // ...and only to it.
    const other = await direct(t.users.teacherA, t.users.studentA);
    const intrusion = await errorOf(() => post(t.users.parentA, other, "hello"));
    assert.match(intrusion ?? "", /row-level security|Cross-school/);
  });

  it("shows the desk an inbox, and nobody else", async () => {
    await post(t.users.parentA, conversation, "Thank you");
    const inbox = await asUser(db, t.users.directorA, (tx) => rows<{ id: string; awaiting_reply: boolean; requester_id: string; unread_count: string }>(tx,
      `SELECT * FROM public.list_support_inbox()`));
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.requester_id, t.users.parentA);
    assert.equal(inbox[0]?.awaiting_reply, true);
    assert.equal(Number(inbox[0]?.unread_count), 1);
    for (const outsider of [t.users.teacherA, t.users.parentA]) {
      const refused = await errorOf(() => asUser(db, outsider, (tx) => tx.query(`SELECT * FROM public.list_support_inbox()`)));
      assert.match(refused ?? "", /forbidden/, outsider);
    }
    // Another school's desk sees its own inbox, which has nothing of ours in it.
    const elsewhere = await asUser(db, t.users.adminB, (tx) => rows(tx, `SELECT * FROM public.list_support_inbox()`));
    assert.equal(elsewhere.length, 0);
  });

  it("lists who opened it, so each side can title it", async () => {
    const list = await asUser(db, t.users.parentA, (tx) => rows<{ type: string; created_by: string }>(tx,
      `SELECT type, created_by FROM public.list_my_conversations()`));
    const support = list.find((c) => c.type === "support");
    assert.equal(support?.created_by, t.users.parentA);
  });

  it("brings in somebody who joins the desk later, on the next message", async () => {
    await db.query(
      `INSERT INTO public.user_roles (user_id, role_id, school_id)
       SELECT $1, r.id, r.school_id FROM public.roles r WHERE r.school_id = $2 AND r.slug = 'admin'`,
      [t.users.staffA, SCHOOL_A]);
    await post(t.users.parentA, conversation, "Anyone?");
    const joined = await one(db, `SELECT 1 FROM public.conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversation, t.users.staffA]);
    assert.ok(joined);
  });

  it("takes a note from a visitor, within limits, and lets the desk close it", async () => {
    const id = await asAnon(db, (tx) => one<{ id: string }>(tx,
      `SELECT public.submit_support_request($1, 'Guest', '+992 900 000 000', 'My email was not accepted') AS id`, [SCHOOL_A]));
    assert.ok(id?.id);
    await asAnon(db, (tx) => tx.query(`SELECT public.submit_support_request($1, 'Guest', '+992 900 000 000', 'again')`, [SCHOOL_A]));
    await asAnon(db, (tx) => tx.query(`SELECT public.submit_support_request($1, 'Guest', '+992 900 000 000', 'and again')`, [SCHOOL_A]));
    const flood = await errorOf(() => asAnon(db, (tx) => tx.query(
      `SELECT public.submit_support_request($1, 'Guest', '+992 900 000 000', 'fourth')`, [SCHOOL_A])));
    assert.match(flood ?? "", /rate_limited/);

    const empty = await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT public.submit_support_request($1, '', 'x', '')`, [SCHOOL_A])));
    assert.match(empty ?? "", /invalid_request/);

    const anonRead = await asAnon(db, (tx) => rows(tx, `SELECT id FROM public.support_requests`).catch(() => []));
    assert.equal(anonRead.length, 0);
    const teacherRead = await asUser(db, t.users.teacherA, (tx) => rows(tx, `SELECT id FROM public.support_requests`));
    assert.equal(teacherRead.length, 0);
    const otherSchool = await asUser(db, t.users.adminB, (tx) => rows(tx, `SELECT id FROM public.support_requests`));
    assert.equal(otherSchool.length, 0);
    const desk = await asUser(db, t.users.adminA, (tx) => rows(tx, `SELECT id FROM public.support_requests`));
    assert.equal(desk.length, 3);

    const notified = await one<{ n: string }>(db,
      `SELECT count(*) AS n FROM public.notifications WHERE user_id = $1 AND template_key = 'support.request'`, [t.users.adminA]);
    assert.ok(Number(notified?.n) >= 1);

    const refused = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.resolve_support_request($1, true)`, [id!.id])));
    assert.match(refused ?? "", /forbidden/);
    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.resolve_support_request($1, true)`, [id!.id]));
    const done = await one<{ status: string }>(db, `SELECT status FROM public.support_requests WHERE id = $1`, [id!.id]);
    assert.equal(done?.status, "done");
  });

  it("refuses a note to a school that does not exist", async () => {
    const unknown = await errorOf(() => asAnon(db, (tx) => tx.query(
      `SELECT public.submit_support_request('00000000-0000-4000-8000-00000000dead', 'a', 'bcd', 'e')`)));
    assert.match(unknown ?? "", /unknown_school/);
    void SCHOOL_B;
  });
});
