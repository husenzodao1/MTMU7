import "server-only";
import { createClient } from "@/lib/supabase/server";
import { firstValue, type SearchParams } from "@/lib/list-params";

export const REPORT_KEYS = ["enrollment", "attendance", "grades", "workload", "content", "library"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export function isReportKey(value: string | undefined): value is ReportKey {
  return Boolean(value) && (REPORT_KEYS as readonly string[]).includes(value!);
}

export interface ReportColumn {
  key: string;
  /** i18n key under admin.reports.columns */
  label: string;
  kind?: "number" | "percent" | "text" | "date";
}

export interface ReportParams {
  from: string;
  to: string;
  classId: string | null;
  termId: string | null;
  yearId: string | null;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** i18n key when the report needs more input before it can run */
  needs?: string;
  error?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readReportParams(params: SearchParams | URLSearchParams, today: string): ReportParams {
  const get = (name: string) => (params instanceof URLSearchParams ? params.get(name) ?? undefined : firstValue(params[name]));
  const defaultFrom = new Date(`${today}T00:00:00Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const from = get("from");
  const to = get("to");
  const uuidOrNull = (value: string | undefined) => (value && UUID.test(value) ? value : null);
  return {
    from: from && DATE.test(from) ? from : defaultFrom.toISOString().slice(0, 10),
    to: to && DATE.test(to) ? to : today,
    classId: uuidOrNull(get("class")),
    termId: uuidOrNull(get("term")),
    yearId: uuidOrNull(get("year")),
  };
}

/** Runs a report through its SECURITY DEFINER function; permission checks happen in the database. */
export async function runReport(key: ReportKey, p: ReportParams): Promise<ReportResult> {
  const supabase = await createClient();
  switch (key) {
    case "enrollment": {
      const { data, error } = await supabase.rpc("report_enrollment", { p_academic_year_id: p.yearId ?? undefined });
      return {
        columns: [
          { key: "class_name", label: "class" },
          { key: "grade_level", label: "grade", kind: "number" },
          { key: "homeroom_teacher", label: "homeroom" },
          { key: "capacity", label: "capacity", kind: "number" },
          { key: "active_count", label: "active", kind: "number" },
          { key: "male_count", label: "male", kind: "number" },
          { key: "female_count", label: "female", kind: "number" },
          { key: "transferred_count", label: "transferred", kind: "number" },
          { key: "completed_count", label: "completed", kind: "number" },
        ],
        rows: (data ?? []) as ReportResult["rows"],
        error: error?.message,
      };
    }
    case "attendance": {
      const { data, error } = await supabase.rpc("report_attendance", { p_from: p.from, p_to: p.to, p_class_id: p.classId ?? undefined });
      return {
        columns: [
          { key: "student_name", label: "student" },
          { key: "class_name", label: "class" },
          { key: "present", label: "present", kind: "number" },
          { key: "late", label: "late", kind: "number" },
          { key: "absent", label: "absent", kind: "number" },
          { key: "excused", label: "excused", kind: "number" },
          { key: "total", label: "total", kind: "number" },
          { key: "attendance_rate", label: "rate", kind: "percent" },
        ],
        rows: (data ?? []) as ReportResult["rows"],
        error: error?.message,
      };
    }
    case "grades": {
      if (!p.classId) return { columns: [], rows: [], needs: "chooseClass" };
      const { data, error } = await supabase.rpc("report_grades", { p_class_id: p.classId, p_term_id: p.termId ?? undefined });
      return {
        columns: [
          { key: "student_name", label: "student" },
          { key: "subject_name", label: "subject" },
          { key: "grade_count", label: "grades", kind: "number" },
          { key: "average_percent", label: "average", kind: "percent" },
          { key: "final_score", label: "final", kind: "number" },
        ],
        rows: (data ?? []) as ReportResult["rows"],
        error: error?.message,
      };
    }
    case "workload": {
      const { data, error } = await supabase.rpc("report_teacher_workload", { p_academic_year_id: p.yearId ?? undefined });
      return {
        columns: [
          { key: "teacher_name", label: "teacher" },
          { key: "staff_type", label: "staffType" },
          { key: "classes", label: "classes", kind: "number" },
          { key: "subjects", label: "subjects", kind: "number" },
          { key: "planned_weekly_hours", label: "plannedHours", kind: "number" },
          { key: "scheduled_lessons_per_week", label: "scheduledLessons", kind: "number" },
          { key: "max_weekly_hours", label: "maxHours", kind: "number" },
        ],
        rows: (data ?? []) as ReportResult["rows"],
        error: error?.message,
      };
    }
    case "content": {
      const { data, error } = await supabase.rpc("report_content_activity", { p_from: p.from, p_to: p.to });
      return {
        columns: [
          { key: "month", label: "month", kind: "date" },
          { key: "news_published", label: "news", kind: "number" },
          { key: "announcements_published", label: "announcements", kind: "number" },
          { key: "events_held", label: "events", kind: "number" },
          { key: "documents_published", label: "documents", kind: "number" },
          { key: "books_published", label: "books", kind: "number" },
          { key: "registrations", label: "registrations", kind: "number" },
        ],
        rows: (data ?? []) as ReportResult["rows"],
        error: error?.message,
      };
    }
    case "library": {
      const { data, error } = await supabase.rpc("report_library");
      const report = (data ?? {}) as { most_viewed?: Array<{ title: string; views: number; readers: number }> };
      return {
        columns: [
          { key: "title", label: "title" },
          { key: "views", label: "views", kind: "number" },
          { key: "readers", label: "readers", kind: "number" },
        ],
        rows: report.most_viewed ?? [],
        error: error?.message,
      };
    }
  }
}
