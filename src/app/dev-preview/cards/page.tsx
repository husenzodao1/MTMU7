import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { toneFor, WarmCard } from "@/features/academic/warm-card";

/** Homework and topic cards with sample work, for looking at. Development only. */
const SAMPLES = [
  { subject: "Математика", title: "Мавзӯи 12. Касрҳои оддӣ", pages: "саҳ. 45–47, машқи 112", due: "Сешанбе, 14 окт, 08:00", status: "pending" },
  { subject: "Забони тоҷикӣ", title: "Иншо: «Тирамоҳ дар деҳаи мо»", pages: "саҳ. 30", due: "Чоршанбе, 15 окт", status: "submitted" },
  { subject: "Табиатшиносӣ", title: "Растаниҳои шифобахши Тоҷикистон", pages: null, due: "Панҷшанбе, 16 окт", status: "missing" },
  { subject: "Хониш", title: "Ҳикояи «Модар» — хондан ва нақл кардан", pages: "саҳ. 22–25", due: "Ҷумъа, 17 окт", status: "graded" },
];

export default function CardsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-2xl bg-canvas p-4">
      <ul className="warm-list stagger-in">
        {SAMPLES.map((s, i) => (
          <WarmCard key={i} tone={toneFor(s.subject)} href="#" eyebrow={<span className="warm-chip">{s.subject}</span>} title={s.title} side={<StatusBadge status={s.status} label={s.status} />}>
            {s.pages ? <p>Саҳифаҳо: {s.pages}</p> : null}
            <p className="tabular">Мӯҳлат: {s.due}</p>
          </WarmCard>
        ))}
      </ul>
    </main>
  );
}
