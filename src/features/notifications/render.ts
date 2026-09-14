import "server-only";
import { getTranslations } from "next-intl/server";
import { formatDate, formatDateTime, formatNumber } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";

export const NOTIFICATION_TYPES = [
  "message", "grade", "homework", "schedule", "attendance", "announcement", "document", "library",
  "system", "friend", "event", "news", "registration", "moderation", "broadcast",
] as const;

export const TEMPLATE_KEYS = [
  "message.new", "grade.new", "attendance.absent", "attendance.late", "homework.published", "announcement.published",
  "registration.pending", "moderation.report", "friend.request", "friend.accepted",
] as const;

export interface NotificationRow {
  id: string;
  type: string;
  template_key: string | null;
  params: unknown;
  title: string | null;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

const text = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

/**
 * Renders a stored notification in the reader's language. Template
 * notifications carry only parameters; free-text broadcasts carry title/body
 * written by the school.
 */
export async function renderNotifications(rows: NotificationRow[], locale: Locale, timeZone: string) {
  const t = await getTranslations("portal.notifications.templates");
  const tReasons = await getTranslations("portal.messages.reasons");
  return rows.map((row) => {
    const params = (row.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>;
    const key = row.template_key;
    if (!key || !(TEMPLATE_KEYS as readonly string[]).includes(key)) {
      return { ...row, heading: row.title ?? "", detail: row.body ?? "" };
    }
    const count = Number(params.count ?? 1) || 1;
    const subject = pickText({ tg: text(params.subject_tg) || null, ru: text(params.subject_ru) || null, en: text(params.subject_en) || null }, locale);
    const values: Record<string, string | number> = {
      count,
      sender: text(params.sender),
      name: text(params.name),
      student: text(params.student),
      title: text(params.title),
      subject: subject || "—",
      score: formatNumber(params.score as number | string | null, locale),
      max: formatNumber(params.max_score as number | string | null, locale),
      date: params.date ? formatDate(text(params.date), locale, timeZone) : "",
      due: params.due_at ? formatDateTime(text(params.due_at), locale, timeZone) : "—",
      reason: ["abuse", "bullying", "spam", "inappropriate", "privacy", "other"].includes(text(params.reason)) ? tReasons(text(params.reason)) : "—",
    };
    const id = key.replace(".", "_");
    return {
      ...row,
      heading: t(`${id}.title`, values),
      detail: key === "message.new" && row.body ? row.body : t(`${id}.body`, values),
    };
  });
}
