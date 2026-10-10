import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cardHeight, markTone, reportCardModel } from "../../src/lib/telegram/report-card-model.ts";
import type { Report } from "../../src/lib/telegram/messages.ts";

const named = (tg: string) => ({ tg, ru: `${tg} (ru)`, en: `${tg} (en)` });

const report: Report = {
  child: { name: "Алӣ Каримов", class: "5А" },
  from: "2026-09-21",
  to: "2026-09-27",
  grades: [
    { date: "2026-09-27", score: 5, max: 5, subject: named("Математика"), work: named("Санҷиш") },
    { date: "2026-09-26", score: 18, max: 20, subject: named("Забони англисӣ"), work: named("Тест") },
    { date: "2026-09-25", score: 2, max: 5, subject: named("Химия"), work: named("Шифоҳӣ"), final: true },
  ],
  attendance: [{ date: "2026-09-27", status: "excused", period: 3, subject: named("Физика") }],
};

describe("the report picture's contents", () => {
  it("reads a mark as a colour the way the text report does", () => {
    assert.deepEqual([markTone(5, 5), markTone(4, 5), markTone(3, 5), markTone(2, 5), markTone(18, 20)], ["great", "good", "fair", "poor", "great"]);
  });

  it("puts every mark and absence on a line of its own, in the reader's language", () => {
    const model = reportCardModel("ru", report, "day", { name: "МТМУ №7" });
    assert.equal(model.child, "Алӣ Каримов");
    assert.equal(model.className, "5А");
    assert.equal(model.dateLine, "27.09.2026");
    const [grades, attendance] = model.sections;
    assert.deepEqual(grades!.rows.map((r) => [r.title, r.value, r.tone]), [
      ["Математика (ru)", "5", "great"],
      ["Забони англисӣ (ru)", "18/20", "great"],
      ["Химия (ru)", "2", "poor"],
    ]);
    assert.equal(attendance!.rows[0]!.tone, "excused");
    assert.match(attendance!.rows[0]!.detail ?? "", /3/);
  });

  it("averages the marks on five, leaving the term mark out", () => {
    const model = reportCardModel("tg", report, "day");
    assert.equal(model.average?.value, "4.8", "5 and 18/20 (4.5), not the final 2");
  });

  it("says there was nothing, and grows with what there is", () => {
    const empty = reportCardModel("tg", { ...report, grades: [], attendance: [] }, "day");
    assert.equal(empty.sections.length, 0);
    assert.ok(empty.empty);
    const full = reportCardModel("tg", report, "week");
    assert.ok(cardHeight(full) > cardHeight(empty));
    assert.match(full.dateLine, /21\.09\.2026 – 27\.09\.2026/);
  });

  it("draws the term's results as one line a subject, with the average as its badge", () => {
    const results: Report = {
      child: { name: "Алӣ Каримов", class: "5А" },
      from: "2026-09-01",
      to: "2026-10-10",
      term: { name: "Чоряки 1", from: "2026-09-01", to: "2026-10-31" },
      grades: [],
      attendance: [],
      results: [
        { subject: named("Математика"), marks: [{ score: 5, max: 5 }, { score: 4, max: 5 }], average: 4.5, absences: 1, late: 0 },
        { subject: named("Физика"), marks: [], average: null, absences: 0, late: 0 },
      ],
    };
    const model = reportCardModel("tg", results, "results");
    assert.equal(model.dateLine, "Чоряки 1 · 01.09.2026 – 10.10.2026");
    assert.deepEqual(model.sections[0]!.rows.map((r) => [r.title, r.value, r.tone, r.detail]), [
      ["Математика", "4.5", "great", "5  4 · ғоиб 1"],
      ["Физика", "—", "plain", "—"],
    ]);
    assert.equal(model.average?.value, "4.5");
    assert.equal(model.empty, null);
  });
});
