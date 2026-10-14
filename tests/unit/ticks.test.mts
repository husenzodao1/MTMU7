import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tickState } from "../../src/features/messages/tick-state.ts";

const sentAt = "2026-10-12T10:00:00.000Z";
const at = (iso: string) => new Date(iso).getTime();

describe("the ticks after one's own message", () => {
  it("is one tick until the others have it", () => {
    assert.equal(tickState(sentAt, null, null), "sent");
    assert.equal(tickState(sentAt, at("2026-10-12T09:59:59.000Z"), null), "sent");
  });

  it("is two ticks once it has reached them, and blue once they have read it", () => {
    assert.equal(tickState(sentAt, at("2026-10-12T10:00:05.000Z"), null), "delivered");
    assert.equal(tickState(sentAt, at("2026-10-12T10:00:05.000Z"), at("2026-10-12T10:01:00.000Z")), "read");
  });

  it("counts reading as having it, whatever the delivery mark says", () => {
    assert.equal(tickState(sentAt, null, at("2026-10-12T10:00:00.000Z")), "read");
  });
});
