import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lessonMoments } from "../../src/features/academic/lesson-time.ts";
import { minutesIn } from "../../src/lib/i18n/format.ts";

/** The school's fixed bells (00086): the first shift's first three lessons and the second shift's first. */
const lessons = [
  { start_time: "08:05:00", end_time: "08:45:00" },
  { start_time: "08:50:00", end_time: "09:35:00" },
  { start_time: "09:40:00", end_time: "10:25:00" },
  { start_time: "13:00:00", end_time: "13:45:00" },
];
const at = (hours: number, mins: number) => hours * 60 + mins;

describe("today's lessons against the bells", () => {
  it("before school, the first lesson is next", () => {
    assert.deepEqual(lessonMoments(lessons, at(7, 30)), ["next", "later", "later", "later"]);
  });

  it("during a lesson it is under way and the one after it is next", () => {
    assert.deepEqual(lessonMoments(lessons, at(9, 0)), ["past", "now", "next", "later"]);
  });

  it("at the bell that ends a lesson the lesson is over", () => {
    assert.deepEqual(lessonMoments(lessons, at(8, 45)), ["past", "next", "later", "later"]);
  });

  it("between the shifts the second shift's lesson is next", () => {
    assert.deepEqual(lessonMoments(lessons, at(11, 0)), ["past", "past", "past", "next"]);
  });

  it("after the last lesson nothing is next", () => {
    assert.deepEqual(lessonMoments(lessons, at(18, 0)), ["past", "past", "past", "past"]);
  });

  it("a lesson without a bell is simply later", () => {
    assert.deepEqual(lessonMoments([{ start_time: null, end_time: null }], at(9, 0)), ["later"]);
  });
});

describe("the minute of the day where the school is", () => {
  it("is Dushanbe's, five hours ahead of UTC", () => {
    assert.equal(minutesIn("Asia/Dushanbe", new Date("2026-10-09T04:00:00Z")), at(9, 0));
    assert.equal(minutesIn("Asia/Dushanbe", new Date("2026-10-09T19:05:00Z")), at(0, 5));
  });
});
