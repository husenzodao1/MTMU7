import "server-only";
import { can, canAny, canEnterAdmin, hasModule, hasRole, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

export type IconName =
  | "dashboard" | "teach" | "schedule" | "grades" | "attendance" | "homework" | "children" | "library" | "news"
  | "announcements" | "events" | "documents" | "messages" | "notifications" | "admin" | "contacts"
  | "students" | "staff" | "guardians" | "users" | "approvals" | "invitations" | "years" | "classes" | "subjects"
  | "gradebook" | "timetable" | "media" | "website" | "broadcasts" | "moderation" | "school" | "roles" | "modules"
  | "platform" | "reports" | "analytics" | "audit" | "settings" | "status" | "search" | "support" | "archive";

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

/** The support desk, at the foot of every menu. */
const SUPPORT: NavItem = { key: "support", href: "/support/contact", icon: "support", labelKey: "nav.support" };

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
  // News, announcements and events are read in one place, with filters
  // (/updates); the three older pages still answer for links into them.
  {
    item: { key: "news", href: "/updates", icon: "news", labelKey: "nav.updates" },
    visible: (a) => moduleAnd("news", "news.view")(a) || moduleAnd("announcements", "announcements.view")(a) || moduleAnd("events", "events.view")(a),
  },
  { item: { key: "documents", href: "/documents", icon: "documents", labelKey: "nav.documents" }, visible: moduleAnd("documents", "documents.view") },
  { item: { key: "notifications", href: "/notifications", icon: "notifications", labelKey: "nav.notifications" }, visible: () => true },
  { item: { key: "contacts", href: "/friends", icon: "contacts", labelKey: "nav.contacts" }, visible: (a) => hasModule(a, "friends") },
  // Last, like any other item: the floating button that used to sit over
  // every page is gone.
  { item: SUPPORT, visible: () => true },
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
      // Every account in one block: pupils, teachers, parents, administrators,
      // with the parents' bot beside them. The older per-kind pages still
      // answer (a pupil's academic record, roles and history are linked from
      // the account), but the menu has one way in.
      { item: { key: "accounts", href: "/admin/accounts", icon: "users", labelKey: "admin.nav.accounts" }, visible: anyOf("users.view") },
      { item: { key: "students", href: "/admin/students", icon: "students", labelKey: "admin.nav.students" }, visible: (a) => !can(a, "users.view") && canAny(a, ["students.create", "students.update", "students.archive"]) },
      { item: { key: "staff", href: "/admin/staff", icon: "staff", labelKey: "admin.nav.staff" }, visible: (a) => !can(a, "users.view") && canAny(a, ["staff.create", "staff.update", "staff.archive"]) },
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
      // The academic year names and turns itself over (00086): no page for it.
      { item: { key: "classes", href: "/admin/classes", icon: "classes", labelKey: "admin.nav.classes" }, visible: anyOf("classes.create", "classes.update", "enrollments.manage") },
      { item: { key: "subjects", href: "/admin/subjects", icon: "subjects", labelKey: "admin.nav.subjects" }, visible: anyOf("subjects.manage") },
      { item: { key: "gradebook", href: "/admin/gradebook", icon: "gradebook", labelKey: "admin.nav.gradebook" }, visible: anyOf("grades.approve", "grades.update", "assessments.manage") },
      { item: { key: "attendance", href: "/admin/attendance", icon: "attendance", labelKey: "admin.nav.attendance" }, visible: anyOf("attendance.update") },
      { item: { key: "timetable", href: "/admin/timetable", icon: "timetable", labelKey: "admin.nav.timetable" }, visible: anyOf("timetable.manage") },
      // Every year's classes, journals and documents, kept to be read (admin/archive).
      { item: { key: "archive", href: "/admin/archive", icon: "archive", labelKey: "admin.nav.archive" }, visible: anyOf("classes.view", "grades.view", "grades.approve", "grades.update", "reports.view") },
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
    ],
  },
  {
    key: "communication",
    labelKey: "admin.nav.groups.communication",
    rules: [
      { item: { key: "broadcasts", href: "/admin/notifications", icon: "broadcasts", labelKey: "admin.nav.notifications" }, visible: anyOf("notifications.send") },
      { item: { key: "support", href: "/admin/support", icon: "support", labelKey: "admin.nav.support" }, visible: anyOf("messages.moderate") },
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
    ],
  },
];

export function adminNavigation(access: Access): NavGroup[] {
  const groups = ADMIN_GROUPS.map((group) => ({
    key: group.key,
    labelKey: group.labelKey,
    items: group.rules.filter((rule) => rule.visible(access)).map((rule) => rule.item),
  })).filter((group) => group.items.length > 0);
  // Whoever answers the support desk has it in the office already; everybody
  // else finds their own way to it at the foot of the menu.
  if (!groups.some((group) => group.items.some((item) => item.key === "support"))) {
    groups.push({ key: "help", labelKey: "", items: [SUPPORT] });
  }
  return groups;
}
