import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asService, asUser, createDatabase, errorOf, one, rows, type Db } from "./harness.mts";
import { seedTenants, type Tenants } from "./fixtures.mts";

let db: Db;
let t: Tenants;

const APP_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 MTMU7App";
const DEVICE = "dev_abcdef123456";

before(async () => {
  db = await createDatabase();
  t = await seedTenants(db);
});
after(async () => {
  await db.close();
});

const log = (device: string, userAgent: string, events: unknown) =>
  asAnon(db, (tx) =>
    one<{ n: number }>(tx, `SELECT public.log_app_diagnostics($1, $2, $3::jsonb) AS n`, [device, userAgent, JSON.stringify(events)])
  ).then((row) => row?.n);

describe("what the phone app saw", () => {
  it("takes the app's facts from a page nobody is signed in to", async () => {
    const written = await log(DEVICE, APP_UA, [
      { event: "boot", path: "/login?next=%2Fdashboard", detail: { bridge: true, plugins: ["App", "GoogleAccount"] } },
      { event: "google.result", path: "/login", detail: { code: "not_configured" } },
    ]);
    assert.equal(written, 2);
    const saved = await asService(db, (tx) =>
      rows<{ event: string; path: string; detail: { code?: string } }>(tx, `SELECT event, path, detail FROM public.app_diagnostics WHERE device = $1 ORDER BY id`, [DEVICE])
    );
    assert.deepEqual(saved.map((row) => row.event), ["boot", "google.result"]);
    assert.equal(saved[0]!.path, "/login", "the query string is dropped");
    assert.equal(saved[1]!.detail.code, "not_configured");
  });

  it("knows who, when somebody is signed in", async () => {
    await asUser(db, t.users.teacherA, (tx) =>
      tx.query(`SELECT public.log_app_diagnostics($1, $2, $3::jsonb)`, ["dev_signedin_0001", APP_UA, JSON.stringify([{ event: "boot" }])])
    );
    const row = await asService(db, (tx) => one<{ user_id: string }>(tx, `SELECT user_id FROM public.app_diagnostics WHERE device = 'dev_signedin_0001'`));
    assert.equal(row?.user_id, t.users.teacherA);
  });

  it("ignores anything that is not the app, and anything malformed", async () => {
    assert.equal(await log(DEVICE, "Mozilla/5.0 Chrome/140.0", [{ event: "boot" }]), 0, "a browser");
    assert.equal(await log("x", APP_UA, [{ event: "boot" }]), 0, "a device id too short");
    assert.equal(await log(DEVICE, APP_UA, { event: "boot" }), 0, "not a list");
    assert.equal(await log(DEVICE, APP_UA, [{ event: "Robert'); DROP TABLE" }, { event: "ok" }, "boot"]), 1);
    const big = await log(DEVICE, APP_UA, [{ event: "big", detail: { blob: "x".repeat(5000) } }]);
    assert.equal(big, 1);
    const detail = await asService(db, (tx) => one<{ detail: object }>(tx, `SELECT detail FROM public.app_diagnostics WHERE event = 'big'`));
    assert.deepEqual(detail?.detail, {}, "an oversized detail is dropped, the event kept");
  });

  it("takes at most 25 at a time and 300 an hour from one phone", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ event: `e${i}` }));
    assert.equal(await log("dev_flood_000001", APP_UA, many), 25);
    for (let i = 0; i < 11; i += 1) await log("dev_flood_000001", APP_UA, many);
    const count = await asService(db, (tx) => one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM public.app_diagnostics WHERE device = 'dev_flood_000001'`));
    assert.equal(count?.n, 300);
  });

  it("is never readable or writable directly by the app's users", async () => {
    assert.match((await errorOf(() => asAnon(db, (tx) => tx.query(`SELECT * FROM public.app_diagnostics`)))) ?? "", /permission denied/);
    assert.match(
      (await errorOf(() => asUser(db, t.users.teacherA, (tx) => tx.query(`SELECT * FROM public.app_diagnostics`)))) ?? "",
      /permission denied/
    );
    assert.match(
      (await errorOf(() => asAnon(db, (tx) => tx.query(`INSERT INTO public.app_diagnostics (device, event) VALUES ('dev_direct_0001', 'x')`)))) ?? "",
      /permission denied/
    );
  });
});
