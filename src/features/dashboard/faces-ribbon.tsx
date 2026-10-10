import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { CSSProperties } from "react";
import type { Face } from "@/features/dashboard/faces";

/**
 * Across the very top of the dashboard, two ribbons of faces drift by: on the
 * left the pupils studying now, sliding left; on the right the school's
 * graduates, sliding the other way. Small round photographs, a name under each
 * in the crest's unicase. Pure CSS (the "dashboard faces" section of
 * globals.css): the ribbon is two identical copies moved by half its width, so
 * the loop has no seam. A pointer over it holds it still; with reduced motion
 * it does not move at all and scrolls by hand instead.
 */

/** Enough faces in one copy to be wider than half a phone, so the loop never shows a gap. */
const MIN_LOOP = 8;
/** Seconds each face takes to pass: slow. */
const SECONDS_PER_FACE = 3.4;

function repeated<T>(items: T[], min: number): T[] {
  if (items.length === 0) return [];
  const out = [...items];
  while (out.length < min) out.push(...items);
  return out;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function FaceChip({ face, echo }: { face: Face; echo: boolean }) {
  const inner = (
    <>
      {face.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are public storage URLs of any size
        <img src={face.avatar} alt="" className="face-img" loading="lazy" decoding="async" />
      ) : (
        <span className="face-img face-initials">{initials(face.name)}</span>
      )}
      <span className="face-name">{face.name}</span>
      <span className="face-detail">{face.detail ?? " "}</span>
    </>
  );
  // The copies that only make the loop seamless are not read out, nor reached by Tab.
  if (echo || !face.nickname) {
    return (
      <span className="face" aria-hidden={echo || undefined}>
        {inner}
      </span>
    );
  }
  return (
    <Link href={`/u/${face.nickname}`} className="face">
      {inner}
    </Link>
  );
}

function Ribbon({
  kind,
  title,
  count,
  faces,
  emptyLabel,
}: {
  kind: "active" | "graduates";
  title: string;
  count: number;
  faces: Face[];
  emptyLabel: string;
}) {
  const loop = repeated(faces, MIN_LOOP);
  return (
    <div className={`faces-half faces-${kind}`}>
      <p className="faces-title">
        <span>{title}</span>
        <span className="faces-count">{faces.length ? count : emptyLabel}</span>
      </p>
      <div className="faces-window">
        {loop.length ? (
          <div className="faces-track" style={{ "--faces-duration": `${loop.length * SECONDS_PER_FACE}s` } as CSSProperties}>
            {[0, 1].map((copy) => (
              <div key={copy} className="faces-set" aria-hidden={copy === 1 || undefined}>
                {loop.map((face, index) => (
                  <FaceChip key={`${face.id}-${index}`} face={face} echo={copy === 1 || index >= faces.length} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          // Nobody yet: caps where the faces will be, drifting all the same.
          <div className="faces-track" style={{ "--faces-duration": `${MIN_LOOP * SECONDS_PER_FACE}s` } as CSSProperties} aria-hidden>
            {[0, 1].map((copy) => (
              <div key={copy} className="faces-set">
                {Array.from({ length: MIN_LOOP }, (_, index) => (
                  <span key={index} className="face">
                    <span className="face-img face-initials face-empty">
                      <GraduationCap className="size-4" />
                    </span>
                    <span className="face-name">&nbsp;</span>
                    <span className="face-detail">&nbsp;</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FacesRibbon({
  active,
  graduates,
  counts,
  labels,
}: {
  active: Face[];
  graduates: Face[];
  counts: { active: number; graduates: number };
  labels: { title: string; active: string; graduates: string; none: string };
}) {
  return (
    <section className="faces" aria-label={labels.title}>
      <Ribbon kind="active" title={labels.active} count={counts.active} faces={active} emptyLabel={labels.none} />
      <Ribbon kind="graduates" title={labels.graduates} count={counts.graduates} faces={graduates} emptyLabel={labels.none} />
    </section>
  );
}
