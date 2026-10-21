import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
});
after(async () => {
  await db.close();
});

const directConversation = (from: string, to: string) =>
  asUser(db, from, (tx) => one<{ id: string }>(tx, `SELECT public.create_direct_conversation($1) AS id`, [to])).then((r) => r!.id);

const send = (userId: string, conversationId: string, content: string) =>
  asUser(db, userId, (tx) =>
    one<{ id: string }>(tx, `INSERT INTO public.messages (conversation_id, sender_id, school_id, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [conversationId, userId, SCHOOL_A, content]));

describe("messaging under RLS (SEC-010 regression)", () => {
  let conversation: string;

  it("creates a direct conversation once and lets members read without recursion errors", async () => {
    conversation = await directConversation(t.users.teacherA, t.users.studentA);
    const again = await directConversation(t.users.studentA, t.users.teacherA);
    assert.equal(again, conversation);
    await send(t.users.teacherA, conversation, "Hello");
    const visible = await asUser(db, t.users.studentA, (tx) => rows<{ content: string }>(tx, `SELECT content FROM public.messages`));
    assert.deepEqual(visible.map((m) => m.content), ["Hello"]);
  });

  it("hides conversations and messages from non-members and other schools", async () => {
    for (const outsider of [t.users.student2A, t.users.adminA, t.users.studentB]) {
      const messages = await asUser(db, outsider, (tx) => rows(tx, `SELECT id FROM public.messages`));
      const members = await asUser(db, outsider, (tx) => rows(tx, `SELECT id FROM public.conversation_members`));
      assert.equal(messages.length, 0);
      assert.equal(members.length, 0);
    }
  });

  it("does not allow joining or posting into a foreign conversation", async () => {
    const join = await errorOf(() => asUser(db, t.users.student2A, (tx) =>
      tx.query(`INSERT INTO public.conversation_members (conversation_id, user_id, school_id) VALUES ($1, $2, $3)`, [conversation, t.users.student2A, SCHOOL_A])));
    assert.match(join ?? "", /permission denied/);
    const post = await errorOf(() => send(t.users.student2A, conversation, "intrusion"));
    assert.match(post ?? "", /row-level security|Cross-school violation/);
  });

  it("refuses conversations with users from another school or inactive accounts", async () => {
    assert.match((await errorOf(() => directConversation(t.users.teacherA, t.users.studentB))) ?? "", /messaging_not_allowed/);
    assert.match((await errorOf(() => directConversation(t.users.teacherA, t.users.pendingA))) ?? "", /messaging_not_allowed/);
    assert.match((await errorOf(() => directConversation(t.users.teacherA, t.users.blockedA))) ?? "", /messaging_not_allowed/);
  });

  it("protects message fields, limits edits and supports delete-for-everyone", async () => {
    const msg = await send(t.users.studentA, conversation, "typo");
    await asUser(db, t.users.studentA, (tx) => tx.query(`UPDATE public.messages SET content = 'fixed' WHERE id = $1`, [msg!.id]));
    const edited = await one<{ is_edited: boolean }>(db, `SELECT is_edited FROM public.messages WHERE id = $1`, [msg!.id]);
    assert.equal(edited!.is_edited, true);
    const move = await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`UPDATE public.messages SET conversation_id = gen_random_uuid() WHERE id = $1`, [msg!.id])));
    assert.match(move ?? "", /protected message field|row-level security/);
    const othersMessage = await asUser(db, t.users.studentA, (tx) =>
      tx.query(`UPDATE public.messages SET content = 'x' WHERE sender_id = $1`, [t.users.teacherA]));
    assert.equal(othersMessage.affectedRows, 0);

    await db.query(`UPDATE public.messages SET created_at = now() - interval '3 days' WHERE id = $1`, [msg!.id]);
    const late = await errorOf(() => asUser(db, t.users.studentA, (tx) => tx.query(`UPDATE public.messages SET content = 'late' WHERE id = $1`, [msg!.id])));
    assert.match(late ?? "", /48 hours/);

    await asUser(db, t.users.studentA, (tx) => tx.query(`UPDATE public.messages SET is_deleted = true WHERE id = $1`, [msg!.id]));
    const deleted = await one<{ content: string; deleted_by: string }>(db, `SELECT content, deleted_by FROM public.messages WHERE id = $1`, [msg!.id]);
    assert.deepEqual(deleted, { content: "", deleted_by: t.users.studentA });
  });

  it("returns the latest messages first with a stable cursor (FUN-002)", async () => {
    const conv = await directConversation(t.users.teacherA, t.users.parentA);
    for (let i = 1; i <= 7; i += 1) {
      await send(t.users.teacherA, conv, `m${i}`);
      await db.query(`UPDATE public.messages SET created_at = now() - make_interval(mins => $2) WHERE conversation_id = $1 AND content = $3`,
        [conv, 100 - i, `m${i}`]);
    }
    const page1 = await asUser(db, t.users.parentA, (tx) =>
      rows<{ id: string; content: string; created_at: string }>(tx, `SELECT * FROM public.get_conversation_messages($1, NULL, NULL, 3)`, [conv]));
    assert.deepEqual(page1.map((m) => m.content), ["m7", "m6", "m5"]);
    const last = page1.at(-1)!;
    const page2 = await asUser(db, t.users.parentA, (tx) =>
      rows<{ content: string }>(tx, `SELECT * FROM public.get_conversation_messages($1, $2, $3, 3)`, [conv, last.created_at, last.id]));
    assert.deepEqual(page2.map((m) => m.content), ["m4", "m3", "m2"]);

    const list = await asUser(db, t.users.parentA, (tx) =>
      rows<{ id: string; unread_count: number; last_message_content: string }>(tx, `SELECT * FROM public.list_my_conversations()`));
    const entry = list.find((c) => c.id === conv)!;
    assert.equal(entry.last_message_content, "m7");
    assert.equal(Number(entry.unread_count), 7);
    await asUser(db, t.users.parentA, (tx) => tx.query(`SELECT public.mark_conversation_read($1)`, [conv]));
    const unread = await asUser(db, t.users.parentA, (tx) => one<{ n: number }>(tx, `SELECT public.get_unread_message_count() AS n`));
    assert.equal(Number(unread!.n), 0);
  });
});

describe("child safety", () => {
  it("does not let students create groups by default", async () => {
    const error = await errorOf(() => asUser(db, t.users.studentA, (tx) =>
      tx.query(`SELECT public.create_group_conversation('friends', $1)`, [[t.users.student2A]])));
    assert.match(error ?? "", /group_creation_not_allowed/);
    const teacher = await asUser(db, t.users.teacherA, (tx) =>
      one<{ id: string }>(tx, `SELECT public.create_group_conversation('9A parents', $1) AS id`, [[t.users.parentA, t.users.studentA]]));
    assert.ok(teacher!.id);
  });

  it("honours the school rule against student-to-student direct messages", async () => {
    await db.query(`UPDATE public.schools SET settings = settings || '{"messaging_student_to_student": false}' WHERE id = $1`, [SCHOOL_A]);
    assert.match((await errorOf(() => directConversation(t.users.studentA, t.users.student2A))) ?? "", /messaging_not_allowed/);
    assert.ok(await directConversation(t.users.studentA, t.users.teacher2A));
    await db.query(`UPDATE public.schools SET settings = settings - 'messaging_student_to_student' WHERE id = $1`, [SCHOOL_A]);
  });

  it("stops messages in a direct conversation after a block", async () => {
    const conv = await directConversation(t.users.student2A, t.users.studentA);
    await asUser(db, t.users.studentA, (tx) =>
      tx.query(`INSERT INTO public.user_blocks (blocker_id, blocked_id, school_id) VALUES ($1, $2, $3)`, [t.users.studentA, t.users.student2A, SCHOOL_A]));
    assert.match((await errorOf(() => send(t.users.student2A, conv, "hi"))) ?? "", /messaging_blocked/);
    assert.match((await errorOf(() => directConversation(t.users.student2A, t.users.studentA))) ?? "", /messaging_not_allowed/);
  });

  it("routes reports to moderators who see only the reported context, with an audit trail", async () => {
    const conv = await directConversation(t.users.teacher2A, t.users.studentA);
    const msg = await send(t.users.teacher2A, conv, "inappropriate content");
    const report = await asUser(db, t.users.studentA, (tx) => one<{ id: string }>(tx, `SELECT public.report_message($1, 'inappropriate') AS id`, [msg!.id]));

    const forbidden = await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT public.moderation_get_report($1)`, [report!.id])));
    assert.match(forbidden ?? "", /forbidden/);
    const view = await asUser(db, t.users.adminA, (tx) => one<{ r: { message: { content: string } } }>(tx, `SELECT public.moderation_get_report($1) AS r`, [report!.id]));
    assert.equal(view!.r.message.content, "inappropriate content");
    const adminInbox = await asUser(db, t.users.adminA, (tx) => rows(tx, `SELECT id FROM public.messages`));
    assert.equal(adminInbox.length, 0, "moderators cannot browse conversations");

    await asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.moderation_resolve_report($1, 'delete_message', 'removed')`, [report!.id]));
    const removed = await one<{ is_deleted: boolean }>(db, `SELECT is_deleted FROM public.messages WHERE id = $1`, [msg!.id]);
    assert.equal(removed!.is_deleted, true);
    const audit = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.audit_logs WHERE entity_type = 'message_report' AND entity_id = $1`, [report!.id]);
    assert.equal(audit!.n, 2);
    const moderatorNotice = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = $1 AND template_key = 'moderation.report'`, [t.users.adminA]);
    assert.equal(moderatorNotice!.n, 1);
  });
});

describe("notifications", () => {
  it("collapses a chat burst into one unread notification with a count", async () => {
    const conv = await directConversation(t.users.librarianA, t.users.staffA);
    await send(t.users.librarianA, conv, "one");
    await send(t.users.librarianA, conv, "two");
    await send(t.users.librarianA, conv, "three");
    const notes = await asUser(db, t.users.staffA, (tx) =>
      rows<{ template_key: string; params: { count: number; sender: string }; body: string }>(tx,
        `SELECT template_key, params, body FROM public.notifications WHERE type = 'message'`));
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.params.count, 3);
    assert.equal(notes[0]!.body, "three");
  });

  it("notifies the student and guardians of new grades and guardians of absences", async () => {
    await asUser(db, t.users.teacherA, (tx) => tx.query(
      `INSERT INTO public.grades (school_id, student_id, class_subject_id, assessment_type_id, score, max_score) VALUES ($1, $2, $3, $4, 5, 5)`,
      [SCHOOL_A, a.students.studentA, a.mathA, a.assessmentTest]));
    await asUser(db, t.users.teacherA, (tx) => tx.query(
      `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status) VALUES ($1, $2, $3, $4, current_date, 'absent')`,
      [SCHOOL_A, a.students.studentA, a.class9A, a.mathA]));
    const student = await rows<{ template_key: string }>(db, `SELECT template_key FROM public.notifications WHERE user_id = $1 ORDER BY template_key`, [t.users.studentA]);
    const parent = await rows<{ template_key: string }>(db, `SELECT template_key FROM public.notifications WHERE user_id = $1 AND type <> 'message' ORDER BY template_key`, [t.users.parentA]);
    assert.ok(student.some((n) => n.template_key === "grade.new"));
    assert.ok(!student.some((n) => n.template_key === "attendance.absent"));
    assert.deepEqual(parent.map((n) => n.template_key), ["attendance.absent", "grade.new"]);
  });

  it("respects personal notification preferences", async () => {
    await db.query(`INSERT INTO public.user_settings (user_id, school_id, notification_types) VALUES ($1, $2, '{"announcement": false}')`, [t.users.teacher2A, SCHOOL_A]);
    await asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.announcements (school_id, title, body, status, audience_type) VALUES ($1, 'Staff meeting', 'x', 'published', 'staff')`, [SCHOOL_A]));
    const muted = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = $1 AND type = 'announcement'`, [t.users.teacher2A]);
    const teacher = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = $1 AND type = 'announcement'`, [t.users.teacherA]);
    const student = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM public.notifications WHERE user_id = $1 AND type = 'announcement'`, [t.users.studentA]);
    assert.deepEqual([muted!.n, teacher!.n, student!.n], [0, 1, 0]);
  });

  it("dispatches scheduled announcements and broadcasts through the scheduler only", async () => {
    await asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.announcements (school_id, title, body, status, audience_type, publish_at) VALUES ($1, 'Tomorrow', 'x', 'published', 'school', now() + interval '1 hour')`, [SCHOOL_A]));
    const missingTargets = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(
      `INSERT INTO public.notification_broadcasts (school_id, title, audience_type, status, scheduled_at) VALUES ($1, 'Exam week', 'classes', 'scheduled', now())`, [SCHOOL_A])));
    assert.match(missingTargets ?? "", /broadcasts_targets_check/);
    const cls = await asUser(db, t.users.adminA, (tx) => one<{ id: string }>(tx,
      `INSERT INTO public.notification_broadcasts (school_id, title, audience_type, audience_class_ids, status, scheduled_at)
       VALUES ($1, 'Exam week', 'classes', ARRAY[$2]::uuid[], 'scheduled', now() - interval '1 minute') RETURNING id`, [SCHOOL_A, a.class9A]));

    const userCall = await errorOf(() => asUser(db, t.users.adminA, (tx) => tx.query(`SELECT public.dispatch_due_notifications()`)));
    assert.match(userCall ?? "", /permission denied/);
    await db.query(`UPDATE public.announcements SET publish_at = now() - interval '1 second' WHERE title = 'Tomorrow'`);
    const result = await asService(db, (tx) => one<{ r: { broadcasts: number; announcements: number } }>(tx, `SELECT public.dispatch_due_notifications() AS r`));
    assert.deepEqual(result!.r, { broadcasts: 1, announcements: 1 });
    const sent = await one<{ status: string; sent_count: number }>(db, `SELECT status, sent_count FROM public.notification_broadcasts WHERE id = $1`, [cls!.id]);
    assert.equal(sent!.status, "sent");
    assert.ok(sent!.sent_count >= 3, "students, guardians and teachers of 9A");
  });

  it("allows users only to mark their own notifications read", async () => {
    const id = (await one<{ id: string }>(db, `SELECT id FROM public.notifications WHERE user_id = $1 LIMIT 1`, [t.users.parentA]))!.id;
    const other = await asUser(db, t.users.studentA, (tx) => tx.query(`UPDATE public.notifications SET is_read = true WHERE id = $1`, [id]));
    assert.equal(other.affectedRows, 0);
    const forge = await errorOf(() => asUser(db, t.users.parentA, (tx) => tx.query(`UPDATE public.notifications SET title = 'forged' WHERE id = $1`, [id])));
    assert.match(forge ?? "", /permission denied/);
    const own = await asUser(db, t.users.parentA, (tx) => tx.query(`UPDATE public.notifications SET is_read = true, read_at = now() WHERE id = $1`, [id]));
    assert.equal(own.affectedRows, 1);
  });
});
