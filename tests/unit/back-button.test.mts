import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backAction, EXIT_MS } from "../../src/lib/native/back.ts";

const press = (over: Partial<Parameters<typeof backAction>[0]>) =>
  backAction({ path: "/schedule", overlayOpen: false, canGoBack: true, armedAt: 0, now: 100_000, ...over });

describe("Android's back button in the app", () => {
  it("closes whatever is open first, wherever it is", () => {
    assert.deepEqual(press({ overlayOpen: true }), { kind: "close" });
    assert.deepEqual(press({ overlayOpen: true, path: "/dashboard" }), { kind: "close" });
    assert.deepEqual(press({ overlayOpen: true, path: "/notifications" }), { kind: "close" });
  });

  it("on the first page asks for a second press, and only that one leaves", () => {
    assert.deepEqual(press({ path: "/dashboard" }), { kind: "hint" });
    assert.deepEqual(press({ path: "/dashboard", armedAt: 100_000 - 500 }), { kind: "leave" });
    assert.deepEqual(press({ path: "/dashboard", armedAt: 100_000 - EXIT_MS - 1 }), { kind: "hint" }, "too late: asked again");
    // Even with history behind it: the first page is where back stops.
    assert.deepEqual(press({ path: "/dashboard", canGoBack: true }), { kind: "hint" });
  });

  it("goes one page back elsewhere, or home when there is nothing before", () => {
    assert.deepEqual(press({ path: "/notifications" }), { kind: "back" });
    assert.deepEqual(press({ path: "/schedule", canGoBack: false }), { kind: "replace", path: "/dashboard" });
  });
});
