import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isoToLocalInput, localInputToIso } from "../../src/lib/i18n/zoned.ts";

describe("school time zone conversions", () => {
  it("interprets datetime-local values in Asia/Dushanbe (UTC+5)", () => {
    assert.equal(localInputToIso("2026-09-15T08:30"), "2026-09-15T03:30:00.000Z");
    assert.equal(isoToLocalInput("2026-09-15T03:30:00.000Z"), "2026-09-15T08:30");
  });

  it("handles zones with daylight saving time", () => {
    assert.equal(localInputToIso("2026-07-01T12:00", "Europe/Berlin"), "2026-07-01T10:00:00.000Z");
    assert.equal(localInputToIso("2026-01-01T12:00", "Europe/Berlin"), "2026-01-01T11:00:00.000Z");
  });

  it("rejects malformed input", () => {
    assert.equal(localInputToIso("15.09.2026 08:30"), null);
    assert.equal(localInputToIso(""), null);
    assert.equal(isoToLocalInput("not a date"), "");
  });
});
