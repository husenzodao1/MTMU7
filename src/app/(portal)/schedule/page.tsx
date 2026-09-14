import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { ChildSwitcher } from "@/features/academic/child-switcher";
import { resolveStudentContext } from "@/features/academic/student-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { canAny } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatTime, todayIso } from "@/lib/i18n/format";
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
  const context = await resolveStudentContext(access, params);

  if (context?.classId) {
    const { data } = await supabase.rpc("class_timetable", { p_class_id: context.classId });
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

  const today = new Date(`${todayIso(access.school?.timezone)}T12:00:00Z`).getUTCDay() || 7;
  const days = [1, 2, 3, 4, 5, 6].filter((d) => d <= 5 || slots.some((s) => s.day === d));

  return (
    <>
      <PageHeader title={t("title")} description={subtitle} />
      {context ? <ChildSwitcher context={context} pathname="/schedule" /> : null}
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
    </>
  );
}
