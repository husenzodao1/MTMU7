import Link from "next/link";
import { DriftRow } from "@/features/dashboard/drift-row";
import type { Face } from "@/features/dashboard/faces";

/**
 * At the foot of the dashboard, the school's people: the pupils studying now
 * and the graduates, each a row of small round photographs with a name under
 * them. A full row drifts slowly sideways on its own — the pupils one way, the
 * graduates the other — and a finger moves it either way (drift-row.tsx); a
 * short row stands still. A tap on a face opens that person's profile. A row
 * with nobody in it is left out.
 */

/** Fewer faces than this fill no screen: the row stands still rather than loop. */
const DRIFT_FROM = 6;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function FaceChip({ face }: { face: Face }) {
  const inner = (
    <>
      {face.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars are public storage URLs of any size
        <img src={face.avatar} alt="" className="face-img" loading="lazy" decoding="async" />
      ) : (
        <span className="face-img face-initials" aria-hidden>
          {initials(face.name)}
        </span>
      )}
      <span className="face-name">{face.name}</span>
    </>
  );
  return (
    <Link href={face.nickname ? `/u/${face.nickname}` : `/profile/${face.id}`} className="face">
      {inner}
    </Link>
  );
}

function Row({ title, faces, direction }: { title: string; faces: Face[]; direction: "left" | "right" }) {
  if (faces.length === 0) return null;
  const chips = faces.map((face) => (
    <li key={face.id}>
      <FaceChip face={face} />
    </li>
  ));
  return (
    <div className="faces-row">
      <p className="faces-title">{title}</p>
      {faces.length >= DRIFT_FROM ? (
        <DriftRow direction={direction} speed={14} className="faces-drift">
          <ul className="faces-set">{chips}</ul>
        </DriftRow>
      ) : (
        <ul className="faces-rail">{chips}</ul>
      )}
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
      <Row title={labels.active} faces={active} direction="left" />
      <Row title={labels.graduates} faces={graduates} direction="right" />
    </section>
  );
}
