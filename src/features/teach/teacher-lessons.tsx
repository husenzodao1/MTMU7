import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import type { TeacherToday } from "@/features/academic/queries";
import { lessonMoments } from "@/features/academic/lesson-time";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatTime, minutesIn } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { getRequestTime } from "@/lib/request-time";
import { cn } from "@/lib/utils/cn";

/**
 * A teacher's lessons today, on the dashboard and on the teaching page alike:
 * each at its bell (08:50–09:35), the one under way marked "now" and the next
 * one "next", the ones already over dimmed, and — for a teacher with classes
 * in both shifts — the second shift set apart, since the periods count from
 * one again there.
 */
export async function TeacherLessons({
  lessons,
  today,
  timeZone,
  emptyLabel,
}: {
  lessons: TeacherToday["lessons"];
  today: string;
  timeZone?: string;
  emptyLabel: string;
}) {
  const t = await getTranslations("portal.dashboard.teacher");
  const tl = await getTranslations("portal.lessons");
  const locale = (await getLocale()) as Locale;
  if (lessons.length === 0) return <p className="text-sm text-ink-muted">{emptyLabel}</p>;

  const moments = lessonMoments(lessons, minutesIn(timeZone, new Date(getRequestTime())));
  const bothShifts = new Set(lessons.map((lesson) => lesson.shift)).size > 1;

  return (
    <ol className="divide-y divide-line">
      {lessons.map((lesson, index) => {
        const moment = moments[index];
        const shiftStarts = bothShifts && (index === 0 || lessons[index - 1]!.shift !== lesson.shift);
        return (
          <li key={lesson.timetable_entry_id} className="py-2.5">
            {shiftStarts ? (
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{tl("shift", { shift: lesson.shift })}</p>
            ) : null}
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md",
                moment === "now" && "-mx-2 bg-brand-50 px-2 py-1.5 ring-1 ring-brand-200",
                moment === "past" && "opacity-60"
              )}
            >
              <span className="w-[5.5rem] shrink-0 text-sm tabular">
                <span className="block font-semibold text-ink">{tl("period", { number: lesson.period_number })}</span>
                {lesson.start_time ? (
                  <span className="block text-xs text-ink-muted">
                    {formatTime(lesson.start_time)}–{formatTime(lesson.end_time)}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {lesson.class_name} · {pickText({ tg: lesson.subject_tg, ru: lesson.subject_ru, en: lesson.subject_en }, locale)}
                </span>
                {lesson.room || lesson.is_substitution ? (
                  <span className="block text-sm text-ink-muted">
                    {[lesson.room ? tl("room", { room: lesson.room }) : null, lesson.is_substitution ? t("substitution") : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
              {moment === "now" ? (
                <Badge tone="brand" dot>{tl("now")}</Badge>
              ) : moment === "next" ? (
                <Badge>{tl("next")}</Badge>
              ) : null}
              {lesson.cancelled_for_me ? (
                <Badge>{t("covered")}</Badge>
              ) : lesson.attendance_marked ? (
                <Badge tone="success" dot>{t("marked")}</Badge>
              ) : (
                <Link
                  href={`/teach/attendance?classSubject=${lesson.class_subject_id}&date=${today}&period=${lesson.period_number}`}
                  className={buttonClasses(moment === "now" ? "primary" : "secondary", "sm")}
                >
                  <ClipboardCheck aria-hidden />
                  {t("mark")}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
