import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { saveRoomAction } from "@/features/admin/academic/structure-actions";
import {
  cancelSubstitutionAction,
  deleteTimetableEntryAction,
  saveBellScheduleAction,
  saveSubstitutionAction,
  saveTimetableEntryAction,
} from "@/features/admin/academic/schedule-actions";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { fullName, getClassOptions, getStaffOptions } from "@/features/admin/queries";
import { ActionForm, ConfirmAction, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { Checkbox } from "@/components/ui/form-controls";
import { TabNav } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, todayIso } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("timetable") };
}

const TABS = ["grid", "bells", "rooms", "substitutions"] as const;
const ROOM_TYPES = ["classroom", "laboratory", "computer_lab", "gym", "library", "hall", "workshop", "other"] as const;
type Named = { name_tg: string; name_ru: string | null; name_en: string | null };
type Person = { first_name: string; last_name: string; middle_name: string | null };

export default async function AdminTimetablePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("timetable.manage");
  const t = await getTranslations("admin.timetable");
  const tc = await getTranslations("common");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const tabRaw = firstValue(params.tab);
  const tab = TABS.includes(tabRaw as (typeof TABS)[number]) ? (tabRaw as (typeof TABS)[number]) : "grid";
  const schoolId = access.school!.id;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();
  const [classes, staff, { data: rooms }] = await Promise.all([
    getClassOptions(schoolId),
    getStaffOptions(schoolId),
    supabase.from("rooms").select("id, name, code, room_type, capacity, is_active").eq("school_id", schoolId).order("name"),
  ]);
  const roomOptions = (rooms ?? []).filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }));
  const staffOptions = staff.map(({ value, label }) => ({ value, label }));

  const header = (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/admin/timetable/import" className={buttonClasses("secondary")}>
            {t("import")}
          </Link>
        }
      />
      <TabNav label={t("sections")} items={TABS.map((key) => ({ href: key === "grid" ? "/admin/timetable" : `/admin/timetable?tab=${key}`, label: t(`tabs.${key}`), active: key === tab }))} />
    </>
  );

  if (tab === "bells") {
    const { data: bells } = await supabase.from("bell_periods").select("shift, period_number, start_time, end_time").eq("school_id", schoolId);
    return (
      <>
        {header}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* The school teaches in two shifts (00080). */}
          {[1, 2].map((shift) => {
            const byPeriod = new Map((bells ?? []).filter((b) => b.shift === shift).map((b) => [b.period_number, b]));
            return (
              <Card key={shift}>
                <CardHeader title={t("shift", { shift })} description={t("bellHint")} />
                <CardBody>
                  <ActionForm action={saveBellScheduleAction} className="space-y-3">
                    <input type="hidden" name="shift" value={shift} />
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t("shift", { shift })}</caption>
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-ink-muted">
                          <th scope="col" className="py-1 text-start">{t("period")}</th>
                          <th scope="col" className="py-1 text-start">{t("start")}</th>
                          <th scope="col" className="py-1 text-start">{t("end")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((period) => {
                          const bell = byPeriod.get(period);
                          return (
                            <tr key={period}>
                              <th scope="row" className="py-1 text-start font-medium tabular">{period}</th>
                              <td className="py-1 pe-2"><TextField name={`start_${period}`} id={`s${shift}-start-${period}`} type="time" label={<span className="sr-only">{t("startOf", { period })}</span>} defaultValue={bell?.start_time?.slice(0, 5) ?? ""} /></td>
                              <td className="py-1"><TextField name={`end_${period}`} id={`s${shift}-end-${period}`} type="time" label={<span className="sr-only">{t("endOf", { period })}</span>} defaultValue={bell?.end_time?.slice(0, 5) ?? ""} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <SubmitButton variant="secondary">{tc("save")}</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </>
    );
  }

  if (tab === "rooms") {
    const roomFields = (room?: NonNullable<typeof rooms>[number]) => (
      <>
        {room ? <input type="hidden" name="id" value={room.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="name" label={t("roomName")} defaultValue={room?.name} required maxLength={50} />
          <TextField name="code" label={t("roomCode")} defaultValue={room?.code ?? ""} maxLength={20} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField name="roomType" label={t("roomType")} defaultValue={room?.room_type ?? "classroom"} options={ROOM_TYPES.map((r) => ({ value: r, label: t(`roomTypes.${r}`) }))} />
          <TextField name="capacity" type="number" min={1} label={t("capacity")} defaultValue={room?.capacity ?? ""} />
        </div>
        {room ? <Checkbox name="isActive" defaultChecked={room.is_active} label={t("roomActive")} /> : null}
      </>
    );
    return (
      <>
        {header}
        <Card>
          <CardHeader title={t("rooms")} actions={<FormDialog action={saveRoomAction} trigger={<Button size="sm"><Plus aria-hidden />{t("newRoom")}</Button>} title={t("newRoom")} submitLabel={tc("create")}>{roomFields()}</FormDialog>} />
          <CardBody className="p-0">
            {(rooms ?? []).length === 0 ? (
              <EmptyState title={t("noRooms")} />
            ) : (
              <ul className="divide-y divide-line">
                {(rooms ?? []).map((room) => (
                  <li key={room.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span>
                      <span className="font-medium">{room.name}</span>
                      {room.code ? <span className="text-ink-muted"> · {room.code}</span> : null}
                      <span className="block text-sm text-ink-muted">{t(`roomTypes.${room.room_type as "classroom"}`)}{room.capacity ? ` · ${t("capacityValue", { count: room.capacity })}` : ""}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {!room.is_active ? <Badge>{ts("inactive")}</Badge> : null}
                      <FormDialog action={saveRoomAction} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("editRoom", { name: room.name })}><Pencil aria-hidden /></Button>} title={t("editRoomTitle")} submitLabel={tc("save")}>{roomFields(room)}</FormDialog>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </>
    );
  }

  if (tab === "substitutions") {
    const today = todayIso(timeZone);
    const dateRaw = firstValue(params.date);
    const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : today;
    const dow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const [{ data: entries }, { data: substitutions }] = await Promise.all([
      dow <= 6
        ? supabase
            .from("timetable_entries")
            .select("id, period_number, shift, classes!inner(name, academic_years!inner(is_current)), class_subjects(subjects(name_tg, name_ru, name_en)), staff:teacher_id(first_name, last_name, middle_name)")
            .eq("school_id", schoolId)
            .eq("day_of_week", dow)
            .eq("classes.academic_years.is_current", true)
            .order("shift")
            .order("period_number")
        : Promise.resolve({ data: [] }),
      supabase
        .from("substitutions")
        .select("id, status, reason, timetable_entry_id, staff:substitute_teacher_id(first_name, last_name, middle_name), rooms(name)")
        .eq("school_id", schoolId)
        .eq("substitution_date", date),
    ]);
    const subByEntry = new Map((substitutions ?? []).map((s) => [s.timetable_entry_id, s]));
    const entryLabel = (e: NonNullable<typeof entries>[number]) => {
      const subject = (e.class_subjects as { subjects: Named | null } | null)?.subjects;
      const teacher = e.staff as unknown as Person | null;
      return `${(e.classes as unknown as { name: string }).name} · ${t("periodShort", { period: e.period_number })} · ${subject ? pickName(subject, locale) : ""}${teacher ? ` · ${fullName(teacher)}` : ""}`;
    };
    return (
      <>
        {header}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="substitutions" />
          <TextField name="date" type="date" label={t("date")} defaultValue={date} />
          <Button type="submit" variant="secondary">{tc("open")}</Button>
        </form>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("substitutionsOn", { date: formatDate(date, locale) })} />
            <CardBody>
              {dow > 6 ? (
                <p className="text-sm text-ink-muted">{t("sunday")}</p>
              ) : (entries ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noLessonsOnDay")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {(entries ?? []).map((e) => {
                    const sub = subByEntry.get(e.id);
                    const substitute = sub?.staff as unknown as Person | null;
                    return (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>{entryLabel(e)}</span>
                        {sub ? (
                          <span className="flex items-center gap-2">
                            <StatusBadge status={sub.status} label={ts(sub.status as "planned")} />
                            <span className="text-ink-secondary">{substitute ? fullName(substitute) : t("cancelledLesson")}</span>
                            {sub.status !== "cancelled" ? (
                              <ConfirmAction action={cancelSubstitutionAction} fields={{ id: sub.id }} title={t("cancelSubstitutionTitle")} confirmLabel={t("cancelSubstitution")} trigger={<Button variant="ghost" size="sm">{t("cancelSubstitution")}</Button>} />
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          {dow <= 6 && (entries ?? []).length > 0 ? (
            <Card>
              <CardHeader title={t("newSubstitution")} description={t("newSubstitutionHint")} />
              <CardBody>
                <ActionForm action={saveSubstitutionAction} className="space-y-3">
                  <input type="hidden" name="date" value={date} />
                  <SelectField name="timetableEntryId" label={t("lesson")} required placeholder={t("chooseLesson")} options={(entries ?? []).map((e) => ({ value: e.id, label: entryLabel(e) }))} />
                  <SelectField name="substituteTeacherId" label={t("substitute")} hint={t("substituteHint")} placeholder={t("noSubstitute")} options={staffOptions} />
                  <SelectField name="roomId" label={t("room")} placeholder={t("sameRoom")} options={roomOptions} />
                  <TextField name="reason" label={t("reason")} maxLength={500} />
                  <SubmitButton>{t("saveSubstitution")}</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </>
    );
  }

  // Grid
  const classParam = firstValue(params.class);
  const classId = classes.find((c) => c.value === classParam)?.value ?? classes[0]?.value;
  if (!classId) {
    return (
      <>
        {header}
        <Alert tone="warning">{t("noClasses")}</Alert>
      </>
    );
  }
  const [{ data: klass }, { data: entries }, { data: classSubjects }, { data: bells }] = await Promise.all([
    supabase.from("classes").select("id, name, shift").eq("id", classId).maybeSingle(),
    supabase
      .from("timetable_entries")
      .select("id, day_of_week, period_number, class_subjects(subjects(name_tg, name_ru, name_en)), staff:teacher_id(first_name, last_name, middle_name), rooms(name)")
      .eq("class_id", classId),
    supabase.from("class_subjects").select("id, subjects(name_tg, name_ru, name_en), staff:teacher_id(first_name, last_name, middle_name)").eq("class_id", classId).eq("is_active", true),
    supabase.from("bell_periods").select("shift, period_number, start_time, end_time").eq("school_id", schoolId),
  ]);
  const shiftBells = (bells ?? []).filter((b) => b.shift === (klass?.shift ?? 1));
  const periods = Math.max(7, ...(entries ?? []).map((e) => e.period_number), ...shiftBells.map((b) => b.period_number));
  const cell = new Map((entries ?? []).map((e) => [`${e.day_of_week}-${e.period_number}`, e]));

  return (
    <>
      {header}
      <FilterBar filters={[{ name: "class", label: t("class"), emptyLabel: classes[0]?.label, options: classes.slice(1).map(({ value, label }) => ({ value, label })) }]} />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title={t("gridTitle", { name: klass?.name ?? "" })} description={t("shift", { shift: klass?.shift ?? 1 })} />
          <CardBody className="p-0">
            {/* On a phone the week is swiped through inside this box, with the
                period numbers pinned at the left edge. */}
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[60rem] table-fixed border-collapse text-sm">
                <caption className="sr-only">{t("gridTitle", { name: klass?.name ?? "" })}</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="sticky left-0 z-10 w-16 bg-surface-muted px-3 py-2 text-start">{t("period")}</th>
                    {[1, 2, 3, 4, 5, 6].map((d) => (
                      <th key={d} scope="col" className="px-3 py-2 text-start">{tc(`weekdaysShort.${d}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Array.from({ length: periods }, (_, i) => i + 1).map((period) => (
                    <tr key={period}>
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-start align-top font-semibold tabular">{period}</th>
                      {[1, 2, 3, 4, 5, 6].map((day) => {
                        const entry = cell.get(`${day}-${period}`);
                        if (!entry) return <td key={day} className="px-3 py-2 align-top text-ink-muted">—</td>;
                        const subject = (entry.class_subjects as { subjects: Named | null } | null)?.subjects;
                        const teacher = entry.staff as unknown as Person | null;
                        const label = subject ? pickName(subject, locale) : "";
                        return (
                          <td key={day} className="px-2 py-1.5 align-top">
                            <div className="rounded-md border border-line bg-surface-muted/40 px-2 py-1.5">
                              <p className="font-medium leading-tight">{label}</p>
                              <p className="text-xs text-ink-muted">{[teacher ? `${teacher.last_name} ${teacher.first_name.slice(0, 1)}.` : null, (entry.rooms as { name: string } | null)?.name].filter(Boolean).join(" · ")}</p>
                              <ConfirmAction
                                action={deleteTimetableEntryAction}
                                fields={{ id: entry.id }}
                                title={t("deleteEntryTitle")}
                                description={t("deleteEntryDescription", { subject: label })}
                                confirmLabel={tc("delete")}
                                trigger={<button type="button" className="mt-1 inline-flex items-center gap-1 text-xs text-danger-700 hover:underline" aria-label={t("deleteEntry", { subject: label, day: tc(`weekdays.${day}`), period })}><Trash2 className="size-3" aria-hidden />{tc("remove")}</button>}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("addEntry")} description={t("addEntryHint")} />
          <CardBody>
            {(classSubjects ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noClassSubjects")}</p>
            ) : (
              <ActionForm action={saveTimetableEntryAction} className="space-y-3">
                <input type="hidden" name="classId" value={classId} />
                <SelectField name="classSubjectId" label={t("subject")} required placeholder={t("chooseSubject")} options={(classSubjects ?? []).map((cs) => {
                  const subject = cs.subjects as Named | null;
                  const teacher = cs.staff as unknown as Person | null;
                  return { value: cs.id, label: `${subject ? pickName(subject, locale) : ""}${teacher ? ` · ${fullName(teacher)}` : ` · ${t("noTeacher")}`}` };
                })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name="dayOfWeek" label={t("day")} options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: tc(`weekdays.${d}`) }))} />
                  <SelectField name="periodNumber" label={t("period")} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
                </div>
                <SelectField name="roomId" label={t("room")} placeholder={t("classRoom")} options={roomOptions} />
                <SubmitButton>{t("saveEntry")}</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
