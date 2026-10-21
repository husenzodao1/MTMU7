import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resilientFetch } from "../../src/lib/supabase/resilient-fetch.ts";

function fakeFetch(answers: Array<number | "reset" | "hang">) {
  const calls: string[] = [];
  const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    const answer = answers.shift() ?? 200;
    if (answer === "reset") throw new TypeError("fetch failed");
    if (answer === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    }
    return new Response("{}", { status: answer });
  }) as typeof fetch;
  return { impl, calls };
}

const quick = { timeoutMs: 50, backoffMs: () => 1 };

describe("the portal's fetch", () => {
  it("asks a read again after a gateway error, and returns the answer that came", async () => {
    const fake = fakeFetch([503, 502, 200]);
    const response = await resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x");
    assert.equal(response.status, 200);
    assert.equal(fake.calls.length, 3);
  });

  it("gives up after two more tries and hands back the last answer", async () => {
    const fake = fakeFetch([503, 503, 503, 200]);
    const response = await resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x");
    assert.equal(response.status, 503);
    assert.equal(fake.calls.length, 3);
  });

  it("never sends a write twice", async () => {
    const fake = fakeFetch([503]);
    const response = await resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x", { method: "POST", body: "{}" });
    assert.equal(response.status, 503);
    assert.equal(fake.calls.length, 1);

    const reset = fakeFetch(["reset"]);
    await assert.rejects(resilientFetch({ ...quick, fetchImpl: reset.impl })("https://db.example/rest/v1/x", { method: "PATCH" }));
    assert.equal(reset.calls.length, 1);
  });

  it("tries a read again after a dropped connection", async () => {
    const fake = fakeFetch(["reset", 200]);
    const response = await resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x");
    assert.equal(response.status, 200);
  });

  it("abandons a request that never answers", async () => {
    const fake = fakeFetch(["hang", "hang", "hang"]);
    await assert.rejects(resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x"), /took too long/);
    assert.equal(fake.calls.length, 3);
  });

  it("leaves a caller's own cancel alone", async () => {
    const fake = fakeFetch(["hang", 200]);
    const controller = new AbortController();
    const pending = resilientFetch({ timeoutMs: 5_000, backoffMs: () => 1, fetchImpl: fake.impl })("https://db.example/rest/v1/x", { signal: controller.signal });
    controller.abort(new Error("changed my mind"));
    await assert.rejects(pending, /changed my mind/);
    assert.equal(fake.calls.length, 1);
  });

  it("passes other answers straight through", async () => {
    const fake = fakeFetch([404]);
    const response = await resilientFetch({ ...quick, fetchImpl: fake.impl })("https://db.example/rest/v1/x");
    assert.equal(response.status, 404);
    assert.equal(fake.calls.length, 1);
  });
});
