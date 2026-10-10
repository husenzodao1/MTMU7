import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let conversation: string;
let elsewhere: string;
let text: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  conversation = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.parentA])))!.id;
  elsewhere = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.studentA])))!.id;
  text = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content) VALUES ($1, $2, $3, 'Homework is on page 12') RETURNING id`,
      [conversation, t.users.teacherA, SCHOOL_A])))!.id;
});
after(async () => {
  await db.close();
});

const path = (conv: string, uploader: string, file: string) => `${SCHOOL_A}/${conv}/${uploader}/${file}`;

describe("files and voice notes", () => {
  it("sends a document as one message with its name, size and type", async () => {
    const row = await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_name, media_size, media_mime)
         VALUES ($1, $2, $3, '', 'file', $4, 'Timetable.pdf', 48213, 'application/pdf') RETURNING id`,
        [conversation, t.users.teacherA, SCHOOL_A, path(conversation, t.users.teacherA, "a.pdf")]));
    const read = await asUser(db, t.users.parentA, (tx) => one<{ media_name: string; media_size: number; media_mime: string }>(tx,
      `SELECT media_name, media_size, media_mime FROM public.get_conversation_messages($1) WHERE id = $2`, [conversation, row!.id]));
    assert.deepEqual(read, { media_name: "Timetable.pdf", media_size: 48213, media_mime: "application/pdf" });
  });

  it("refuses a file with no name, one too large, or one from another conversation", async () => {
    const insert = (conv: string, name: string | null, size: number, file: string) =>
      asUser(db, t.users.teacherA, (tx) => tx.query(
        `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_name, media_size, media_mime)
         VALUES ($1, $2, $3, '', 'file', $4, $5, $6, 'application/pdf')`,
        [conv, t.users.teacherA, SCHOOL_A, path(file === "borrowed" ? elsewhere : conv, t.users.teacherA, "b.pdf"), name, size]));
    assert.match((await errorOf(() => insert(conversation, null, 10, "own"))) ?? "", /messages_media_check/);
    assert.match((await errorOf(() => insert(conversation, "Big.zip", 30 * 1024 * 1024, "own"))) ?? "", /messages_media_check/);
    assert.match((await errorOf(() => insert(conversation, "Other.pdf", 10, "borrowed"))) ?? "", /invalid_media/);
  });

  it("sends a voice note with its length, and lets go of all of it on delete", async () => {
    const row = await asUser(db, t.users.parentA, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_size, media_mime, media_duration)
         VALUES ($1, $2, $3, '', 'audio', $4, 5120, 'audio/webm', 7) RETURNING id`,
        [conversation, t.users.parentA, SCHOOL_A, path(conversation, t.users.parentA, "v.webm")]));
    const swapped = await errorOf(() => asUser(db, t.users.parentA, (tx) =>
      tx.query(`UPDATE public.messages SET media_duration = 99 WHERE id = $1`, [row!.id])));
    assert.match(swapped ?? "", /protected message field/);
    await asUser(db, t.users.parentA, (tx) => tx.query(`UPDATE public.messages SET is_deleted = true WHERE id = $1`, [row!.id]));
    const gone = await one<{ media_path: string | null; media_mime: string | null; media_duration: number | null }>(db,
      `SELECT media_path, media_mime, media_duration FROM public.messages WHERE id = $1`, [row!.id]);
    assert.deepEqual(gone, { media_path: null, media_mime: null, media_duration: null });
  });

  it("says what arrived in the conversation's notification", async () => {
    const note = await one<{ body: string }>(db,
      `SELECT body FROM public.notifications WHERE user_id = $1 AND type = 'message' ORDER BY created_at DESC, body LIMIT 1 OFFSET 0`,
      [t.users.parentA]);
    assert.ok(note, "the parent was told");
    const files = await rows<{ body: string }>(db,
      `SELECT body FROM public.notifications WHERE user_id = $1 AND body LIKE '📎%'`, [t.users.parentA]);
    assert.deepEqual(files.map((r) => r.body), ["📎 Timetable.pdf"]);
  });
});

describe("reactions", () => {
  const react = (userId: string, emoji: string | null, message = text) =>
    asUser(db, userId, (tx) => tx.query(`SELECT public.set_message_reaction($1, $2)`, [message, emoji]));
  const reactionsOf = (userId: string, message = text) =>
    asUser(db, userId, (tx) => one<{ reactions: Array<{ user_id: string; emoji: string }> }>(tx,
      `SELECT reactions FROM public.get_conversation_messages($1) WHERE id = $2`, [conversation, message]));

  it("gives each person one reaction, which they can change and take back", async () => {
    await react(t.users.parentA, "👍");
    await react(t.users.teacherA, "❤️");
    assert.deepEqual((await reactionsOf(t.users.parentA))?.reactions.map((r) => r.emoji).sort(), ["❤️", "👍"].sort());
    await react(t.users.parentA, "🙏");
    assert.deepEqual((await reactionsOf(t.users.teacherA))?.reactions.find((r) => r.user_id === t.users.parentA)?.emoji, "🙏");
    await react(t.users.parentA, null);
    assert.deepEqual((await reactionsOf(t.users.teacherA))?.reactions.map((r) => r.user_id), [t.users.teacherA]);
  });

  it("refuses somebody outside the conversation, and words dressed up as an emoji", async () => {
    assert.match((await errorOf(() => react(t.users.studentA, "👍"))) ?? "", /not_allowed/);
    assert.match((await errorOf(() => react(t.users.parentA, "<b>hi</b>"))) ?? "", /message_reactions_emoji_check/);
    assert.match((await errorOf(() => react(t.users.parentA, "ok"))) ?? "", /message_reactions_emoji_check/);
  });

  it("shows reactions to members only, and cannot be written around the function", async () => {
    const outsider = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT * FROM public.message_reactions`));
    assert.equal(outsider.length, 0);
    const member = await asUser(db, t.users.parentA, (tx) => rows(tx, `SELECT * FROM public.message_reactions`));
    assert.ok(member.length > 0);
    const direct = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(
      `INSERT INTO public.message_reactions (message_id, user_id, conversation_id, school_id, emoji) VALUES ($1, $2, $3, $4, '👍')`,
      [text, t.users.studentA, conversation, SCHOOL_A])));
    assert.match(direct ?? "", /permission denied/);
  });
});

describe("answering from a notification", () => {
  it("writes the reply as the person, and counts it as reading", async () => {
    const reply = await asService(db, (tx) => one<{ id: string }>(tx,
      `SELECT public.reply_from_notification($1, $2, '  Thank you, got it  ') AS id`, [t.users.parentA, conversation]));
    const row = await one<{ sender_id: string; content: string; type: string }>(db,
      `SELECT sender_id, content, type FROM public.messages WHERE id = $1`, [reply!.id]);
    assert.deepEqual(row, { sender_id: t.users.parentA, content: "Thank you, got it", type: "text" });
    const read = await one<{ last_read_at: string | null }>(db,
      `SELECT last_read_at FROM public.conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversation, t.users.parentA]);
    assert.ok(read?.last_read_at);
  });

  it("refuses somebody who is not in the conversation, or is blocked", async () => {
    const outsider = await errorOf(() => asService(db, (tx) =>
      tx.query(`SELECT public.reply_from_notification($1, $2, 'hello')`, [t.users.studentA, conversation])));
    assert.match(outsider ?? "", /not_allowed/);
    await db.query(`INSERT INTO public.user_blocks (blocker_id, blocked_id, school_id) VALUES ($1, $2, $3)`, [t.users.teacherA, t.users.parentA, SCHOOL_A]);
    const blocked = await errorOf(() => asService(db, (tx) =>
      tx.query(`SELECT public.reply_from_notification($1, $2, 'hello')`, [t.users.parentA, conversation])));
    assert.match(blocked ?? "", /not_allowed/);
    await db.query(`DELETE FROM public.user_blocks WHERE blocker_id = $1`, [t.users.teacherA]);
  });

  it("is open to the server alone", async () => {
    const signedIn = await errorOf(() => asUser(db, t.users.parentA, (tx) =>
      tx.query(`SELECT public.reply_from_notification($1, $2, 'hello')`, [t.users.parentA, conversation])));
    assert.match(signedIn ?? "", /permission denied/);
    const marked = await asService(db, (tx) => one<{ ok: boolean | null }>(tx,
      `SELECT public.read_from_notification($1, $2) AS ok`, [t.users.teacherA, conversation]));
    assert.equal(marked?.ok, true);
    const stranger = await asService(db, (tx) => one<{ ok: boolean | null }>(tx,
      `SELECT public.read_from_notification($1, $2) AS ok`, [t.users.studentA, conversation]));
    assert.equal(stranger?.ok, null);
  });
});
