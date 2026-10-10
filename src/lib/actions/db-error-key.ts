/**
 * The part of the database error mapping that holds no secrets and needs no
 * server: which translatable key a PostgREST / Postgres error stands for.
 *
 * Kept apart from mapDbError so that the chat, which writes straight to the
 * database from the browser under row level security, names its failures with
 * exactly the same words as every Server Action does.
 */

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
  "unsupported status", "phone_taken", "invalid_phone", "invalid_birth_year", "invalid_relationship", "invalid_workplace",
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

export interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** The i18n key for an error, or null when it is not one we can name. */
export function dbErrorKey(error: PostgrestLikeError): string | null {
  const message = error.message ?? "";
  const token = message.trim();

  if (KNOWN_TOKENS.has(token)) return `errors.${token.replace(/\s+/g, "_")}`;
  for (const [pattern, key] of MESSAGE_PATTERNS) {
    if (pattern.test(message) || (error.details && pattern.test(error.details))) return key;
  }

  switch (error.code) {
    case "42501":
      return "errors.forbidden";
    case "23505":
      return "errors.duplicate";
    case "23503":
      return "errors.in_use";
    case "23514":
    case "22023":
    case "22P02":
    case "22007":
      return "errors.invalid";
    case "23P01":
      return "errors.conflict";
    case "PGRST116":
      return "errors.not_found";
    default:
      return null;
  }
}
