import "server-only";
import { failure, type ActionResult } from "@/lib/actions/result";

/**
 * Domain error tokens raised by database functions and triggers
 * (RAISE EXCEPTION '<token>'). They map 1:1 to i18n keys under `errors.`.
 */
const KNOWN_TOKENS = new Set([
  "forbidden", "not_authenticated", "email_not_verified", "already_registered", "invalid_name", "invalid_school",
  "invalid_details", "invalid_invitation", "registration_closed", "invalid_role", "invalid_class", "request_already_reviewed",
  "reason_required", "role_not_allowed", "student_not_active", "invalid_status", "too_many_students",
  "promotion_requires_new_year", "empty_import", "import_too_large", "invalid_import_size", "no_current_academic_year",
  "messaging_not_allowed", "messaging_blocked", "group_creation_not_allowed", "invalid_group_name", "invalid_group_size",
  "member_not_allowed", "cannot_report_own_message", "invalid_action", "invalid_period", "user_not_available",
  "unsupported status",
]);

const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/cannot change the status of your own account/i, "errors.own_account"],
  [/cannot change your own roles/i, "errors.own_roles"],
  [/role cannot be (assigned|removed)/i, "errors.role_not_allowed"],
  [/permission you do not hold/i, "errors.permission_not_held"],
  [/always has every school permission/i, "errors.admin_role_immutable"],
  [/term is locked/i, "errors.term_locked"],
  [/approved grades/i, "errors.grade_approved"],
  [/not enrolled/i, "errors.not_enrolled"],
  [/correction window/i, "errors.attendance_window"],
  [/future date/i, "errors.future_date"],
  [/already teaching/i, "errors.substitute_busy"],
  [/timetable_class_conflict/i, "errors.timetable_class_conflict"],
  [/timetable_teacher_conflict/i, "errors.timetable_teacher_conflict"],
  [/timetable_room_conflict/i, "errors.timetable_room_conflict"],
  [/48 hours/i, "errors.edit_window"],
  [/core modules cannot be disabled/i, "errors.core_module"],
  [/managed by the platform administrator/i, "errors.platform_field"],
  [/reviewed submission/i, "errors.submission_locked"],
  [/does not accept submissions/i, "errors.submissions_closed"],
  [/requires (news|library|documents|announcements)\.(publish|archive|update)/i, "errors.publish_permission"],
  [/own drafts/i, "errors.own_drafts"],
  [/cross-school/i, "errors.forbidden"],
  [/path must be inside|paths_scope|path_scope/i, "errors.invalid_file_path"],
];

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * Maps a PostgREST / Postgres error to a safe, translatable result. Raw
 * database messages are never returned to the client.
 */
export function mapDbError(error: PostgrestLikeError | null | undefined, fallback = "errors.unexpected"): ActionResult<never> {
  if (!error) return failure(fallback);
  const message = error.message ?? "";
  const token = message.trim();

  if (KNOWN_TOKENS.has(token)) return failure(`errors.${token.replace(/\s+/g, "_")}`);
  for (const [pattern, key] of MESSAGE_PATTERNS) {
    if (pattern.test(message) || (error.details && pattern.test(error.details))) return failure(key);
  }

  switch (error.code) {
    case "42501":
      return failure("errors.forbidden");
    case "23505":
      return failure("errors.duplicate");
    case "23503":
      return failure("errors.in_use");
    case "23514":
    case "22023":
    case "22P02":
    case "22007":
      return failure("errors.invalid");
    case "23P01":
      return failure("errors.conflict");
    case "PGRST116":
      return failure("errors.not_found");
    default:
      console.error("[db-error]", { code: error.code, message: message.slice(0, 300) });
      return failure(fallback);
  }
}
