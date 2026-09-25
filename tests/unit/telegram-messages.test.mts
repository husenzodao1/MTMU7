import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absenceMessage,
  asLocale,
  childMenu,
  day,
  gradeMessage,
  LOCALES,
  markDot,
  menu,
  reportMessage,
  stillNotSubscribed,
  welcome,
  words,
  type Loc,
  type Report,
} from "../../src/lib/telegram/messages.ts";

const child = { name: "Ҳакимов Сомон", class: "9Т" };
const school = { name: "МТМУ №7" };

const grade = {
  score: 5,
  max: 5,
  date: "2026-09-25",
  subject: { tg: "Математика", ru: "Математика", en: "Mathematics" },
  work: { tg: "Кори синфӣ", ru: "Работа на уроке", en: "Classwork" },
};

/** Telegram closes the connection on an unbalanced tag, so the check is real. */
function tagsBalance(html: string): boolean {
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    const [, closing, tag] = match as unknown as [string, string, string];
    if (closing) {
      if (stack.pop() !== tag) return false;
    } else {
      stack.push(tag);
    }
  }
  return stack.length === 0;
}

describe("every message the bot can send", () => {
  const report: Report = {
    child,
    from: "2026-09-19",
    to: "2026-09-25",
    grades: [
      { ...grade, final: false },
      { ...grade, score: 3, work: { tg: "Вазифаи хонагӣ", ru: "Домашнее задание", en: "Homework" } },
    ],
    attendance: [{ date: "2026-09-25", status: "absent", period: 2, subject: grade.subject }],
    timetable: [{ period: 1, subject: grade.subject, room: "204", teacher: "Ҳусейнзода Фаррух" }],
  };

  it("is written in all three of the school's languages", () => {
    for (const locale of LOCALES) {
      const w = words(locale);
      assert.ok(w.greeting.length > 0, locale);
      assert.ok(w.subscribeButton.length > 0, locale);
      assert.ok(w.newGrade.length > 0, locale);
    }
  });

  it("closes every tag it opens", () => {
    for (const locale of LOCALES) {
      const pieces = [
        welcome(locale, "@istaravshan_schools", "МТМУ №7").text,
        stillNotSubscribed(locale, "@istaravshan_schools").text,
        gradeMessage(locale, child, grade, school),
        absenceMessage(locale, child, { status: "late", date: "2026-09-25", period: 3, subject: grade.subject }, school),
        reportMessage(locale, report, "day", school),
        reportMessage(locale, report, "week", school),
        reportMessage(locale, report, "timetable", school),
        menu(locale, [{ id: "1", ...child }]).text,
        childMenu(locale, child, "1").text,
      ];
      for (const piece of pieces) {
        assert.ok(tagsBalance(piece), `${locale}: ${piece.slice(0, 60)}`);
      }
    }
  });

  it("escapes what a person typed, so one odd name cannot break every message", () => {
    const awkward = { name: "A <b>& Co</b>", class: "9<Т" };
    const text = gradeMessage("tg", awkward, grade, school);
    assert.ok(text.includes("A &lt;b&gt;&amp; Co&lt;/b&gt;"), "the name is shown, not obeyed");
    assert.ok(!text.includes("<b>&"), "no smuggled tag survives");
    assert.ok(tagsBalance(text));
  });

  it("stays inside Telegram's limit even for a busy week", () => {
    const busy: Report = {
      ...report,
      grades: Array.from({ length: 60 }, () => grade),
      attendance: Array.from({ length: 40 }, () => ({ date: "2026-09-25", status: "absent", period: 1, subject: grade.subject })),
    };
    for (const locale of LOCALES) {
      assert.ok(reportMessage(locale, busy, "week", school).length < 4096, locale);
    }
  });
});

describe("the small things a parent reads first", () => {
  it("writes a date the way a Tajik school form does", () => {
    assert.equal(day("2026-09-25"), "25.09.2026");
    assert.equal(day(null), "");
  });

  it("colours a mark by what it is out of, not by the number", () => {
    assert.equal(markDot(5, 5), "🟢");
    assert.equal(markDot(4, 5), "🔵");
    assert.equal(markDot(3, 5), "🟡");
    assert.equal(markDot(2, 5), "🔴");
    // Out of a hundred, eighty is the same mark as four out of five.
    assert.equal(markDot(80, 100), "🔵");
    assert.equal(markDot(0, 0), "🔴", "a maximum of nothing must not divide by zero");
  });

  it("falls back to Tajik for a language the school does not keep", () => {
    assert.equal(asLocale("fr"), "tg");
    assert.equal(asLocale(null), "tg");
    assert.equal(asLocale("ru"), "ru");
  });

  it("puts the channel behind a button and in the text, for whoever taps neither", () => {
    for (const locale of LOCALES) {
      const card = welcome(locale as Loc, "@istaravshan_schools");
      assert.ok(card.text.includes("@istaravshan_schools"));
      assert.equal(card.keyboard[0]![0]!.url, "https://t.me/istaravshan_schools");
      assert.equal(card.keyboard[1]![0]!.callback_data, "check");
    }
  });

  it("says plainly when there is nothing to say", () => {
    const quiet: Report = { child, from: "2026-09-25", to: "2026-09-25", grades: [], attendance: [] };
    const text = reportMessage("ru", quiet, "day", school);
    assert.ok(text.includes(words("ru").nothingToday));
  });

  it("leaves the term mark out of the average, and shows no average for one mark", () => {
    const withFinal: Report = {
      child,
      to: "2026-09-25",
      grades: [
        { ...grade, score: 3 },
        { ...grade, score: 5 },
        { ...grade, score: 5, final: true },
      ],
      attendance: [],
    };
    const text = reportMessage("ru", withFinal, "day", school);
    assert.ok(text.includes("4.0"), "three and five average four; the term mark is a verdict, not a mark");

    const single: Report = { child, to: "2026-09-25", grades: [grade], attendance: [] };
    assert.ok(!reportMessage("ru", single, "day", school).includes(words("ru").average));
  });
});
