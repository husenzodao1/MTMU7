import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardBody, CardHeader } from "@/components/ui/surface";
import { formatNumber, formatShortDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export type StatsPeriod = "week" | "month" | "term";

const PERIODS: Record<StatsPeriod, { days: number; bucket: "day" | "week" }> = {
  week: { days: 7, bucket: "day" },
  month: { days: 30, bucket: "day" },
  term: { days: 120, bucket: "week" },
};

interface Stats {
  attendance: { present: number; absent: number; late: number; excused: number; recorded: number };
  days: Array<{ date: string; status: string }>;
  overall: { percent: number | null; points: number; maxPoints: number; count: number };
  subjects: Array<{ name: string; nameRu: string | null; nameEn: string | null; percent: number | null; points: number; count: number }>;
  series: Array<{ at: string; percent: number | null }>;
}

/** Bars, because a handful of readings is a comparison and not a trend line. */
function Chart({ series, locale, label }: { series: Stats["series"]; locale: Locale; label: string }) {
  const points = series.filter((p): p is { at: string; percent: number } => p.percent !== null);
  if (points.length === 0) return null;
  const width = 100;
  const gap = points.length > 1 ? 2 : 0;
  const barWidth = (width - gap * (points.length - 1)) / points.length;

  return (
    <figure className="mt-4">
      <figcaption className="sr-only">{label}</figcaption>
      <svg viewBox="0 0 100 40" className="h-24 w-full" role="img" aria-label={label} preserveAspectRatio="none">
        {points.map((point, index) => {
          const height = Math.max(1, (point.percent / 100) * 38);
          return (
            <rect
              key={point.at}
              x={index * (barWidth + gap)}
              y={40 - height}
              width={barWidth}
              height={height}
              rx={0.8}
              fill="var(--color-brand-solid)"
            >
              <title>{`${formatShortDate(point.at, locale)} · ${formatNumber(point.percent, locale)}%`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[0.6875rem] text-ink-muted tabular">
        <span>{formatShortDate(points[0]!.at, locale)}</span>
        {points.length > 1 ? <span>{formatShortDate(points[points.length - 1]!.at, locale)}</span> : null}
      </div>
    </figure>
  );
}

/**
 * How a pupil's term is going: how often they were there, how the marks stand
 * as a percentage and as points, and the same broken down by subject. Whoever
 * may not see this pupil gets nothing at all — the database decides, not this
 * component.
 */
export async function StudentStatistics({ userId, period = "term" }: { userId: string; period?: StatsPeriod }) {
  const t = await getTranslations("portal.statistics");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  const { data: student } = await supabase.from("students").select("id").eq("user_id", userId).maybeSingle();
  if (!student) return null;

  const { days, bucket } = PERIODS[period];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("student_statistics", {
    p_student: student.id,
    p_from: iso(from),
    p_to: iso(to),
    p_bucket: bucket,
  });
  if (error || !data) return null;
  const stats = data as unknown as Stats;

  const tiles = [
    { key: "present", value: stats.attendance.present, tone: "text-success-700" },
    { key: "absent", value: stats.attendance.absent, tone: "text-danger-700" },
    { key: "late", value: stats.attendance.late, tone: "text-warning-700" },
    { key: "excused", value: stats.attendance.excused, tone: "text-ink-secondary" },
  ] as const;

  return (
    <Card as="section" className="mt-5">
      <CardHeader
        title={t("title")}
        description={t("description")}
        actions={
          <nav aria-label={t("period")} className="flex gap-1">
            {(Object.keys(PERIODS) as StatsPeriod[]).map((key) => (
              <Link
                key={key}
                href={`?stats=${key}`}
                scroll={false}
                aria-current={key === period ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  key === period ? "bg-brand-50 text-brand-text-strong ring-1 ring-brand-300" : "text-ink-secondary hover:bg-surface-muted"
                )}
              >
                {t(`periods.${key}`)}
              </Link>
            ))}
          </nav>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.key} className="rounded-lg border border-line px-3 py-2">
              <p className="text-xs text-ink-muted">{t(`attendance.${tile.key}`)}</p>
              <p className={cn("mt-0.5 text-xl font-semibold tabular", tile.tone)}>{formatNumber(tile.value, locale)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-ink">{t("rating")}</p>
            <p className="text-sm text-ink-secondary tabular">
              {stats.overall.percent === null ? "—" : `${formatNumber(stats.overall.percent, locale)}%`}
              <span className="mx-1.5 text-line-strong" aria-hidden>·</span>
              {t("points", {
                points: formatNumber(stats.overall.points, locale),
                max: formatNumber(stats.overall.maxPoints, locale),
              })}
            </p>
          </div>
          <Chart series={stats.series} locale={locale} label={t("chartLabel")} />
        </div>

        {stats.subjects.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {stats.subjects.map((subject) => (
              <li key={subject.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {pickName({ name_tg: subject.name, name_ru: subject.nameRu, name_en: subject.nameEn }, locale)}
                </span>
                <span className="shrink-0 text-ink-secondary tabular">
                  {subject.percent === null ? "—" : `${formatNumber(subject.percent, locale)}%`}
                  <span className="mx-1.5 text-line-strong" aria-hidden>·</span>
                  {formatNumber(subject.points, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {stats.days.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t("missedDays")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {stats.days.map((day) => (
                <li
                  key={`${day.date}-${day.status}`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs tabular",
                    day.status === "absent" ? "border-danger-600/40 text-danger-700" : "border-warning-600/40 text-warning-700"
                  )}
                  title={t(`attendance.${day.status}`)}
                >
                  {formatShortDate(day.date, locale)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
