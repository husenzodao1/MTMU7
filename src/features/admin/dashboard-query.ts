import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const num = z.union([z.number(), z.string()]).transform((v) => Number(v));

const dashboardSchema = z.object({
  academic_year: z.object({ id: z.string(), name: z.string(), start_date: z.string(), end_date: z.string() }).nullable(),
  current_term: z.object({ id: z.string(), name: z.string(), end_date: z.string(), is_locked: z.boolean() }).nullable(),
  counts: z.object({
    students_active: num,
    staff_active: num,
    teachers_active: num,
    classes_active: num,
    guardians: num,
    accounts_active: num,
  }),
  attendance_today: z.object({ present: num, late: num, absent: num, excused: num, students_marked: num }),
  queues: z.object({
    pending_registrations: num,
    news_in_review: num,
    news_drafts: num,
    news_scheduled: num,
    library_drafts: num,
    documents_drafts: num,
    open_reports: num,
    grades_awaiting_approval: num,
  }),
  upcoming_events: z.array(z.object({ id: z.string(), title: z.string(), starts_at: z.string(), category: z.string(), status: z.string() })),
  recent_announcements: z.array(z.object({ id: z.string(), title: z.string(), priority: z.string(), publish_at: z.string() })),
  recent_activity: z
    .array(
      z.object({
        id: z.string(),
        action: z.string(),
        entity_type: z.string(),
        created_at: z.string(),
        actor: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
      })
    )
    .nullable(),
  // The school's official wording and photograph are no longer edited here
  // (the public school site is gone), so that reminder is not shown.
  alerts: z.array(z.string()).transform((alerts) => alerts.filter((alert) => alert !== "official_content_not_approved")),
});

export type AdminDashboard = z.infer<typeof dashboardSchema>;

export async function getAdminDashboard(schoolId?: string): Promise<AdminDashboard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard", { p_school_id: schoolId });
  if (error || !data) return null;
  const parsed = dashboardSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[admin_dashboard] unexpected shape", parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
}
