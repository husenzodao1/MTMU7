import { NavIcon } from "@/components/shell/nav-icon";
import type { IconName } from "@/components/shell/navigation";

/**
 * The bottom bar's icons, each with a small act of its own when its section
 * is chosen (motion.css, "the bottom bar"): the dashboard's four blocks flip
 * over two by two, the library's book opens and a page turns (and it closes
 * again when another section is chosen), the board's chart draws itself, the
 * calendar turns a leaf and ticks the day, the pen writes a line, the message
 * bubble pops and starts typing, the newspaper's lines run in.
 *
 * Drawn on lucide's 24-unit grid at its stroke, so they sit with every other
 * icon in the portal. A section without an act of its own uses its plain icon.
 */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Dashboard() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="dashboard" aria-hidden {...STROKE}>
      <rect className="bar-block bar-block-a" x="3" y="3" width="7.5" height="9" rx="1.6" />
      <rect className="bar-block bar-block-b" x="13.5" y="3" width="7.5" height="5" rx="1.6" />
      <rect className="bar-block bar-block-b" x="3" y="15" width="7.5" height="6" rx="1.6" />
      <rect className="bar-block bar-block-a" x="13.5" y="11" width="7.5" height="10" rx="1.6" />
    </svg>
  );
}

function Library() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="library" aria-hidden {...STROKE}>
      {/* Shut: a book seen from the front. Chosen, it folds away into the
          spine as the two halves unfold from it, and a page turns. */}
      <path className="bar-book-shut" d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <g className="bar-book-open">
        <path className="bar-book-left" d="M12 7a4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3" />
        <path className="bar-book-right" d="M12 7a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3" />
        <path d="M12 7v14" />
      </g>
      <path className="bar-book-leaf" d="M12 7a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3" />
    </svg>
  );
}

function Teach() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="teach" aria-hidden {...STROKE}>
      <path d="M2 3h20" />
      <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
      <path d="M7 21l5-5 5 5" />
      <path className="bar-chart" pathLength={1} d="M7 12l3-3 3 2 4-4" />
    </svg>
  );
}

function Schedule() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="schedule" aria-hidden {...STROKE}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path className="bar-leaf" d="M3 10h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path className="bar-tick" pathLength={1} d="M8.5 16l2.5 2.5 4.5-5" />
    </svg>
  );
}

function Homework() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="homework" aria-hidden {...STROKE}>
      <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <path className="bar-scribble" pathLength={1} d="M8.5 17c1-1.2 1.8.9 2.8 0s1.8-1.2 2.8 0" />
      <path className="bar-pen" d="M21.4 5.6a1 1 0 1 0-3-3l-5 5a2 2 0 0 0-.5.85l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .85-.5z" />
    </svg>
  );
}

function Messages() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="messages" aria-hidden {...STROKE}>
      <path className="bar-bubble" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <g className="bar-typing" fill="currentColor" stroke="none">
        <circle cx="8" cy="10" r="1.15" />
        <circle cx="12" cy="10" r="1.15" />
        <circle cx="16" cy="10" r="1.15" />
      </g>
    </svg>
  );
}

function News() {
  return (
    <svg viewBox="0 0 24 24" className="bar-icon" data-icon="news" aria-hidden {...STROKE}>
      <path d="M15 18h-5" />
      <path d="M18 14h-8" />
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" />
      <rect className="bar-headline" x="10" y="6" width="8" height="4" rx="1" />
      <path className="bar-line bar-line-1" d="M10 14h8" />
      <path className="bar-line bar-line-2" d="M10 18h5" />
    </svg>
  );
}

const ANIMATED: Partial<Record<IconName, () => React.ReactElement>> = {
  dashboard: Dashboard,
  library: Library,
  teach: Teach,
  schedule: Schedule,
  homework: Homework,
  messages: Messages,
  news: News,
};

export function BarIcon({ name }: { name: IconName }) {
  const Icon = ANIMATED[name];
  return Icon ? <Icon /> : <NavIcon name={name} className="bar-icon" />;
}
