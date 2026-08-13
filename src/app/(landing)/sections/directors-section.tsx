interface Director {
  fullName: string;
  position: string;
  photoUrl?: string | null;
  yearStart: number;
  yearEnd?: number | null;
}

interface DirectorsSectionProps {
  title: string;
  directors: Director[];
}

export function DirectorsSection({ title, directors }: DirectorsSectionProps) {
  return (
    <section className="bg-neutral-50 py-16 sm:py-20" id="directors">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-8 space-y-6">
          {directors.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm animate-list-item"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {d.photoUrl ? (
                <img
                  src={d.photoUrl}
                  alt={d.fullName}
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
                  {d.fullName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900 truncate">{d.fullName}</p>
                <p className="text-sm text-neutral-500">{d.position}</p>
                <p className="text-xs text-neutral-400">
                  {d.yearStart}–{d.yearEnd ?? "..."}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
