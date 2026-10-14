/**
 * Where each of today's lessons stands against the clock: over, under way,
 * the next to begin, or later in the day. The bells are fixed (00086), so a
 * lesson's start and end are its bell's.
 *
 * Pure, so it can be tested without a clock.
 */
export type LessonMoment = "past" | "now" | "next" | "later";

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/** `lessons` in the order they are taught; `now` in minutes since midnight at the school. */
export function lessonMoments(lessons: ReadonlyArray<{ start_time: string | null; end_time: string | null }>, now: number): LessonMoment[] {
  let nextGiven = false;
  return lessons.map((lesson) => {
    if (!lesson.start_time || !lesson.end_time) return "later";
    if (now >= minutes(lesson.end_time)) return "past";
    if (now >= minutes(lesson.start_time)) return "now";
    if (nextGiven) return "later";
    nextGiven = true;
    return "next";
  });
}
