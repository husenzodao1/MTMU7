import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatDate, formatDateTime, formatMonth, formatNumber } from "../../src/lib/i18n/format.ts";

/**
 * Tajik is written out by hand because browsers do not carry it. These are the
 * strings Node's own ICU produces, so the server renders exactly what it did
 * before, and a browser now renders the same.
 */
describe("Tajik dates, the same on the server and in every browser", () => {
  const instant = "2026-09-26T14:05:00Z";

  it("matches ICU's Tajik for every month", () => {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(Date.UTC(2026, month, 15, 6));
      const icuLong = new Intl.DateTimeFormat("tg-TJ", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dushanbe" }).format(date);
      const icuShort = new Intl.DateTimeFormat("tg-TJ", { month: "short", year: "numeric", timeZone: "Asia/Dushanbe" }).format(date);
      assert.equal(formatDate(date, "tg"), icuLong);
      assert.equal(formatMonth(date, "tg"), icuShort);
    }
  });

  it("writes the day, the time and the number as ICU would", () => {
    assert.equal(formatDate(instant, "tg"), "26 Сентябр 2026");
    assert.equal(formatDate("2026-09-26", "tg"), "26 Сентябр 2026", "a bare date is the date, whatever the zone");
    assert.equal(formatDateTime(instant, "tg"), "26 Сен 2026, 19:05");
    assert.equal(formatClock(instant, "tg"), "19:05");
    assert.equal(formatClock("2026-09-26T19:30:00Z", "tg"), "00:30", "midnight is 00, never 24");
    assert.equal(formatNumber(1234567.56, "tg"), new Intl.NumberFormat("tg-TJ", { maximumFractionDigits: 1 }).format(1234567.56));
  });

  it("leaves the other languages to the browser", () => {
    assert.equal(formatDate(instant, "en"), "26 September 2026");
    assert.equal(formatDate(instant, "ru"), "26 сентября 2026 г.");
  });
});
