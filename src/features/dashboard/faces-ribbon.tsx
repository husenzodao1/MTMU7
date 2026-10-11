import Link from "next/link";
import type { Face } from "@/features/dashboard/faces";

/**
 * At the foot of the dashboard, the school's people: the pupils studying now
 * and the graduates, each a row of small round photographs with a name under
 * them. The rows stand still and scroll sideways; a tap on a face opens that
 * person's profile. A row with nobody in it is left out.
 */

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
  return face.nickname ? (
    <Link href={`/u/${face.nickname}`} className="face">
      {inner}
    </Link>
  ) : (
    <span className="face">{inner}</span>
  );
}

function Row({ title, faces }: { title: string; faces: Face[] }) {
  if (faces.length === 0) return null;
  return (
    <div className="faces-row">
      <p className="faces-title">{title}</p>
      <ul className="faces-rail">
        {faces.map((face) => (
          <li key={face.id}>
            <FaceChip face={face} />
          </li>
        ))}
      </ul>
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
      <Row title={labels.active} faces={active} />
      <Row title={labels.graduates} faces={graduates} />
    </section>
  );
}
