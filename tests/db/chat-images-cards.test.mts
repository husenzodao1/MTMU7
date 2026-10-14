import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let conversation: string;
let elsewhere: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  conversation = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.parentA])))!.id;
  elsewhere = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.studentA])))!.id;
});
after(async () => {
  await db.close();
});

const path = (conv: string, uploader: string, file = "photo.webp") => `${SCHOOL_A}/${conv}/${uploader}/${file}`;

const upload = (userId: string, name: string) =>
  asUser(db, userId, (tx) => tx.query(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('chat-media', $1, $2)`, [name, userId]));

const postImage = (userId: string, conv: string, mediaPath: string, caption = "") =>
  asUser(db, userId, (tx) =>
    one<{ id: string; type: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_width, media_height)
       VALUES ($1, $2, $3, $4, 'image', $5, 1200, 900) RETURNING id, type`,
      [conv, userId, SCHOOL_A, caption, mediaPath]));

describe("photos in a conversation", () => {
  let photo: string;

  it("lets a member upload into their own conversation, and nobody else", async () => {
    await upload(t.users.teacherA, path(conversation, t.users.teacherA));
    // Not a member of that conversation.
    const outsider = await errorOf(() => upload(t.users.student2A, path(conversation, t.users.student2A)));
    assert.match(outsider ?? "", /row-level security/);
    // A member, but writing under somebody else's name.
    const impostor = await errorOf(() => upload(t.users.parentA, path(conversation, t.users.teacherA, "other.webp")));
    assert.match(impostor ?? "", /row-level security/);
  });

  it("shows the photo to the conversation and to nobody outside it", async () => {
    const member = await asUser(db, t.users.parentA, (tx) => rows(tx, `SELECT name FROM storage.objects WHERE bucket_id = 'chat-media'`));
    assert.equal(member.length, 1);
    const outsider = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT name FROM storage.objects WHERE bucket_id = 'chat-media'`));
    assert.equal(outsider.length, 0);
  });

  it("sends it as one message, with its size, readable back in the thread", async () => {
    const row = await postImage(t.users.teacherA, conversation, path(conversation, t.users.teacherA), "The board after class");
    assert.equal(row?.type, "image");
    photo = row!.id;
    const read = await asUser(db, t.users.parentA, (tx) => one<{ media_path: string; media_width: number; content: string }>(tx,
      `SELECT media_path, media_width, content FROM public.get_conversation_messages($1) WHERE id = $2`, [conversation, photo]));
    assert.equal(read?.media_path, path(conversation, t.users.teacherA));
    assert.equal(read?.media_width, 1200);
    assert.equal(read?.content, "The board after class");
  });

  it("refuses a photo from another conversation or another person's folder", async () => {
    await upload(t.users.teacherA, path(elsewhere, t.users.teacherA, "secret.webp"));
    const borrowed = await errorOf(() => postImage(t.users.teacherA, conversation, path(elsewhere, t.users.teacherA, "secret.webp")));
    assert.match(borrowed ?? "", /invalid_media/);
    const someoneElses = await errorOf(() => postImage(t.users.parentA, conversation, path(conversation, t.users.teacherA)));
    assert.match(someoneElses ?? "", /invalid_media/);
    const noPicture = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type) VALUES ($1, $2, $3, '', 'image')`,
      [conversation, t.users.teacherA, SCHOOL_A])));
    assert.match(noPicture ?? "", /invalid_media/);
  });

  it("will not let a picture ride on a text message, or be swapped later", async () => {
    const onText = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_width, media_height)
       VALUES ($1, $2, $3, 'x', 'text', $4, 10, 10)`, [conversation, t.users.teacherA, SCHOOL_A, path(conversation, t.users.teacherA)])));
    assert.match(onText ?? "", /messages_media_check/);
    const swapped = await errorOf(() => asUser(db, t.users.teacherA, (tx) =>
      tx.query(`UPDATE public.messages SET media_path = $2 WHERE id = $1`, [photo, path(conversation, t.users.teacherA, "b.webp")])));
    assert.match(swapped ?? "", /protected message field/);
  });

  it("lets go of the picture when the message is deleted", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.messages SET is_deleted = true WHERE id = $1`, [photo]));
    const row = await one<{ media_path: string | null; type: string }>(db, `SELECT media_path, type FROM public.messages WHERE id = $1`, [photo]);
    assert.equal(row?.media_path, null);
    assert.equal(row?.type, "image");
  });

  it("lets only the uploader remove the file", async () => {
    const other = await asUser(db, t.users.parentA, (tx) =>
      tx.query(`DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name = $1`, [path(conversation, t.users.teacherA)]));
    assert.equal(other.affectedRows, 0);
    const own = await asUser(db, t.users.teacherA, (tx) =>
      tx.query(`DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name = $1`, [path(conversation, t.users.teacherA)]));
    assert.equal(own.affectedRows, 1);
  });
});

describe("the member card", () => {
  it("shows a colleague's name, roles and nickname to somebody in the same school", async () => {
    await db.query(`UPDATE public.users SET nickname = 'teacher.a' WHERE id = $1`, [t.users.teacherA]);
    const card = await asUser(db, t.users.parentA, (tx) => one<{ c: { first_name: string; nickname: string; roles: Array<{ slug: string }> } }>(tx,
      `SELECT public.get_member_card($1) AS c`, [t.users.teacherA]));
    assert.equal(card?.c.first_name, "teacherA");
    assert.equal(card?.c.nickname, "teacher.a");
    assert.deepEqual(card?.c.roles.map((r) => r.slug), ["teacher"]);
  });

  it("says nothing about another school's people, or somebody who has left", async () => {
    const foreign = await asUser(db, t.users.parentA, (tx) => one<{ c: unknown }>(tx, `SELECT public.get_member_card($1) AS c`, [t.users.teacherB]));
    assert.equal(foreign?.c, null);
    const gone = await asUser(db, t.users.parentA, (tx) => one<{ c: unknown }>(tx, `SELECT public.get_member_card($1) AS c`, [t.users.blockedA]));
    assert.equal(gone?.c, null);
    const anon = await errorOf(() => db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE anon`);
      await tx.query(`SELECT public.get_member_card($1)`, [t.users.teacherA]);
    }));
    assert.match(anon ?? "", /permission denied/);
  });
});
