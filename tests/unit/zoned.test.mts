import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isoToLocalInput, localDayRangeIso, localInputToIso } from "../../src/lib/i18n/zoned.ts";

describe("school time zone conversions", () => {
  it("interprets datetime-local values in Asia/Dushanbe (UTC+5)", () => {
    assert.equal(localInputToIso("2026-09-15T08:30"), "2026-09-15T03:30:00.000Z");
    assert.equal(isoToLocalInput("2026-09-15T03:30:00.000Z"), "2026-09-15T08:30");
  });

  it("handles zones with daylight saving time", () => {
    assert.equal(localInputToIso("2026-07-01T12:00", "Europe/Berlin"), "2026-07-01T10:00:00.000Z");
    assert.equal(localInputToIso("2026-01-01T12:00", "Europe/Berlin"), "2026-01-01T11:00:00.000Z");
  });

  it("turns calendar-day filters into a half-open instant range", () => {
    // Asia/Dushanbe is UTC+5: the day starts at 19:00 the previous UTC day.
    assert.deepEqual(localDayRangeIso("2026-09-15", "2026-09-15"), {
      start: "2026-09-14T19:00:00.000Z",
      end: "2026-09-15T19:00:00.000Z",
    });
    // Month and year boundaries roll over, and each bound is independent.
    assert.equal(localDayRangeIso(null, "2026-12-31").end, "2026-12-31T19:00:00.000Z");
    assert.equal(localDayRangeIso("2026-09-15", null).end, null);
    assert.equal(localDayRangeIso(null, null).start, null);
    // Across a DST change the end is still the next local midnight, not +24h.
    assert.equal(localDayRangeIso("2026-03-29", "2026-03-29", "Europe/Berlin").end, "2026-03-29T22:00:00.000Z");
  });

  it("rejects malformed input", () => {
    assert.equal(localInputToIso("15.09.2026 08:30"), null);
    assert.equal(localInputToIso(""), null);
    assert.equal(isoToLocalInput("not a date"), "");
    assert.deepEqual(localDayRangeIso("15.09.2026", "tomorrow"), { start: null, end: null });
  });
});
