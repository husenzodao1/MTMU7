import "server-only";
import { can, canAny, canEnterAdmin, hasAdminScope, hasModule, hasRole, isPlatformAdmin, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

export type IconName =
  | "dashboard" | "teach" | "schedule" | "grades" | "attendance" | "homework" | "children" | "library" | "news"
  | "announcements" | "events" | "documents" | "messages" | "notifications" | "admin" | "contacts"
  | "students" | "staff" | "guardians" | "users" | "approvals" | "invitations" | "years" | "classes" | "subjects"
  | "gradebook" | "timetable" | "media" | "website" | "broadcasts" | "moderation" | "school" | "roles" | "modules"
  | "platform" | "reports" | "analytics" | "audit" | "settings" | "status" | "search" | "support";

export interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  /** i18n key */
  labelKey: string;
}

export interface NavGroup {
  key: string;
  labelKey: string;
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
  { item: { key: "dashboard", href: "/dashboard", icon: "dashboard", labelKey: "nav.dashboard" }, visible: () => true },
  { item: { key: "teach", href: "/teach", icon: "teach", labelKey: "nav.teach" }, visible: isTeachingStaff },
  { item: { key: "children", href: "/children", icon: "children", labelKey: "nav.children" }, visible: (a) => hasRole(a, "parent") },
  { item: { key: "schedule", href: "/schedule", icon: "schedule", labelKey: "nav.schedule" }, visible: moduleAnd("schedule", "timetable.view") },
  {
    item: { key: "grades", href: "/grades", icon: "grades", labelKey: "nav.grades" },
    visible: (a) => hasModule(a, "grades") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  {
    item: { key: "attendance", href: "/attendance", icon: "attendance", labelKey: "nav.attendance" },
    visible: (a) => hasModule(a, "attendance") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  {
    item: { key: "homework", href: "/homework", icon: "homework", labelKey: "nav.homework" },
    visible: (a) => hasModule(a, "homework") && (hasRole(a, "student") || hasRole(a, "parent")),
  },
  { item: { key: "library", href: "/library", icon: "library", labelKey: "nav.library" }, visible: moduleAnd("library", "library.view") },
  { item: { key: "news", href: "/news", icon: "news", labelKey: "nav.news" }, visible: moduleAnd("news", "news.view") },
  { item: { key: "announcements", href: "/announcements", icon: "announcements", labelKey: "nav.announcements" }, visible: moduleAnd("announcements", "announcements.view") },
  { item: { key: "events", href: "/events", icon: "events", labelKey: "nav.events" }, visible: moduleAnd("events", "events.view") },
  { item: { key: "documents", href: "/documents", icon: "documents", labelKey: "nav.documents" }, visible: moduleAnd("documents", "documents.view") },
  { item: { key: "messages", href: "/messages", icon: "messages", labelKey: "nav.messages" }, visible: moduleAnd("messages", "messages.use") },
  { item: { key: "contacts", href: "/friends", icon: "contacts", labelKey: "nav.contacts" }, visible: (a) => hasModule(a, "friends") },
];

export function portalNavigation(access: Access): NavItem[] {
  return PORTAL_RULES.filter((rule) => rule.visible(access)).map((rule) => rule.item);
}

export function showAdminLink(access: Access): boolean {
  return canEnterAdmin(access);
}

const ADMIN_GROUPS: Array<{ key: string; labelKey: string; rules: Rule[] }> = [
  {
    key: "overview",
    labelKey: "admin.nav.groups.overview",
    rules: [
      { item: { key: "admin", href: "/admin", icon: "dashboard", labelKey: "admin.nav.dashboard" }, visible: anyOf("students.view", "users.view", "reports.view") },
      { item: { key: "search", href: "/admin/search", icon: "search", labelKey: "admin.nav.globalSearch" }, visible: anyOf("students.view", "staff.view", "users.view", "classes.view", "news.view", "library.view", "documents.view") },
    ],
  },
  {
    key: "people",
    labelKey: "admin.nav.groups.people",
    rules: [
      { item: { key: "students", href: "/admin/students", icon: "students", labelKey: "admin.nav.students" }, visible: anyOf("students.create", "students.update", "students.archive") },
      { item: { key: "staff", href: "/admin/staff", icon: "staff", labelKey: "admin.nav.staff" }, visible: anyOf("staff.create", "staff.update", "staff.archive") },
      { item: { key: "guardians", href: "/admin/guardians", icon: "guardians", labelKey: "admin.nav.guardians" }, visible: anyOf("guardians.manage") },
      // The slips a parent types into the bot. It sits beside the people pages
      // because that is what it is about, even though it issues a secret.
      { item: { key: "parents", href: "/admin/parents", icon: "children", labelKey: "admin.nav.parents" }, visible: anyOf("students.update") },
      { item: { key: "users", href: "/admin/users", icon: "users", labelKey: "admin.nav.users" }, visible: anyOf("users.view") },
      // Approvals and invitation codes belonged to self-registration, which the
      // school closed when it began issuing logins itself (migration 00045).
      // Both pages still answer, so anything left pending from that time can be
      // settled and the history read, but neither is offered here any more.
    ],
  },
  {
    key: "academic",
    labelKey: "admin.nav.groups.academic",
    rules: [
      { item: { key: "years", href: "/admin/academic-years", icon: "years", labelKey: "admin.nav.academicYears" }, visible: anyOf("academic_years.manage") },
      { item: { key: "classes", href: "/admin/classes", icon: "classes", labelKey: "admin.nav.classes" }, visible: anyOf("classes.create", "classes.update", "enrollments.manage") },
      { item: { key: "subjects", href: "/admin/subjects", icon: "subjects", labelKey: "admin.nav.subjects" }, visible: anyOf("subjects.manage") },
      { item: { key: "gradebook", href: "/admin/gradebook", icon: "gradebook", labelKey: "admin.nav.gradebook" }, visible: anyOf("grades.approve", "grades.update", "assessments.manage") },
      { item: { key: "attendance", href: "/admin/attendance", icon: "attendance", labelKey: "admin.nav.attendance" }, visible: anyOf("attendance.update") },
      { item: { key: "timetable", href: "/admin/timetable", icon: "timetable", labelKey: "admin.nav.timetable" }, visible: anyOf("timetable.manage") },
    ],
  },
  {
    key: "content",
    labelKey: "admin.nav.groups.content",
    rules: [
      { item: { key: "news", href: "/admin/news", icon: "news", labelKey: "admin.nav.news" }, visible: anyOf("news.publish", "news.update", "news.archive") },
      { item: { key: "announcements", href: "/admin/announcements", icon: "announcements", labelKey: "admin.nav.announcements" }, visible: anyOf("announcements.publish", "announcements.create") },
      { item: { key: "events", href: "/admin/events", icon: "events", labelKey: "admin.nav.events" }, visible: anyOf("events.manage") },
      { item: { key: "library", href: "/admin/library", icon: "library", labelKey: "admin.nav.library" }, visible: anyOf("library.create", "library.update", "library.publish", "library.archive") },
      { item: { key: "documents", href: "/admin/documents", icon: "documents", labelKey: "admin.nav.documents" }, visible: anyOf("documents.create", "documents.publish") },
      { item: { key: "media", href: "/admin/media", icon: "media", labelKey: "admin.nav.media" }, visible: anyOf("media.manage", "media.upload") },
      { item: { key: "website", href: "/admin/website", icon: "website", labelKey: "admin.nav.website" }, visible: anyOf("cms.manage") },
    ],
  },
  {
    key: "communication",
    labelKey: "admin.nav.groups.communication",
    rules: [
      { item: { key: "broadcasts", href: "/admin/notifications", icon: "broadcasts", labelKey: "admin.nav.notifications" }, visible: anyOf("notifications.send") },
      { item: { key: "support", href: "/admin/support", icon: "support", labelKey: "admin.nav.support" }, visible: anyOf("messages.moderate") },
      { item: { key: "moderation", href: "/admin/moderation", icon: "moderation", labelKey: "admin.nav.moderation" }, visible: anyOf("messages.moderate") },
    ],
  },
  {
    key: "management",
    labelKey: "admin.nav.groups.management",
    rules: [
      { item: { key: "school", href: "/admin/school", icon: "school", labelKey: "admin.nav.school" }, visible: anyOf("schools.update", "settings.view") },
      { item: { key: "roles", href: "/admin/roles", icon: "roles", labelKey: "admin.nav.roles" }, visible: anyOf("roles.view") },
      { item: { key: "modules", href: "/admin/modules", icon: "modules", labelKey: "admin.nav.modules" }, visible: anyOf("modules.manage") },
      { item: { key: "platform", href: "/admin/platform", icon: "platform", labelKey: "admin.nav.platform" }, visible: (a) => isPlatformAdmin(a) || hasAdminScope(a) },
    ],
  },
  {
    key: "reporting",
    labelKey: "admin.nav.groups.reporting",
    rules: [
      { item: { key: "reports", href: "/admin/reports", icon: "reports", labelKey: "admin.nav.reports" }, visible: anyOf("reports.view") },
      { item: { key: "analytics", href: "/admin/analytics", icon: "analytics", labelKey: "admin.nav.analytics" }, visible: anyOf("analytics.view") },
      { item: { key: "audit", href: "/admin/audit", icon: "audit", labelKey: "admin.nav.audit" }, visible: anyOf("audit.view") },
    ],
  },
  {
    key: "system",
    labelKey: "admin.nav.groups.system",
    rules: [
      { item: { key: "settings", href: "/admin/settings", icon: "settings", labelKey: "admin.nav.settings" }, visible: anyOf("settings.update") },
      { item: { key: "status", href: "/admin/system", icon: "status", labelKey: "admin.nav.system" }, visible: (a) => isPlatformAdmin(a) || can(a, "settings.update") },
    ],
  },
];

export function adminNavigation(access: Access): NavGroup[] {
  return ADMIN_GROUPS.map((group) => ({
    key: group.key,
    labelKey: group.labelKey,
    items: group.rules.filter((rule) => rule.visible(access)).map((rule) => rule.item),
  })).filter((group) => group.items.length > 0);
}
