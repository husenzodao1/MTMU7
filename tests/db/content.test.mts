import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { newId, seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  // vice principal for announcement publishing
  await db.query(
    `INSERT INTO public.user_roles (user_id, role_id, school_id)
     SELECT $1, r.id, r.school_id FROM public.roles r WHERE r.school_id = $2 AND r.slug = 'vice_principal'`,
    [t.users.staffA, SCHOOL_A]
  );
});
after(async () => {
  await db.close();
});

const newsIds = (tx: Parameters<Parameters<typeof asUser>[2]>[0]) =>
  rows<{ title: string }>(tx, `SELECT title FROM public.news_articles ORDER BY title`).then((r) => r.map((x) => x.title));

describe("news workflow", () => {
  let draftId: string;

  it("lets an author create a draft with an automatic Latin slug but not publish it", async () => {
    const row = await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string; slug: string; author_id: string }>(tx,
        `INSERT INTO public.news_articles (school_id, title, content, status) VALUES ($1, 'Олимпиадаи ҷумҳуриявӣ', 'Матн', 'draft')
         RETURNING id, slug, author_id`, [SCHOOL_A]));
    draftId = row!.id;
    assert.match(row!.slug, /^olimpiadai-jumhuriyavi-[0-9a-f]{6}$/);
    assert.equal(row!.author_id, t.users.teacherA);

    const publish = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.news_articles SET status = 'published' WHERE id = $1`, [draftId])));
    assert.match(publish ?? "", /news.publish/);
    await asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.news_articles SET status = 'review' WHERE id = $1`, [draftId]));
  });

  it("keeps drafts and review items away from readers and other authors", async () => {
    const student = await asUser(db, t.users.studentA, newsIds);
    assert.ok(!student.includes("Олимпиадаи ҷумҳуриявӣ"));
    const otherAuthor = await asUser(db, t.users.teacher2A, (tx) =>
      tx.query(`UPDATE public.news_articles SET title = 'hijack' WHERE id = $1`, [draftId]));
    assert.equal(otherAuthor.affectedRows, 0);
  });

  it("publishes through an editor and shows it to the school, not to anonymous visitors unless public", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.news_articles SET status = 'published' WHERE id = $1`, [draftId]));
    const stored = await one<{ published_by: string; publish_at: string | null }>(db, `SELECT published_by, publish_at FROM public.news_articles WHERE id = $1`, [draftId]);
    assert.equal(stored!.published_by, t.users.adminA);
    assert.ok(stored!.publish_at);
    assert.ok((await asUser(db, t.users.studentA, newsIds)).includes("Олимпиадаи ҷумҳуриявӣ"));
    assert.equal((await asAnon(db, newsIds)).length, 0);
    assert.ok(!(await asUser(db, t.users.studentB, newsIds)).includes("Олимпиадаи ҷумҳуриявӣ"));

    await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.news_articles SET visibility = 'public' WHERE id = $1`, [draftId]));
    assert.deepEqual(await asAnon(db, newsIds), ["Олимпиадаи ҷумҳуриявӣ"]);
  });

  it("stops authors from editing published articles", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.news_articles SET content = 'changed' WHERE id = $1`, [draftId])));
    assert.match(error ?? "", /own drafts|news.update/);
  });

  it("honours schedule, expiry and staff-only visibility", async () => {
    await db.query(
      `INSERT INTO public.news_articles (school_id, title, content, status, visibility, publish_at, expires_at) VALUES
        ($1, 'future', 'x', 'published', 'public', now() + interval '1 day', NULL),
        ($1, 'expired', 'x', 'published', 'public', now() - interval '3 days', now() - interval '1 day'),
        ($1, 'staff only', 'x', 'published', 'staff', now() - interval '1 hour', NULL)`, [SCHOOL_A]);
    const anon = await asAnon(db, newsIds);
    assert.ok(!anon.includes("future") && !anon.includes("expired"));
    const student = await asUser(db, t.users.studentA, newsIds);
    assert.ok(!student.includes("staff only"));
    const teacher = await asUser(db, t.users.teacherA, newsIds);
    assert.ok(teacher.includes("staff only"));
  });

  it("requires news.archive to archive and allows deleting only never-published drafts", async () => {
    const teacherArchive = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.news_articles SET status = 'archived' WHERE id = $1`, [draftId])));
    assert.match(teacherArchive ?? "", /own drafts|news.archive/);
    await asUser(db, t.users.directorA, (tx) => tx.query(`UPDATE public.news_articles SET status = 'archived' WHERE id = $1`, [draftId]));
    const deleted = await asUser(db, t.users.adminA, (tx) => tx.query(`DELETE FROM public.news_articles WHERE id = $1`, [draftId]));
    assert.equal(deleted.affectedRows, 0);
  });

  it("counts views without granting write access to readers", async () => {
    const id = (await one<{ id: string }>(db, `SELECT id FROM public.news_articles WHERE title = 'staff only'`))!.id;
    await asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.record_news_view($1)`, [id]));
    await asUser(db, t.users.studentA, (tx) => tx.query(`SELECT public.record_news_view($1)`, [id]));
    const views = await one<{ view_count: number }>(db, `SELECT view_count FROM public.news_articles WHERE id = $1`, [id]);
    assert.equal(views!.view_count, 1, "the student cannot see staff news, so their view is not counted");
  });
});

describe("announcements", () => {
  const create = (userId: string, fields: string, values: unknown[]) =>
    asUser(db, userId, (tx) => one<{ id: string }>(tx, `INSERT INTO public.announcements (school_id, title, body${fields}) VALUES ($1, $2, 'Body'${values.map((_, i) => `, $${i + 3}`).join("")}) RETURNING id`, [SCHOOL_A, ...values.slice(0, 1), ...values.slice(1)]));

  const visibleTitles = (userId: string) =>
    asUser(db, userId, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.announcements ORDER BY title`)).then((r) => r.map((x) => x.title));

  it("lets teachers draft but only publishers publish", async () => {
    const draft = await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx, `INSERT INTO public.announcements (school_id, title, body) VALUES ($1, 'teacher draft', 'x') RETURNING id`, [SCHOOL_A]));
    const publish = await errorOf(() =>
      asUser(db, t.users.teacherA, (tx) => tx.query(`UPDATE public.announcements SET status = 'published' WHERE id = $1`, [draft!.id])));
    assert.match(publish ?? "", /announcements.publish/);
    void create;
  });

  it("targets classes, parents, roles and individual users precisely", async () => {
    await asUser(db, t.users.staffA, (tx) => tx.query(
      `INSERT INTO public.announcements (school_id, title, body, status, audience_type, audience_class_ids, audience_roles, audience_user_ids) VALUES
        ($1, 'class 9A', 'x', 'published', 'classes', ARRAY[$2]::uuid[], '{}', '{}'),
        ($1, 'parents', 'x', 'published', 'parents', '{}', '{}', '{}'),
        ($1, 'librarians', 'x', 'published', 'roles', '{}', ARRAY['librarian'], '{}'),
        ($1, 'only student two', 'x', 'published', 'users', '{}', '{}', ARRAY[$3]::uuid[]),
        ($1, 'everyone', 'x', 'published', 'school', '{}', '{}', '{}'),
        ($1, 'draft', 'x', 'draft', 'school', '{}', '{}', '{}')`,
      [SCHOOL_A, a.class9A, t.users.student2A]));

    assert.deepEqual(await visibleTitles(t.users.studentA), ["class 9A", "everyone"]);
    assert.deepEqual(await visibleTitles(t.users.student2A), ["everyone", "only student two"]);
    assert.deepEqual(await visibleTitles(t.users.parentA), ["class 9A", "everyone", "parents"]);
    assert.deepEqual(await visibleTitles(t.users.librarianA), ["everyone", "librarians"]);
    assert.ok((await visibleTitles(t.users.teacherA)).includes("class 9A"), "teachers of the class see class announcements");
    assert.deepEqual(await visibleTitles(t.users.studentB), []);
  });

  it("rejects targeting classes of another school", async () => {
    const error = await errorOf(() =>
      asUser(db, t.users.staffA, (tx) => tx.query(
        `INSERT INTO public.announcements (school_id, title, body, audience_type, audience_class_ids) VALUES ($1, 'x', 'x', 'classes', ARRAY[$2]::uuid[])`,
        [SCHOOL_A, a.classB])));
    assert.match(error ?? "", /cross-school/);
  });
});

describe("events and documents", () => {
  it("shows public events to visitors and staff events only to staff", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.events (school_id, title, starts_at, audience, status) VALUES
        ($1, 'open day', now() + interval '2 days', 'public', 'published'),
        ($1, 'teachers council', now() + interval '3 days', 'staff', 'published'),
        ($1, 'planned', now() + interval '4 days', 'school', 'draft')`, [SCHOOL_A]));
    const anon = await asAnon(db, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.events`));
    assert.deepEqual(anon.map((e) => e.title), ["open day"]);
    const student = await asUser(db, t.users.studentA, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.events ORDER BY title`));
    assert.deepEqual(student.map((e) => e.title), ["open day"]);
    const teacher = await asUser(db, t.users.teacherA, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.events ORDER BY title`));
    assert.deepEqual(teacher.map((e) => e.title), ["open day", "teachers council"]);
  });

  it("controls document access by audience and keeps version history", async () => {
    const path = (name: string) => `${SCHOOL_A}/documents/${name}.pdf`;
    const docId = (await asUser(db, t.users.adminA, (tx) => one<{ id: string }>(tx,
      `INSERT INTO public.documents (school_id, title, access, allowed_roles, status, storage_path, file_name, mime_type, size_bytes)
       VALUES ($1, 'Teacher guideline', 'roles', ARRAY['teacher'], 'published', $2, 'g.pdf', 'application/pdf', 1000) RETURNING id`,
      [SCHOOL_A, path("guide")])))!.id;
    await asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.documents (school_id, title, access, status, storage_path, file_name, mime_type, size_bytes) VALUES
        ($1, 'School charter', 'public', 'published', $2, 'c.pdf', 'application/pdf', 1000),
        ($1, 'Unreleased', 'school', 'draft', $3, 'u.pdf', 'application/pdf', 1000)`, [SCHOOL_A, path("charter"), path("draft")]));

    const titles = async (userId: string | null) =>
      (userId ? await asUser(db, userId, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.documents ORDER BY title`))
              : await asAnon(db, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.documents ORDER BY title`))).map((d) => d.title);

    assert.deepEqual(await titles(null), ["School charter"]);
    assert.deepEqual(await titles(t.users.studentA), ["School charter"]);
    assert.deepEqual(await titles(t.users.teacherA), ["School charter", "Teacher guideline"]);

    await asUser(db, t.users.adminA, (tx) => tx.query(`UPDATE public.documents SET storage_path = $2, file_name = 'g2.pdf' WHERE id = $1`, [docId, path("guide-v2")]));
    const versions = await rows<{ version: number }>(db, `SELECT version FROM public.document_versions WHERE document_id = $1 ORDER BY version`, [docId]);
    assert.deepEqual(versions.map((v) => v.version), [1, 2]);

    const badPath = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.documents (school_id, title, storage_path, file_name, mime_type, size_bytes) VALUES ($1, 'x', $2, 'x.pdf', 'application/pdf', 1)`,
      [SCHOOL_A, `${t.schoolB}/documents/x.pdf`])));
    assert.match(badPath ?? "", /documents_path_scope/);
  });
});

describe("homepage sections", () => {
  it("are provisioned for every school, public when enabled and editable only with cms.manage", async () => {
    const sections = await asAnon(db, (tx) => rows<{ section_key: string }>(tx, `SELECT section_key FROM public.site_sections WHERE school_id = $1`, [t.schoolB]));
    assert.ok(sections.some((s) => s.section_key === "hero"));
    const teacher = await asUser(db, t.users.teacherA, (tx) =>
      tx.query(`UPDATE public.site_sections SET content = '{"tg":{"title":"x"}}' WHERE school_id = $1 AND section_key = 'hero'`, [SCHOOL_A]));
    assert.equal(teacher.affectedRows, 0);
    const admin = await asUser(db, t.users.adminA, (tx) =>
      tx.query(`UPDATE public.site_sections SET content = '{"tg":{"title":"Хуш омадед"}}' WHERE school_id = $1 AND section_key = 'hero'`, [SCHOOL_A]));
    assert.equal(admin.affectedRows, 1);
  });

  it("removed raw HTML block type", async () => {
    const error = await errorOf(() =>
      db.query(`INSERT INTO public.content_blocks (school_id, section, type, body_tg) VALUES ($1, 'x', 'html', '<script>')`, [SCHOOL_A]));
    assert.match(error ?? "", /content_blocks_type_check/);
  });
});

describe("library", () => {
  const addBook = (userId: string, title: string, status: string, visibility: string) =>
    asUser(db, userId, (tx) => one<{ id: string }>(tx,
      `INSERT INTO public.library_items (school_id, title, status, visibility, quantity, available_quantity) VALUES ($1, $2, $3, $4, 3, 3) RETURNING id`,
      [SCHOOL_A, title, status, visibility]));

  it("lets librarians catalogue and publish books but not teachers", async () => {
    const teacher = await errorOf(() => addBook(t.users.teacherA, "not allowed", "draft", "all"));
    assert.match(teacher ?? "", /row-level security/);
    const book = await addBook(t.users.librarianA, "Physics 9", "draft", "all");
    await asUser(db, t.users.librarianA, (tx) => tx.query(`UPDATE public.library_items SET status = 'published' WHERE id = $1`, [book!.id]));
    const published = await one<{ is_published: boolean; published_at: string }>(db, `SELECT is_published, published_at FROM public.library_items WHERE id = $1`, [book!.id]);
    assert.equal(published!.is_published, true);
    assert.ok(published!.published_at);
  });

  it("applies visibility for students, staff and anonymous visitors", async () => {
    await addBook(t.users.librarianA, "Teacher handbook", "published", "teachers");
    await addBook(t.users.librarianA, "Open catalogue", "published", "public");
    await addBook(t.users.librarianA, "Old edition", "archived", "all");
    const titles = async (userId: string | null) =>
      (userId ? await asUser(db, userId, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.library_items ORDER BY title`))
              : await asAnon(db, (tx) => rows<{ title: string }>(tx, `SELECT title FROM public.library_items ORDER BY title`))).map((b) => b.title);
    assert.deepEqual(await titles(null), ["Open catalogue"]);
    assert.deepEqual(await titles(t.users.studentA), ["Open catalogue", "Physics 9"]);
    assert.deepEqual(await titles(t.users.teacherA), ["Open catalogue", "Physics 9", "Teacher handbook"]);
    assert.ok((await titles(t.users.librarianA)).includes("Old edition"));
    assert.deepEqual(await titles(t.users.studentB), ["Open catalogue"]);
  });

  it("deletes only never-published drafts", async () => {
    const draft = await addBook(t.users.librarianA, "typo draft", "draft", "all");
    const physics = await one<{ id: string }>(db, `SELECT id FROM public.library_items WHERE title = 'Physics 9'`);
    const removedPublished = await asUser(db, t.users.adminA, (tx) => tx.query(`DELETE FROM public.library_items WHERE id = $1`, [physics!.id]));
    assert.equal(removedPublished.affectedRows, 0);
    const removedDraft = await asUser(db, t.users.adminA, (tx) => tx.query(`DELETE FROM public.library_items WHERE id = $1`, [draft!.id]));
    assert.equal(removedDraft.affectedRows, 1);
  });

  it("lets a book author manage the access list of their own draft only (00035)", async () => {
    const authorRole = await one<{ id: string }>(db, `INSERT INTO public.roles (school_id, slug, name_tg, level) VALUES ($1, 'book_author', 'book_author', 5) RETURNING id`, [SCHOOL_A]);
    await db.query(
      `INSERT INTO public.role_permissions (role_id, permission_id) SELECT $1, p.id FROM public.permissions p WHERE p.slug = ANY ($2)`,
      [authorRole!.id, ["library.view", "library.create"]]
    );
    const authorId = newId();
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [authorId, `${authorId}@example.test`]);
    await db.query(`INSERT INTO public.users (id, school_id, email, first_name, last_name) VALUES ($1, $2, $3, 'Book', 'Author')`, [authorId, SCHOOL_A, `${authorId}@example.test`]);
    await db.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)`, [authorId, authorRole!.id, SCHOOL_A]);

    const own = await asUser(db, authorId, async (tx) => {
      const book = await one<{ id: string; uploaded_by: string }>(tx,
        `INSERT INTO public.library_items (school_id, title, status, visibility, quantity, available_quantity)
         VALUES ($1, 'Author draft', 'draft', 'specific', 1, 1) RETURNING id, uploaded_by`, [SCHOOL_A]);
      await tx.query(`INSERT INTO public.library_item_access (item_id, school_id, class_id) VALUES ($1, $2, $3)`, [book!.id, SCHOOL_A, a.class9A]);
      return book!;
    });
    assert.equal(own.uploaded_by, authorId, "the author is stamped on insert");
    assert.equal((await rows(db, `SELECT id FROM public.library_item_access WHERE item_id = $1`, [own.id])).length, 1);

    // Publishing still needs library.publish, and a published book's access list stays closed.
    const publish = await errorOf(() => asUser(db, authorId, (tx) => tx.query(`UPDATE public.library_items SET status = 'published' WHERE id = $1`, [own.id])));
    assert.ok(publish !== null || (await one<{ status: string }>(db, `SELECT status FROM public.library_items WHERE id = $1`, [own.id]))!.status === "draft");
    const other = await one<{ id: string }>(db, `SELECT id FROM public.library_items WHERE title = 'Physics 9'`);
    const foreign = await asUser(db, authorId, (tx) =>
      tx.query(`INSERT INTO public.library_item_access (item_id, school_id, class_id) VALUES ($1, $2, $3)`, [other!.id, SCHOOL_A, a.class9A]).then(() => null).catch((e: Error) => e.message));
    assert.match(foreign ?? "", /row-level security/);
  });

  it("rejects file paths outside the school folder", async () => {
    const error = await errorOf(() => asUser(db, t.users.librarianA, (tx) => tx.query(
      `INSERT INTO public.library_items (school_id, title, file_url, file_name, file_size, file_type) VALUES ($1, 'x', $2, 'x.pdf', 10, 'pdf')`,
      [SCHOOL_A, `${SCHOOL_A}/../${t.schoolB}/x.pdf`])));
    assert.match(error ?? "", /lib_items_paths_scope/);
  });
});
