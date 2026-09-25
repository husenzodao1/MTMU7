import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, SCHOOL_A, type Tenants } from "./fixtures.mts";
import { seedAcademic, type Academic } from "./academic-fixtures.mts";

let db: Db;
let t: Tenants;
let a: Academic;

const CHAT = 5150001;
const OTHER_CHAT = 5150002;

interface Codes {
  student_id: string;
  class_name: string;
  full_name: string;
  nickname: string | null;
  login: string | null;
  code: string;
}

const service = <T,>(sql: string, params: unknown[] = []) =>
  asService(db, (tx) => one<T>(tx, sql, params));

const issue = (actor: string, klass: string) =>
  asUser(db, actor, (tx) => rows<Codes>(tx, `SELECT * FROM public.issue_parent_codes($1)`, [klass]));

const touch = (chat: number) =>
  service<{ r: { locale: string; state: string; subscribed: boolean; children: Array<{ id: string; name: string }> } }>(
    `SELECT public.telegram_touch($1) AS r`,
    [chat.toString()]
  ).then((r) => r!.r);

const find = (chat: number, needle: string) =>
  service<{ r: { found: boolean; ambiguous?: boolean; noCode?: boolean } }>(
    `SELECT public.telegram_find_child($1, $2) AS r`,
    [chat.toString(), needle]
  ).then((r) => r!.r);

const confirm = (chat: number, code: string) =>
  service<{ r: { ok: boolean; reason?: string; child?: { name: string } } }>(
    `SELECT public.telegram_confirm_child($1, $2) AS r`,
    [chat.toString(), code]
  ).then((r) => r!.r);

const due = () =>
  service<{ r: Array<{ id: string; chat: number; kind: string; grade: unknown; absence: unknown }> }>(
    `SELECT public.telegram_due(50) AS r`
  ).then((r) => r!.r);

let codes: Codes[];
let pupil: Codes;

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
  a = await seedAcademic(db, t);
  // A nickname is the friendly way in; the login is the reliable one.
  await db.query(`UPDATE public.users SET nickname = 'somon' WHERE id = $1`, [t.users.studentA]);
});
after(async () => {
  await db.close();
});

describe("the slips the school hands out", () => {
  before(async () => {
    codes = await issue(t.users.adminA, a.class9A);
    pupil = codes.find((row) => row.nickname === "somon")!;
  });

  it("gives every pupil in the class a code, once", async () => {
    assert.ok(codes.length >= 2, "the class has pupils");
    assert.ok(pupil, "the pupil with the nickname is in the sheet");
    for (const row of codes) {
      assert.match(row.code, /^[23456789abcdefghijkmnpqrstuvwxyz]{8}$/, row.full_name);
    }
    assert.equal(new Set(codes.map((row) => row.code)).size, codes.length, "no two pupils share a code");
  });

  it("keeps the code nowhere it can be read back", async () => {
    const stored = await one<{ hash: string }>(
      db,
      `SELECT code_hash AS hash FROM public.parent_codes WHERE student_id = $1`,
      [pupil.student_id]
    );
    assert.ok(stored!.hash.startsWith("$2"), "a bcrypt digest, not the code");
    assert.ok(!stored!.hash.includes(pupil.code), "the code itself is not in the row");
  });

  it("is refused to somebody who may not change pupils", async () => {
    assert.equal(await errorOf(() => issue(t.users.teacherA, a.class9A)), "forbidden");
    assert.equal(await errorOf(() => issue(t.users.studentA, a.class9A)), "forbidden");
  });

  it("is invisible to a signed-in user, and to nobody at all", async () => {
    // The table carries row level security and no policies whatsoever, so a
    // select is not refused — it simply comes back empty, for the head teacher
    // as for a stranger. Only the definer functions see the digests.
    const seen = await asUser(db, t.users.adminA, (tx) =>
      one<{ n: string }>(tx, `SELECT count(*)::text AS n FROM public.parent_codes`)
    );
    assert.equal(seen!.n, "0");
    const anon = await asAnon(db, (tx) =>
      one<{ n: string }>(tx, `SELECT count(*)::text AS n FROM public.parent_codes`).catch(() => null)
    );
    assert.ok(!anon || anon.n === "0", "row level security answers with nothing");
  });
});

describe("a parent linking their child", () => {
  it("finds the child by nickname", async () => {
    await touch(CHAT);
    assert.deepEqual(await find(CHAT, "somon"), { found: true, noCode: false });
  });

  it("finds the same child by the school login", async () => {
    const login = await one<{ public_id: string }>(db, `SELECT public_id FROM public.users WHERE id = $1`, [
      t.users.studentA,
    ]);
    assert.deepEqual(await find(CHAT, login!.public_id.toLowerCase()), { found: true, noCode: false });
  });

  it("says nothing useful about a name that is not there", async () => {
    const result = await find(CHAT, "nobody-at-all");
    assert.equal(result.found, false);
  });

  it("refuses the wrong code and counts the attempt", async () => {
    await find(CHAT, "somon");
    assert.deepEqual(await confirm(CHAT, "wrongone"), { ok: false, reason: "wrong" });
    const chat = await one<{ attempts: number }>(db, `SELECT attempts FROM public.telegram_chats WHERE chat_id = $1`, [
      CHAT.toString(),
    ]);
    assert.equal(chat!.attempts, 1);
  });

  it("stops answering after five wrong codes", async () => {
    for (let i = 0; i < 4; i += 1) await confirm(CHAT, "stillwrong");
    assert.deepEqual(await confirm(CHAT, pupil.code), { ok: false, reason: "blocked" }, "even the right one waits");
    await db.query(`UPDATE public.telegram_chats SET attempts = 0, blocked_until = NULL WHERE chat_id = $1`, [
      CHAT.toString(),
    ]);
  });

  it("links the child when the code is right, and clears the count", async () => {
    const result = await confirm(CHAT, pupil.code);
    assert.equal(result.ok, true);
    assert.equal(result.child?.name, pupil.full_name);
    const state = await touch(CHAT);
    assert.equal(state.children.length, 1);
    assert.equal(state.state, "idle");
  });

  it("will not take a code that has been replaced", async () => {
    const reissued = await issue(t.users.adminA, a.class9A);
    await touch(OTHER_CHAT);
    await find(OTHER_CHAT, "somon");
    assert.deepEqual(await confirm(OTHER_CHAT, pupil.code), { ok: false, reason: "wrong" }, "the old slip is dead");
    const fresh = reissued.find((row) => row.student_id === pupil.student_id)!;
    assert.equal((await confirm(OTHER_CHAT, fresh.code)).ok, true);
    pupil = fresh;
  });

  it("leaves a parent already linked alone when codes are reissued", async () => {
    const state = await touch(CHAT);
    assert.equal(state.children.length, 1, "a code is a door, not a licence");
  });
});

describe("what a chat may read", () => {
  it("answers about the child it was given", async () => {
    const report = await service<{ r: { child: { name: string }; grades: unknown[] } }>(
      `SELECT public.telegram_report($1, $2, 'day', NULL) AS r`,
      [CHAT.toString(), a.students.studentA]
    );
    assert.equal(report!.r.child.name, pupil.full_name);
  });

  it("refuses a pupil it was never given, however the id was come by", async () => {
    assert.equal(
      await errorOf(() =>
        service(`SELECT public.telegram_report($1, $2, 'day', NULL)`, [CHAT.toString(), a.students.student2A])
      ),
      "forbidden"
    );
  });

  it("is closed to everybody but the webhook", async () => {
    for (const actor of [t.users.adminA, t.users.teacherA]) {
      assert.match(
        (await errorOf(() =>
          asUser(db, actor, (tx) =>
            tx.query(`SELECT public.telegram_report($1, $2, 'day', NULL)`, [CHAT.toString(), a.students.studentA])
          )
        )) ?? "",
        /permission denied/i
      );
    }
  });
});

describe("what the parent is told, and when", () => {
  it("queues a mark for every chat that follows the pupil, twelve minutes out", async () => {
    await db.query(`DELETE FROM public.telegram_outbox`);
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id,
                                    score, max_score, grade_date, status)
         VALUES ($1, $2, $3, $4, $5, 5, 5, current_date, 'recorded')`,
        [SCHOOL_A, a.students.studentA, a.mathA, a.termCurrent, a.assessmentTest]
      )
    );
    // Both chats followed this pupil above — a mother and a father, each with
    // their own phone. Each gets their own message.
    const queued = await rows<{ kind: string; wait: string }>(
      db,
      `SELECT kind, (send_after > now() + interval '10 minutes')::text AS wait
       FROM public.telegram_outbox ORDER BY chat_id`
    );
    assert.deepEqual(queued, [
      { kind: "grade", wait: "true" },
      { kind: "grade", wait: "true" },
    ]);
  });

  it("rewrites the waiting message when the teacher corrects the mark", async () => {
    await db.query(
      `UPDATE public.grades SET score = 4 WHERE student_id = $1 AND class_subject_id = $2 AND grade_date = current_date`,
      [a.students.studentA, a.mathA]
    );
    const queued = await rows<{ n: string }>(db, `SELECT count(*)::text AS n FROM public.telegram_outbox`);
    assert.deepEqual(queued, [{ n: "2" }], "a correction inside the window is not a second message");
  });

  it("queues an absence but never a day the pupil was present", async () => {
    await db.query(`DELETE FROM public.telegram_outbox`);
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.attendance_records (school_id, student_id, class_id, class_subject_id, attendance_date, status)
         VALUES ($1, $2, $3, $4, current_date, 'absent'), ($1, $2, $3, $4, current_date - 1, 'present')`,
        [SCHOOL_A, a.students.studentA, a.class9A, a.mathA]
      )
    );
    const queued = await rows<{ kind: string }>(db, `SELECT kind FROM public.telegram_outbox ORDER BY chat_id`);
    assert.deepEqual(queued, [{ kind: "absence" }, { kind: "absence" }], "the day they were there says nothing");
  });

  it("says nothing at all to a chat that follows nobody", async () => {
    await db.query(`DELETE FROM public.telegram_outbox`);
    await db.query(`DELETE FROM public.telegram_children WHERE chat_id = $1`, [OTHER_CHAT.toString()]);
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id,
                                    score, max_score, grade_date, status)
         VALUES ($1, $2, $3, $4, $5, 3, 5, current_date - 2, 'recorded')`,
        [SCHOOL_A, a.students.unlinkedA, a.mathA, a.termCurrent, a.assessmentTest]
      )
    );
    const queued = await rows<{ chat: string }>(db, `SELECT chat_id::text AS chat FROM public.telegram_outbox`);
    assert.deepEqual(queued, [], "nobody follows that pupil");
  });

  it("hands the sender everything it needs to word the message", async () => {
    await db.query(`DELETE FROM public.telegram_outbox`);
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(
        `INSERT INTO public.grades (school_id, student_id, class_subject_id, academic_term_id, assessment_type_id,
                                    score, max_score, grade_date, status)
         VALUES ($1, $2, $3, $4, $5, 4, 5, current_date, 'recorded')`,
        [SCHOOL_A, a.students.studentA, a.mathA, a.termCurrent, a.assessmentTest]
      )
    );
    await db.query(`UPDATE public.telegram_outbox SET send_after = now() - interval '1 minute'`);
    const batch = await due();
    assert.equal(batch.length, 1, "the other chat unfollowed in the test above");
    const item = batch[0] as unknown as {
      kind: string;
      child: { name: string };
      grade: { score: number; subject: { tg: string } };
    };
    assert.equal(item.kind, "grade");
    assert.equal(item.child.name, pupil.full_name);
    assert.equal(Number(item.grade.score), 4);
    assert.ok(item.grade.subject.tg.length > 0, "the subject comes through in Tajik");
  });

  it("hides a claimed message from the next run, and gives up after three tries", async () => {
    // The sender runs every minute. A run that overlaps the one before it must
    // not send the same message a second time.
    assert.deepEqual(await due(), [], "claimed, and out of sight");
    const hidden = await one<{ ahead: boolean }>(
      db,
      `SELECT send_after > now() AS ahead FROM public.telegram_outbox WHERE sent_at IS NULL LIMIT 1`
    );
    assert.equal(hidden!.ahead, true);

    // A process that died comes back to it, but not for ever.
    await db.query(`UPDATE public.telegram_outbox SET send_after = now() - interval '1 minute'`);
    assert.equal((await due()).length, 1, "a message nobody confirmed is tried again");
    await db.query(`UPDATE public.telegram_outbox SET send_after = now() - interval '1 minute', attempts = 3`);
    assert.deepEqual(await due(), [], "a message that keeps failing is left alone");
  });

  it("marks what was sent, and never sends it again", async () => {
    await db.query(`UPDATE public.telegram_outbox SET attempts = 0`);
    const batch = await due();
    await asService(db, (tx) =>
      tx.query(`SELECT public.telegram_delivered($1::uuid[])`, [`{${batch.map((m) => m.id).join(",")}}`])
    );
    await db.query(`UPDATE public.telegram_outbox SET send_after = now() - interval '1 hour', attempts = 0`);
    assert.deepEqual(await due(), []);
  });

  it("forgets a chat that blocked the bot, and its queue with it", async () => {
    await asService(db, (tx) => tx.query(`SELECT public.telegram_forget($1)`, [CHAT.toString()]));
    const left = await rows<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM public.telegram_outbox WHERE chat_id = $1`,
      [CHAT.toString()]
    );
    assert.deepEqual(left, [{ n: "0" }]);
  });
});
