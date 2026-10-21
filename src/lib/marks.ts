/**
 * The school marks out of ten (00097). A mark given on another scale — a test
 * out of twenty, a mark from before the school moved to ten — is read on ten
 * wherever marks are averaged or compared.
 */
export const MARK_SCALE = 10;

/** A mark as it reads on the school's scale: 18 out of 20 is 9. */
export function onScale(score: number, max: number): number {
  return max === MARK_SCALE ? score : (score / max) * MARK_SCALE;
}
