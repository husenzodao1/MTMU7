import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asUser, createDatabase, errorOf, one, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, SCHOOL_B, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let conversation: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  conversation = (await asUser(db, t.users.teacherA, (tx) =>
    one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [t.users.parentA])))!.id;
});
after(async () => {
  await db.close();
});

const send = (userId: string, content: string, type = "text", extra: Record<string, unknown> = {}) =>
  asUser(db, userId, (tx) =>
    one<{ id: string; created_at: string }>(tx,
      `INSERT INTO public.messages (conversation_id, sender_id, school_id, content, type, media_path, media_width, media_height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
      [conversation, userId, SCHOOL_A, content, type, extra.media_path ?? null, extra.media_width ?? null, extra.media_height ?? null]));

describe("the path a message takes", () => {
  it("leaves the conversation's own row alone", async () => {
    const before = await one<{ updated_at: string }>(db, `SELECT updated_at FROM public.conversations WHERE id = $1`, [conversation]);
    await send(t.users.teacherA, "Салом");
    const afterwards = await one<{ updated_at: string }>(db, `SELECT updated_at FROM public.conversations WHERE id = $1`, [conversation]);
    assert.equal(String(afterwards?.updated_at), String(before?.updated_at));
  });

  it("still counts what the sender sent as read by the sender", async () => {
    const sent = await send(t.users.teacherA, "Ин ҳам");
    const member = await one<{ last_read_at: string }>(db,
      `SELECT last_read_at FROM public.conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversation, t.users.teacherA]);
    assert.ok(new Date(member!.last_read_at).getTime() >= new Date(sent!.created_at).getTime());
  });

  it("tells the other side a photo arrived, with its caption", async () => {
    const path = `${SCHOOL_A}/${conversation}/${t.users.parentA}/p.webp`;
    await asUser(db, t.users.parentA, (tx) =>
      tx.query(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('chat-media', $1, $2)`, [path, t.users.parentA]));
    await send(t.users.parentA, "Дафтар", "image", { media_path: path, media_width: 800, media_height: 600 });
    const note = await one<{ body: string }>(db,
      `SELECT body FROM public.notifications WHERE user_id = $1 AND group_key = $2 ORDER BY created_at DESC LIMIT 1`,
      [t.users.teacherA, `conversation:${conversation}`]);
    assert.equal(note?.body, "📷 Дафтар");
  });

  it("still refuses a notification addressed across schools", async () => {
    const crossed = await errorOf(() => db.query(
      `INSERT INTO public.notifications (user_id, school_id, type, module, template_key) VALUES ($1, $2, 'system', 'messages', 'x')`,
      [t.users.teacherA, SCHOOL_B]));
    assert.match(crossed ?? "", /Cross-school violation/);
  });

  it("still refuses moving a message to another school", async () => {
    const sent = await send(t.users.teacherA, "Боз");
    const moved = await errorOf(() => db.query(`UPDATE public.messages SET school_id = $2 WHERE id = $1`, [sent!.id, SCHOOL_B]));
    assert.match(moved ?? "", /Cross-school violation/);
  });
});
