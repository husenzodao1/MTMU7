import "server-only";
import { can, canAny, canEnterAdmin, hasAdminScope, hasModule, hasRole, isPlatformAdmin, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

export type IconName =
  | "dashboard" | "teach" | "schedule" | "grades" | "attendance" | "homework" | "children" | "library" | "news"
  | "announcements" | "events" | "documents" | "messages" | "notifications" | "admin" | "contacts"
  | "students" | "staff" | "guardians" | "users" | "approvals" | "invitations" | "years" | "classes" | "subjects"
  | "gradebook" | "timetable" | "media" | "website" | "broadcasts" | "moderation" | "school" | "roles" | "modules"
  | "platform" | "reports" | "analytics" | "audit" | "settings" | "status";

export interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  /** i18n key */
  label: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

interface Rule {
  item: NavItem;
  visible: (access: Access) => boolean;
}

const anyOf = (...permissions: Permission[]) => (access: Access) => canAny(access, permissions);
const moduleAnd = (module: string, ...permissions: Permission[]) => (access: Access) =>
  hasModule(access, module) && (permissions.length === 0 || canAny(access, permissions));

function isTeachingStaff(access: Access) {
  return canAny(access, ["grades.enter", "attendance.mark", "homework.create"]);
}

const PORTAL_RULES: Rule[] = [
  { item: { key: "dashboard", href: "/dashboard", icon: "dashboard", label: "nav.dashboard" }, visible: () => true },
  { item: { key: "teach", href: "/teach", icon: "teach", label: "nav.teach" }, visible: isTeachingStaff },
  { item: { key: "children", href: "/children", icon: "children", label: "nav.children" }, visible: (a) => hasRole(a, "parent") },
  { item: { key: "schedule", href: "/schedule", icon: "schedule", label: "nav.schedule" }, visible: moduleAnd("schedule", "timetable.view") },
  {
    item: { key: "grades", href: "/grades", icon: "grades", label: "nav.grades" },
    visible: (a) => hasModule(a, "grades") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  {
    item: { key: "attendance", href: "/attendance", icon: "attendance", label: "nav.attendance" },
    visible: (a) => hasModule(a, "attendance") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  {
    item: { key: "homework", href: "/homework", icon: "homework", label: "nav.homework" },
    visible: (a) => hasModule(a, "homework") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  { item: { key: "library", href: "/library", icon: "library", label: "nav.library" }, visible: moduleAnd("library", "library.view") },
  { item: { key: "news", href: "/news", icon: "news", label: "nav.news" }, visible: moduleAnd("news", "news.view") },
  { item: { key: "announcements", href: "/announcements", icon: "announcements", label: "nav.announcements" }, visible: moduleAnd("announcements", "announcements.view") },
  { item: { key: "events", href: "/events", icon: "events", label: "nav.events" }, visible: moduleAnd("events", "events.view") },
  { item: { key: "documents", href: "/documents", icon: "documents", label: "nav.documents" }, visible: moduleAnd("documents", "documents.view") },
  { item: { key: "messages", href: "/messages", icon: "messages", label: "nav.messages" }, visible: moduleAnd("messages", "messages.use") },
  { item: { key: "contacts", href: "/friends", icon: "contacts", label: "nav.contacts" }, visible: (a) => hasModule(a, "friends") },
];

export function portalNavigation(access: Access): NavItem[] {
  return PORTAL_RULES.filter((rule) => rule.visible(access)).map((rule) => rule.item);
}

export function showAdminLink(access: Access): boolean {
  return canEnterAdmin(access);
}

const ADMIN_GROUPS: Array<{ key: string; label: string; rules: Rule[] }> = [
  {
    key: "overview",
    label: "admin.nav.groups.overview",
    rules: [{ item: { key: "admin", href: "/admin", icon: "dashboard", label: "admin.nav.dashboard" }, visible: anyOf("students.view", "users.view", "reports.view") }],
  },
  {
    key: "people",
    label: "admin.nav.groups.people",
    rules: [
      { item: { key: "students", href: "/admin/students", icon: "students", label: "admin.nav.students" }, visible: anyOf("students.create", "students.update", "students.archive") },
      { item: { key: "staff", href: "/admin/staff", icon: "staff", label: "admin.nav.staff" }, visible: anyOf("staff.create", "staff.update", "staff.archive") },
      { item: { key: "guardians", href: "/admin/guardians", icon: "guardians", label: "admin.nav.guardians" }, visible: anyOf("guardians.manage") },
      { item: { key: "users", href: "/admin/users", icon: "users", label: "admin.nav.users" }, visible: anyOf("users.view") },
      { item: { key: "approvals", href: "/admin/approvals", icon: "approvals", label: "admin.nav.approvals" }, visible: anyOf("users.approve") },
      { item: { key: "invitations", href: "/admin/invitations", icon: "invitations", label: "admin.nav.invitations" }, visible: anyOf("invitations.manage") },
    ],
  },
  {
    key: "academic",
    label: "admin.nav.groups.academic",
    rules: [
      { item: { key: "years", href: "/admin/academic-years", icon: "years", label: "admin.nav.academicYears" }, visible: anyOf("academic_years.manage") },
      { item: { key: "classes", href: "/admin/classes", icon: "classes", label: "admin.nav.classes" }, visible: anyOf("classes.create", "classes.update", "enrollments.manage") },
      { item: { key: "subjects", href: "/admin/subjects", icon: "subjects", label: "admin.nav.subjects" }, visible: anyOf("subjects.manage") },
      { item: { key: "gradebook", href: "/admin/gradebook", icon: "gradebook", label: "admin.nav.gradebook" }, visible: anyOf("grades.approve", "grades.update", "assessments.manage") },
      { item: { key: "attendance", href: "/admin/attendance", icon: "attendance", label: "admin.nav.attendance" }, visible: anyOf("attendance.update") },
      { item: { key: "timetable", href: "/admin/timetable", icon: "timetable", label: "admin.nav.timetable" }, visible: anyOf("timetable.manage") },
    ],
  },
  {
    key: "content",
    label: "admin.nav.groups.content",
    rules: [
      { item: { key: "news", href: "/admin/news", icon: "news", label: "admin.nav.news" }, visible: anyOf("news.publish", "news.update", "news.archive") },
      { item: { key: "announcements", href: "/admin/announcements", icon: "announcements", label: "admin.nav.announcements" }, visible: anyOf("announcements.publish") },
      { item: { key: "events", href: "/admin/events", icon: "events", label: "admin.nav.events" }, visible: anyOf("events.manage") },
      { item: { key: "library", href: "/admin/library", icon: "library", label: "admin.nav.library" }, visible: anyOf("library.create", "library.update", "library.publish", "library.archive") },
      { item: { key: "documents", href: "/admin/documents", icon: "documents", label: "admin.nav.documents" }, visible: anyOf("documents.create", "documents.publish") },
      { item: { key: "media", href: "/admin/media", icon: "media", label: "admin.nav.media" }, visible: anyOf("media.manage", "media.upload") },
      { item: { key: "website", href: "/admin/website", icon: "website", label: "admin.nav.website" }, visible: anyOf("cms.manage") },
    ],
  },
  {
    key: "communication",
    label: "admin.nav.groups.communication",
    rules: [
      { item: { key: "broadcasts", href: "/admin/notifications", icon: "broadcasts", label: "admin.nav.notifications" }, visible: anyOf("notifications.send") },
      { item: { key: "moderation", href: "/admin/moderation", icon: "moderation", label: "admin.nav.moderation" }, visible: anyOf("messages.moderate") },
    ],
  },
  {
    key: "management",
    label: "admin.nav.groups.management",
    rules: [
      { item: { key: "school", href: "/admin/school", icon: "school", label: "admin.nav.school" }, visible: anyOf("schools.update", "settings.view") },
      { item: { key: "roles", href: "/admin/roles", icon: "roles", label: "admin.nav.roles" }, visible: anyOf("roles.view") },
      { item: { key: "modules", href: "/admin/modules", icon: "modules", label: "admin.nav.modules" }, visible: anyOf("modules.manage") },
      { item: { key: "platform", href: "/admin/platform", icon: "platform", label: "admin.nav.platform" }, visible: (a) => isPlatformAdmin(a) || hasAdminScope(a) },
    ],
  },
  {
    key: "reporting",
    label: "admin.nav.groups.reporting",
    rules: [
      { item: { key: "reports", href: "/admin/reports", icon: "reports", label: "admin.nav.reports" }, visible: anyOf("reports.view") },
      { item: { key: "analytics", href: "/admin/analytics", icon: "analytics", label: "admin.nav.analytics" }, visible: anyOf("analytics.view") },
      { item: { key: "audit", href: "/admin/audit", icon: "audit", label: "admin.nav.audit" }, visible: anyOf("audit.view") },
    ],
  },
  {
    key: "system",
    label: "admin.nav.groups.system",
    rules: [
      { item: { key: "settings", href: "/admin/settings", icon: "settings", label: "admin.nav.settings" }, visible: anyOf("settings.update") },
      { item: { key: "status", href: "/admin/system", icon: "status", label: "admin.nav.system" }, visible: (a) => isPlatformAdmin(a) || can(a, "settings.update") },
    ],
  },
];

export function adminNavigation(access: Access): NavGroup[] {
  return ADMIN_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.rules.filter((rule) => rule.visible(access)).map((rule) => rule.item),
  })).filter((group) => group.items.length > 0);
}
