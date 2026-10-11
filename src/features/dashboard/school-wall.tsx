/**
 * The dashboard's wall: a dark blue with a school's things drawn faintly on
 * it, drifting like the bottom of a pool (motion.css, "the school wall").
 * Fixed behind the page, so it stays put while the page scrolls over it.
 */
export function SchoolWall() {
  return (
    <div className="school-wall" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}
