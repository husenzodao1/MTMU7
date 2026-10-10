import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, SCHOOL_B, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;
let published: string;
let draft: string;
let otherSchool: string;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);

  // Articles are written the way the application writes them: by a person with
  // the right to, through the same triggers and policies.
  const insert = (author: string, school: string, title: string) =>
    asUser(db, author, (tx) =>
      one<{ id: string }>(
        tx,
        `INSERT INTO public.news_articles (school_id, title, content, author_id, status, visibility, publish_at)
         VALUES ($1, $2, 'Matn', $3, 'draft', 'school', now() - interval '1 hour') RETURNING id`,
        [school, title, author]
      )
    ).then((r) => r!.id);

  const publish = (actor: string, id: string) =>
    asUser(db, actor, (tx) => tx.query(`UPDATE public.news_articles SET status = 'published' WHERE id = $1`, [id]));

  published = await insert(t.users.directorA, SCHOOL_A, "Xabari asosi");
  await publish(t.users.adminA, published);
  draft = await insert(t.users.directorA, SCHOOL_A, "Draft");
  otherSchool = await insert(t.users.adminB, SCHOOL_B, "Xabari maktabi digar");
  await publish(t.users.adminB, otherSchool);
});
after(async () => {
  await db.close();
});

const like = (user: string, article: string) =>
  asUser(db, user, (tx) => one<{ r: { liked: boolean; likes: number } }>(tx, `SELECT public.toggle_news_like($1) AS r`, [article]));

const engagement = (user: string, ids: string[]) =>
  asUser(db, user, (tx) =>
    rows<{ article_id: string; views: number; likes: number; comments: number; liked: boolean; author_name: string; author_role: { slug: string } | null }>(
      tx,
      `SELECT * FROM public.news_engagement($1::uuid[])`,
      [ids]
    )
  );

describe("liking an article", () => {
  it("toggles, and counts everyone once", async () => {
    const first = await like(t.users.studentA, published);
    assert.deepEqual(first!.r, { liked: true, likes: 1 });

    const second = await like(t.users.studentA, published);
    assert.deepEqual(second!.r, { liked: false, likes: 0 });

    await like(t.users.studentA, published);
    const third = await like(t.users.student2A, published);
    assert.deepEqual(third!.r, { liked: true, likes: 2 });
  });

  it("is refused on anything the reader cannot open", async () => {
    assert.equal(await errorOf(() => like(t.users.studentA, draft)), "forbidden");
    assert.equal(await errorOf(() => like(t.users.studentA, otherSchool)), "forbidden");
  });

  it("never shows who else liked", async () => {
    const seen = await asUser(db, t.users.student2A, (tx) =>
      rows<{ user_id: string }>(tx, `SELECT user_id FROM public.news_likes WHERE article_id = $1`, [published])
    );
    assert.deepEqual(seen.map((r) => r.user_id), [t.users.student2A]);
  });
});

describe("counting readers", () => {
  it("counts a person once however often they open it", async () => {
    for (let i = 0; i < 3; i += 1) {
      await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.record_news_view($1)`, [published]));
    }
    await asUser(db, t.users.student2A, (tx) => tx.query(`SELECT public.record_news_view($1)`, [published]));

    const article = await one<{ view_count: number }>(db, `SELECT view_count FROM public.news_articles WHERE id = $1`, [published]);
    assert.equal(article!.view_count, 2, "three visits by one person and one by another are two readers");
  });

  it("records nothing for an article the reader cannot open", async () => {
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.record_news_view($1)`, [draft]));
    const article = await one<{ view_count: number }>(db, `SELECT view_count FROM public.news_articles WHERE id = $1`, [draft]);
    assert.equal(article!.view_count, 0);
  });
});

describe("commenting", () => {
  it("accepts a comment and hands it back with its author's standing", async () => {
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.add_news_comment($1, $2)`, [published, "  Tashakkur  "]));
    const list = await asUser(db, t.users.student2A, (tx) =>
      rows<{ body: string; author_role: { slug: string } | null; is_mine: boolean }>(
        tx,
        `SELECT body, author_role, is_mine FROM public.list_news_comments($1)`,
        [published]
      )
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]!.body, "Tashakkur", "surrounding space is trimmed");
    assert.equal(list[0]!.author_role?.slug, "student");
    assert.equal(list[0]!.is_mine, false);
  });

  it("refuses an empty or oversized comment, and any article the reader cannot open", async () => {
    const add = (article: string, body: string) =>
      asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.add_news_comment($1, $2)`, [article, body]));
    assert.equal(await errorOf(() => add(published, "   ")), "invalid_body");
    assert.equal(await errorOf(() => add(published, "x".repeat(1001))), "invalid_body");
    assert.equal(await errorOf(() => add(draft, "hello")), "forbidden");
  });

  it("lets a moderator hide a comment, which removes it from the list", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.news_comments SET is_hidden = true WHERE article_id = $1`, [published]));
    const list = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.list_news_comments($1)`, [published]));
    assert.equal(list.length, 0);
    await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.news_comments SET is_hidden = false WHERE article_id = $1`, [published]));
  });

  it("does not let a reader hide someone else's comment", async () => {
    await asUser(db, t.users.student2A, (tx) => tx.query(`UPDATE public.news_comments SET is_hidden = true WHERE article_id = $1`, [published]));
    const still = await asUser(db, t.users.student2A, (tx) => rows(tx, `SELECT id FROM public.list_news_comments($1)`, [published]));
    assert.equal(still.length, 1, "the comment should still be visible");
  });
});

describe("what a list of articles reports", () => {
  it("carries the counts, the reader's own like and the author's standing", async () => {
    const [row] = await engagement(t.users.studentA, [published]);
    assert.ok(row, "the published article should be reported");
    assert.equal(row!.views, 2);
    assert.equal(row!.likes, 2);
    assert.equal(row!.comments, 1);
    assert.equal(row!.liked, true);
    assert.equal(row!.author_role?.slug, "director", "the byline says in what capacity it was published");
    assert.ok(row!.author_name.length > 0);
  });

  it("silently omits articles the reader may not open", async () => {
    const reported = await engagement(t.users.studentA, [published, draft, otherSchool]);
    assert.deepEqual(reported.map((r) => r.article_id), [published]);
  });

  it("tells an anonymous visitor nothing about a school-only article", async () => {
    const reported = await asAnon(db, (tx) => rows(tx, `SELECT article_id FROM public.news_engagement($1::uuid[])`, [[published]]));
    assert.equal(reported.length, 0);
  });
});
