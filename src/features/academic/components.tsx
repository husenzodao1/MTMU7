import { getLocale, getTranslations } from "next-intl/server";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/surface";
import { formatDateTime, formatNumber, formatShortDate, formatTime, minutesIn } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { getRequestTime } from "@/lib/request-time";
import type { StudentOverview } from "@/features/academic/queries";
import { lessonMoments } from "@/features/academic/lesson-time";
import { CalendarDays, NotebookPen, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { WorkCard } from "@/features/academic/work-card";

/**
 * A pupil's lessons today, each at its bell, with the one under way and the
 * next one marked against the school's clock (lesson-time.ts).
 */
export async function LessonList({ lessons, emptyLabel, timeZone }: { lessons: StudentOverview["lessons"]; emptyLabel: string; timeZone?: string }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.lessons");
  if (lessons.length === 0) return <EmptyState icon={<CalendarDays />} title={emptyLabel} className="py-6" />;
  const moments = lessonMoments(lessons, minutesIn(timeZone, new Date(getRequestTime())));
  return (
    <ol className="divide-y divide-line">
      {lessons.map((lesson, index) => (
        <li
          key={`${lesson.shift}-${lesson.period_number}`}
          className={cn(
            "flex items-start gap-3 py-2.5",
            moments[index] === "now" && "-mx-2 rounded-md bg-brand-50 px-2 ring-1 ring-brand-200",
            moments[index] === "past" && "opacity-60"
          )}
        >
          <div className="w-16 shrink-0 text-sm tabular">
            <span className="block font-semibold text-ink">{t("period", { number: lesson.period_number })}</span>
            {lesson.start_time ? (
              <span className="block text-xs text-ink-muted">
                {formatTime(lesson.start_time)}–{formatTime(lesson.end_time)}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{pickText({ tg: lesson.subject_tg, ru: lesson.subject_ru, en: lesson.subject_en }, locale)}</p>
            <p className="text-sm text-ink-muted">
              {[lesson.teacher, lesson.room ? t("room", { room: lesson.room }) : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          {moments[index] === "now" ? <Badge tone="brand" dot>{t("now")}</Badge> : moments[index] === "next" ? <Badge>{t("next")}</Badge> : null}
          {lesson.is_substitution ? <Badge tone="warning">{t("substitution")}</Badge> : null}
        </li>
      ))}
    </ol>
  );
}

export async function HomeworkDueList({ items, hrefBase = "/homework" }: { items: StudentOverview["homework_due"]; hrefBase?: string }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.homework");
  const tc = await getTranslations("common.status");
  if (items.length === 0) return <EmptyState icon={<NotebookPen />} title={t("nothingDue")} className="py-6" />;
  return (
    <ul className="work-list">
      {items.map((item) => {
        const overdue = item.due_at ? new Date(item.due_at).getTime() < getRequestTime() : false;
        const subject = pickText({ tg: item.subject_tg, ru: item.subject_ru, en: item.subject_en }, locale);
        return (
          <WorkCard
            key={item.id}
            compact
            href={`${hrefBase}/${item.id}`}
            eyebrow={<span className="work-chip">{subject}</span>}
            title={item.title}
            side={item.submission_status ? <StatusBadge status={item.submission_status} label={tc(item.submission_status)} /> : null}
          >
            {item.due_at ? (
              <p className={cn("tabular", overdue && "work-overdue")}>{t("due", { date: formatDateTime(item.due_at, locale) })}</p>
            ) : null}
          </WorkCard>
        );
      })}
    </ul>
  );
}

export function scoreTone(score: number, max: number): "success" | "warning" | "danger" | "neutral" {
  if (!max) return "neutral";
  const ratio = score / max;
  if (ratio >= 0.75) return "success";
  if (ratio >= 0.5) return "warning";
  return "danger";
}

export async function GradeList({ grades }: { grades: StudentOverview["latest_grades"] }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("portal.grades");
  if (grades.length === 0) return <EmptyState icon={<GraduationCap />} title={t("none")} className="py-6" />;
  return (
    <ul className="divide-y divide-line">
      {grades.map((grade) => (
        <li key={grade.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="font-medium text-ink">{pickText({ tg: grade.subject_tg, ru: grade.subject_ru, en: grade.subject_en }, locale)}</p>
            <p className="text-sm text-ink-muted">
              {pickText({ tg: grade.assessment_tg, ru: grade.assessment_ru, en: grade.assessment_en }, locale)} · {formatShortDate(grade.grade_date, locale)}
            </p>
          </div>
          <Badge tone={scoreTone(grade.score, grade.max_score)} className="text-sm tabular">
            {formatNumber(grade.score, locale)} / {formatNumber(grade.max_score, locale)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export async function AttendanceSummary({ summary }: { summary: StudentOverview["attendance_term"] }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("common.status");
  const tp = await getTranslations("portal.attendance");
  // A journal records the exceptions: a blank square means the child was in
  // their seat, so counting 'present' rows would put almost everybody at nought
  // per cent. The denominator is the lessons that were held — or, in a school
  // that calls the roll every time, the register's own rows, whichever is more.
  const held = Math.max(summary.lessons ?? 0, summary.total);
  const missed = summary.absent + summary.excused;
  const rate = held > 0 ? (Math.max(held - missed, 0) / held) * 100 : null;
  const items = [
    { key: "present", value: summary.present },
    { key: "late", value: summary.late },
    { key: "absent", value: summary.absent },
    { key: "excused", value: summary.excused },
  ] as const;
  return (
    <div>
      <p className="text-sm text-ink-muted">{tp("rate")}</p>
      <p className="text-2xl font-semibold tabular">{rate === null ? "—" : `${formatNumber(rate, locale)}%`}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-md bg-surface-muted px-3 py-2">
            <dt className="text-xs text-ink-muted">{t(item.key)}</dt>
            <dd className="font-semibold tabular">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
