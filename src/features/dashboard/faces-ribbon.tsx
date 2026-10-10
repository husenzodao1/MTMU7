import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { DriftRow } from "@/features/dashboard/drift-row";
import type { Face } from "@/features/dashboard/faces";

/**
 * Across the very top of the dashboard, two ribbons of faces drift by: on the
 * left the pupils studying now, sliding left; on the right the school's
 * graduates, sliding the other way. Small round photographs in a thin ring, a
 * small name under each. A finger holds a ribbon or drags it (DriftRow); a tap
 * on a face opens that person's profile. Without graduates yet, empty rings
 * with a cap drift in their place.
 */

/** Enough faces in one copy to be wider than half a phone, so the loop never shows a gap. */
const MIN_LOOP = 8;

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
      <span className="face-ring">
        {face.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars are public storage URLs of any size
          <img src={face.avatar} alt="" className="face-img" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <span className="face-img face-initials">{initials(face.name)}</span>
        )}
      </span>
      <span className="face-name">{face.name}</span>
    </>
  );
  // The repeats that only fill the loop are not read out.
  if (!face.nickname) {
    return (
      <span className="face" aria-hidden={echo || undefined}>
        {inner}
      </span>
    );
  }
  return (
    <Link href={`/u/${face.nickname}`} className="face" draggable={false} aria-hidden={echo || undefined} tabIndex={echo ? -1 : undefined}>
      {inner}
    </Link>
  );
}

function Ribbon({ kind, title, faces }: { kind: "active" | "graduates"; title: string; faces: Face[] }) {
  const loop = repeated(faces, MIN_LOOP);
  return (
    <div className={`faces-half faces-${kind}`}>
      <p className="faces-title">{title}</p>
      <DriftRow direction={kind === "active" ? "left" : "right"} speed={14} className="faces-window">
        {loop.length
          ? loop.map((face, index) => <FaceChip key={`${face.id}-${index}`} face={face} echo={index >= faces.length} />)
          : Array.from({ length: MIN_LOOP }, (_, index) => (
              <span key={index} className="face" aria-hidden>
                <span className="face-ring">
                  <span className="face-img face-initials face-empty">
                    <GraduationCap className="size-3.5" />
                  </span>
                </span>
                <span className="face-name">&nbsp;</span>
              </span>
            ))}
      </DriftRow>
    </div>
  );
}

export function FacesRibbon({
  active,
  graduates,
  labels,
}: {
  active: Face[];
  graduates: Face[];
  labels: { title: string; active: string; graduates: string };
}) {
  return (
    <section className="faces" aria-label={labels.title}>
      <Ribbon kind="active" title={labels.active} faces={active} />
      <Ribbon kind="graduates" title={labels.graduates} faces={graduates} />
    </section>
  );
}
