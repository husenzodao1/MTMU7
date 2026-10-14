import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let direct: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  direct = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.parentA])))!.id;
});
after(async () => {
  await db.close();
});

const send = (userId: string, conversation: string, content: string) =>
  asUser(db, userId, (tx) =>
    one<{ id: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [conversation, userId, SCHOOL_A, content]));

const listed = (userId: string, conversation: string) =>
  asUser(db, userId, (tx) =>
    one<{ peer_read_at: string | null; peer_delivered_at: string | null; my_role: string; member_count: number }>(tx,
      `SELECT peer_read_at, peer_delivered_at, my_role, member_count::int FROM public.list_my_conversations(50) WHERE id = $1`,
      [conversation]));

describe("delivered, then read", () => {
  it("moves a message from sent to delivered when the other side's portal reports in, then to read", async () => {
    await send(t.users.teacherA, direct, "The trip is on Friday");
    const sent = await listed(t.users.teacherA, direct);
    assert.equal(sent?.peer_delivered_at, null);
    assert.equal(sent?.peer_read_at, null);

    const moved = await asUser(db, t.users.parentA, (tx) => one<{ n: number }>(tx, `SELECT public.touch_messenger() AS n`));
    assert.equal(moved?.n, 1);
    const delivered = await listed(t.users.teacherA, direct);
    assert.ok(delivered?.peer_delivered_at, "the parent's phone has it");
    assert.equal(delivered?.peer_read_at, null);

    const again = await asUser(db, t.users.parentA, (tx) => one<{ n: number }>(tx, `SELECT public.touch_messenger() AS n`));
    assert.equal(again?.n, 0, "nothing new: nothing written");

    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.mark_conversation_read($1)`, [direct]));
    const read = await listed(t.users.teacherA, direct);
    assert.ok(read?.peer_read_at, "and has read it");
  });

  it("cannot be written around the function", async () => {
    const error = await errorOf(() => asUser(db, t.users.parentA, (tx) =>
      tx.query(`UPDATE public.conversation_members SET last_delivered_at = now() WHERE user_id = $1`, [t.users.parentA])));
    assert.match(error ?? "", /permission denied/);
  });

  it("shows when somebody was last here only to people who share a conversation with them", async () => {
    const teacher = await asUser(db, t.users.teacherA, (tx) =>
      rows(tx, `SELECT user_id FROM public.user_presence WHERE user_id = $1`, [t.users.parentA]));
    assert.equal(teacher.length, 1);
    const stranger = await asUser(db, t.users.student2A, (tx) =>
      rows(tx, `SELECT user_id FROM public.user_presence WHERE user_id = $1`, [t.users.parentA]));
    assert.equal(stranger.length, 0);
  });
});

describe("channels", () => {
  let channel: string;

  it("opens a channel for staff, and not for a pupil the school has not allowed", async () => {
    channel = (await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx, `SELECT public.create_channel('  Science club  ', 'Experiments every week') AS id`)))!.id;
    const row = await one<{ type: string; name: string; description: string }>(db,
      `SELECT type, name, description FROM public.conversations WHERE id = $1`, [channel]);
    assert.deepEqual(row, { type: "channel", name: "Science club", description: "Experiments every week" });
    const pupil = await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.create_channel('Mine')`)));
    assert.match(pupil ?? "", /channel_creation_not_allowed/);
  });

  it("lists the school's channels to anybody who may message, followed or not", async () => {
    const seen = await asUser(db, t.users.studentA, (tx) =>
      rows<{ id: string; is_member: boolean; followers: number }>(tx, `SELECT id, is_member, followers::int FROM public.list_school_channels()`));
    assert.deepEqual(seen.map((c) => [c.id, c.is_member, c.followers]), [[channel, false, 1]]);
    const elsewhere = await asUser(db, t.users.teacherB, (tx) => rows(tx, `SELECT id FROM public.list_school_channels()`));
    assert.equal(elsewhere.length, 0);
    const named = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT id FROM public.list_school_channels('scien')`));
    assert.equal(named.length, 1);
    const none = await asUser(db, t.users.studentA, (tx) => rows(tx, `SELECT id FROM public.list_school_channels('%')`));
    assert.equal(none.length, 0, "a wildcard is a letter, not a wildcard");
  });

  it("lets a follower read and react but not post; its admin posts", async () => {
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.join_channel($1)`, [channel]));
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.join_channel($1)`, [channel]));
    const follower = await errorOf(() => send(t.users.studentA, channel, "hello"));
    assert.match(follower ?? "", /only channel administrators/);
    const post = await send(t.users.teacherA, channel, "Tomorrow: crystals");
    const read = await asUser(db, t.users.studentA, (tx) =>
      rows<{ id: string }>(tx, `SELECT id FROM public.get_conversation_messages($1)`, [channel]));
    assert.deepEqual(read.map((r) => r.id), [post!.id]);
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.set_message_reaction($1, '🔥')`, [post!.id]));
    const listedForFollower = await listed(t.users.studentA, channel);
    assert.equal(listedForFollower?.my_role, "member");
    assert.equal(listedForFollower?.member_count, 2);
  });

  it("closes when the last of its admins leaves, instead of handing it to a follower", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.remove_conversation_member($1, $2)`, [channel, t.users.teacherA]));
    const row = await one<{ is_active: boolean }>(db, `SELECT is_active FROM public.conversations WHERE id = $1`, [channel]);
    assert.equal(row?.is_active, false);
    const follower = await one<{ role: string }>(db,
      `SELECT role FROM public.conversation_members WHERE conversation_id = $1 AND user_id = $2`, [channel, t.users.studentA]);
    assert.equal(follower?.role, "member");
  });
});

describe("stories", () => {
  let story: string;

  it("posts a story for a day from now, whatever the browser asked for", async () => {
    story = (await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx,
        `INSERT INTO public.stories (school_id, author_id, kind, caption, background, expires_at)
         VALUES ($1, $2, 'text', 'Good morning, class!', 'ember', now() + interval '30 days') RETURNING id`,
        [SCHOOL_A, t.users.teacherA])))!.id;
    const row = await one<{ hours: number }>(db,
      `SELECT round(extract(epoch FROM expires_at - created_at) / 3600)::int AS hours FROM public.stories WHERE id = $1`, [story]);
    assert.equal(row?.hours, 24);
  });

  it("refuses a photo that is not the author's own upload, and somebody else's name on it", async () => {
    const borrowed = await errorOf(() => asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.stories (school_id, author_id, kind, media_path, media_width, media_height)
         VALUES ($1, $2, 'image', $3, 100, 100)`,
        [SCHOOL_A, t.users.teacherA, `${SCHOOL_A}/${t.users.parentA}/a.webp`])));
    assert.match(borrowed ?? "", /invalid_media/);
    const forged = await errorOf(() => asUser(db, t.users.teacherA, (tx) =>
      tx.query(`INSERT INTO public.stories (school_id, author_id, kind, caption) VALUES ($1, $2, 'text', 'hi')`,
        [SCHOOL_A, t.users.parentA])));
    assert.match(forged ?? "", /row-level security/);
  });

  it("shows it to people who share a conversation with the author, and to nobody else", async () => {
    const parent = await asUser(db, t.users.parentA, (tx) =>
      rows<{ author_id: string; all_seen: boolean }>(tx, `SELECT author_id, all_seen FROM public.get_story_feed()`));
    assert.deepEqual(parent.map((r) => [r.author_id, r.all_seen]), [[t.users.teacherA, false]]);
    const stranger = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT * FROM public.get_story_feed()`));
    assert.equal(stranger.length, 0);
    const direct = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.stories`));
    assert.equal(direct.length, 0);
    const notAllowed = await errorOf(() => asUser(db, t.users.student2A, (tx) => tx.query(`SELECT public.view_story($1)`, [story])));
    assert.match(notAllowed ?? "", /not_allowed/);
  });

  it("tells the author who has seen it", async () => {
    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.view_story($1)`, [story]));
    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.view_story($1)`, [story]));
    const parent = await asUser(db, t.users.parentA, (tx) =>
      one<{ all_seen: boolean }>(tx, `SELECT all_seen FROM public.get_story_feed() WHERE author_id = $1`, [t.users.teacherA]));
    assert.equal(parent?.all_seen, true);
    const mine = await asUser(db, t.users.teacherA, (tx) =>
      one<{ is_me: boolean; stories: Array<{ views: number }> }>(tx, `SELECT is_me, stories FROM public.get_story_feed()`));
    assert.equal(mine?.is_me, true);
    assert.equal(mine?.stories[0]?.views, 1);
    const viewers = await asUser(db, t.users.teacherA, (tx) =>
      rows<{ user_id: string }>(tx, `SELECT user_id FROM public.get_story_viewers($1)`, [story]));
    assert.deepEqual(viewers.map((v) => v.user_id), [t.users.parentA]);
    const nosy = await asUser(db, t.users.parentA, (tx) => rows(tx, `SELECT * FROM public.get_story_viewers($1)`, [story]));
    assert.equal(nosy.length, 0);
    const forged = await errorOf(() => asUser(db, t.users.parentA, (tx) =>
      tx.query(`INSERT INTO public.story_views (story_id, viewer_id) VALUES ($1, $2)`, [story, t.users.studentA])));
    assert.match(forged ?? "", /permission denied/);
  });

  it("lets the author take it down, and nobody else", async () => {
    const other = await asUser(db, t.users.parentA, (tx) => tx.query(`DELETE FROM public.stories WHERE id = $1`, [story]));
    assert.equal(other.affectedRows, 0);
    const own = await asUser(db, t.users.teacherA, (tx) => tx.query(`DELETE FROM public.stories WHERE id = $1`, [story]));
    assert.equal(own.affectedRows, 1);
  });
});
