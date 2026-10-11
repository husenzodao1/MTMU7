import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, Repeat2 } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { resolveStudentContext } from "@/features/academic/student-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatShortDate, formatTime, todayIso } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import type { SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("schedule") };
}

interface Slot {
  key: string;
  day: number;
  shift: number;
  period: number;
  start: string | null;
  end: string | null;
  subject: string;
  detail: string;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("schedule");
  const t = await getTranslations("portal.schedule");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const supabase = await createClient();

  let slots: Slot[] = [];
  let subtitle: string | undefined;
  let teachers: Array<{ name: string; subjects: string; phone: string | null }> = [];
  let substitutions: Array<{ key: string; date: string; period: number; subject: string; teacher: string | null; room: string | null }> = [];
  const context = await resolveStudentContext(access, params);

  if (context?.classId) {
    const [{ data }, { data: staff }, { data: changes }] = await Promise.all([
      supabase.rpc("class_timetable", { p_class_id: context.classId }),
      supabase.rpc("class_teachers", { p_class_id: context.classId }),
      supabase.rpc("class_substitutions", { p_class_id: context.classId }),
    ]);
    substitutions = (changes ?? []).flatMap((row) =>
      row.substitution_date && row.period_number
        ? [
            {
              key: `${row.substitution_date}-${row.period_number}`,
              date: row.substitution_date,
              period: row.period_number,
              subject: pickText({ tg: row.subject_tg, ru: row.subject_ru, en: row.subject_en }, locale),
              teacher: row.teacher_name,
              room: row.room_name,
            },
          ]
        : []
    );
    teachers = (staff ?? []).map((row) => ({
      name: row.teacher_name ?? "",
      subjects: pickText({ tg: row.subjects_tg, ru: row.subjects_ru, en: row.subjects_en }, locale),
      phone: row.phone,
    }));
    subtitle = [context.viewer === "guardian" ? `${context.firstName} ${context.lastName}` : null, context.className].filter(Boolean).join(" · ");
    slots = (data ?? []).map((e) => ({
      key: e.timetable_entry_id ?? `${e.day_of_week}-${e.period_number}`,
      day: e.day_of_week ?? 0,
      shift: e.shift ?? 1,
      period: e.period_number ?? 0,
      start: e.start_time,
      end: e.end_time,
      subject: pickText({ tg: e.subject_tg, ru: e.subject_ru, en: e.subject_en }, locale),
      detail: [e.teacher_name, e.room_name ? t("room", { room: e.room_name }) : null].filter(Boolean).join(" · "),
    }));
  } else if (canAny(access, ["grades.enter", "attendance.mark"])) {
    const { data } = await supabase.rpc("my_teaching_timetable");
    subtitle = t("teaching");
    slots = (data ?? []).map((e) => ({
      key: e.timetable_entry_id ?? `${e.day_of_week}-${e.period_number}`,
      day: e.day_of_week ?? 0,
      shift: e.shift ?? 1,
      period: e.period_number ?? 0,
      start: e.start_time,
      end: e.end_time,
      subject: `${e.class_name} · ${pickText({ tg: e.subject_tg, ru: e.subject_ru, en: e.subject_en }, locale)}`,
      detail: e.room_name ? t("room", { room: e.room_name }) : "",
    }));
  }

  // The bells of the shifts these lessons are in.
  const shifts = [...new Set(slots.map((slot) => slot.shift))].sort();
  const { data: bellRows } = shifts.length
    ? await supabase
        .from("bell_periods")
        .select("shift, period_number, start_time, end_time")
        .eq("school_id", access.school!.id)
        .in("shift", shifts)
        .order("shift")
        .order("period_number")
    : { data: [] };
  const bells = bellRows ?? [];

  const today = new Date(`${todayIso(access.school?.timezone)}T12:00:00Z`).getUTCDay() || 7;
  const days = [1, 2, 3, 4, 5, 6].filter((d) => d <= 5 || slots.some((s) => s.day === d));

  return (
    <>
      <PageHeader title={t("title")} description={subtitle} />
      {context ? <ChildSwitcher context={context} pathname="/schedule" /> : null}
      {/* The week's changes first: a lesson taken by somebody else is the one thing that differs from the table below. */}
      {substitutions.length > 0 ? (
        <section aria-labelledby="substitutions" className="mb-4 rounded-xl border border-warning-600/30 bg-warning-50 px-4 py-3">
          <h2 id="substitutions" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning-700">
            <Repeat2 className="size-3.5" aria-hidden />
            {t("substitutions")}
          </h2>
          <ul className="mt-1.5 space-y-1 text-sm">
            {substitutions.map((change) => (
              <li key={change.key} className="flex flex-wrap items-baseline gap-x-2 text-ink">
                <span className="tabular text-xs text-ink-muted">
                  {tc(`weekdaysShort.${new Date(`${change.date}T12:00:00Z`).getUTCDay() || 7}`)} {formatShortDate(change.date, locale).slice(0, 5)} · {t("lessonNumber", { number: change.period })}
                </span>
                <span className="font-medium">{change.subject}</span>
                <span className="text-ink-secondary">
                  {change.teacher ? t("takenBy", { name: change.teacher }) : t("noTeacherYet")}
                  {change.room ? ` · ${t("room", { room: change.room })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {slots.length === 0 ? (
        <Card as="div">
          <EmptyState icon={<CalendarDays />} title={t("empty")} description={t("emptyHint")} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const daySlots = slots.filter((s) => s.day === day);
            return (
              <Card key={day} className={cn(day === today && "border-brand-300 ring-1 ring-brand-200")}>
                <CardHeader
                  title={tc(`weekdays.${day}`)}
                  actions={day === today ? <Badge tone="brand">{t("today")}</Badge> : null}
                />
                <CardBody className="py-2">
                  {daySlots.length === 0 ? (
                    <p className="py-3 text-sm text-ink-muted">{t("noLessons")}</p>
                  ) : (
                    <ol className="divide-y divide-line">
                      {daySlots.map((slot) => (
                        <li key={slot.key} className="flex gap-3 py-2.5">
                          <div className="w-14 shrink-0 text-sm tabular">
                            <span className="block font-semibold">{slot.period}</span>
                            {slot.start ? <span className="block text-xs text-ink-muted">{formatTime(slot.start)}</span> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{slot.subject}</p>
                            {slot.detail ? <p className="text-sm text-ink-muted">{slot.detail}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Under the timetable: who teaches the class, numbered, then the bells. */}
      {teachers.length > 0 ? (
        <section aria-labelledby="class-teachers" className="mt-5">
          <h2 id="class-teachers" className="mini-heading">{t("teachersTitle")}</h2>
          <div className="mini-table-wrap">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col" className="w-8">№</th>
                  <th scope="col">{t("teacher")}</th>
                  <th scope="col">{t("subjects")}</th>
                  <th scope="col">{t("phone")}</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher, index) => (
                  <tr key={`${teacher.name}-${index}`}>
                    <td className="tabular text-ink-muted">{index + 1}</td>
                    <td className="font-medium text-ink">{teacher.name}</td>
                    <td>{teacher.subjects}</td>
                    <td className="tabular whitespace-nowrap">
                      {teacher.phone ? <a href={`tel:${teacher.phone.replace(/[^\d+]/g, "")}`} className="text-brand-text hover:underline">{teacher.phone}</a> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {bells.length > 0 ? (
        <section aria-labelledby="bells" className="mt-5">
          <h2 id="bells" className="mini-heading">{t("bellsTitle")}</h2>
          <div className={cn("grid gap-3", shifts.length > 1 && "sm:grid-cols-2")}>
            {shifts.map((shift) => (
              <div key={shift} className="mini-table-wrap">
                <table className="mini-table">
                  {shifts.length > 1 ? <caption>{t("shift", { shift })}</caption> : null}
                  <thead>
                    <tr>
                      <th scope="col" className="w-12">{t("lesson")}</th>
                      <th scope="col">{t("time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bells
                      .filter((bell) => bell.shift === shift)
                      .map((bell) => (
                        <tr key={bell.period_number}>
                          <td className="tabular font-semibold text-ink">{bell.period_number}</td>
                          <td className="tabular">
                            {formatTime(bell.start_time)} – {formatTime(bell.end_time)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
