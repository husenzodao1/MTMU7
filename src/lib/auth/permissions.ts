/**
 * Permission catalog (mirrors public.permissions, migration 00022).
 * The database is the authority; this list gives the UI type safety.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "schools.view", "schools.update", "schools.create", "schools.archive",
  "users.view", "users.create", "users.update", "users.approve", "users.deactivate", "users.assign_roles",
  "roles.view", "roles.manage", "invitations.manage",
  "students.view", "students.create", "students.update", "students.archive", "students.import",
  "staff.view", "staff.create", "staff.update", "staff.archive",
  "guardians.view", "guardians.manage",
  "academic_years.view", "academic_years.manage",
  "classes.view", "classes.create", "classes.update", "classes.archive",
  "subjects.view", "subjects.manage", "enrollments.manage",
  "grades.view", "grades.enter", "grades.update", "grades.approve", "assessments.manage",
  "attendance.view", "attendance.mark", "attendance.update",
  "homework.view", "homework.create", "homework.review",
  "timetable.view", "timetable.manage",
  "news.view", "news.create", "news.update", "news.publish", "news.archive",
  "announcements.view", "announcements.create", "announcements.publish",
  "events.view", "events.manage",
  "library.view", "library.create", "library.update", "library.publish", "library.archive",
  "documents.view", "documents.create", "documents.publish", "documents.archive",
  "media.upload", "media.manage", "cms.manage",
  "messages.use", "messages.moderate", "notifications.send",
  "reports.view", "reports.export", "analytics.view", "audit.view",
  "settings.view", "settings.update", "modules.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissionSet = new Set<string>(PERMISSIONS);
export function isPermission(value: string): value is Permission {
  return permissionSet.has(value);
}

/** Permissions that grant entry to the Admin Control Center. */
export const ADMIN_ENTRY_PERMISSIONS: Permission[] = [
  "users.view", "users.approve", "roles.view", "settings.view", "cms.manage", "modules.manage",
  "students.create", "staff.create", "guardians.manage", "classes.create", "subjects.manage", "enrollments.manage",
  "academic_years.manage", "timetable.manage", "assessments.manage", "grades.approve", "attendance.update",
  "news.publish", "announcements.publish", "announcements.create", "events.manage", "library.create", "library.update",
  "documents.create", "media.manage", "notifications.send", "messages.moderate", "invitations.manage",
  "reports.view", "analytics.view", "audit.view",
];
