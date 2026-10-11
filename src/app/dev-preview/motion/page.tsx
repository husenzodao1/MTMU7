import { notFound } from "next/navigation";
import { GreetingCard } from "@/features/dashboard/greeting-card";
import { WEATHER_KINDS, type Weather, type WeatherKind } from "@/features/dashboard/weather-kind";
import type { DayPart } from "@/lib/i18n/format";

/**
 * Every hour against every sky, side by side, for looking at while the
 * movements are made. Development only.
 */
const PARTS: DayPart[] = ["morning", "day", "evening", "night"];

export default async function MotionPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const parts = params.part ? [params.part as DayPart] : PARTS;
  const kinds = params.weather ? [params.weather as WeatherKind] : (["clear", ...WEATHER_KINDS.filter((k) => k !== "clear")] as WeatherKind[]);
  const name = params.name ?? "Фарангис";
  const weather = (kind: WeatherKind, windy = false): Promise<Weather | null> => Promise.resolve({ kind, temperature: kind === "snow" ? -3 : 18, wind: windy ? 30 : 6, windy });

  return (
    <main className="mx-auto grid max-w-6xl gap-4 bg-canvas p-4 sm:grid-cols-2">
      {parts.flatMap((part) =>
        kinds.map((kind) => (
          <div key={`${part}-${kind}`}>
            <p className="mb-1 text-xs text-ink-muted">
              {part} · {kind}
            </p>
            <GreetingCard name={name} initialPart={part} preview dateLine="Душанбе, 11 октябр" weather={weather(kind, params.windy === "1")} />
          </div>
        ))
      )}
    </main>
  );
}
