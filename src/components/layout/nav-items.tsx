import {
  LayoutDashboard, MessageSquare, BookOpen, GraduationCap,
  ClipboardCheck, FileText, Calendar, FolderOpen,
  PartyPopper, Megaphone, BarChart3, Settings, Shield, Info
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleSlug?: string;
  adminOnly?: boolean;
}

export const mainNavItems: NavItem[] = [
  { label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "nav.messages", href: "/messages", icon: MessageSquare, moduleSlug: "messages" },
  { label: "nav.library", href: "/library", icon: BookOpen, moduleSlug: "library" },
  { label: "nav.grades", href: "/grades", icon: GraduationCap, moduleSlug: "grades" },
  { label: "nav.attendance", href: "/attendance", icon: ClipboardCheck, moduleSlug: "attendance" },
  { label: "nav.homework", href: "/homework", icon: FileText, moduleSlug: "homework" },
  { label: "nav.schedule", href: "/schedule", icon: Calendar, moduleSlug: "schedule" },
  { label: "nav.documents", href: "/documents", icon: FolderOpen, moduleSlug: "documents" },
  { label: "nav.events", href: "/events", icon: PartyPopper, moduleSlug: "events" },
  { label: "nav.announcements", href: "/announcements", icon: Megaphone, moduleSlug: "announcements" },
  { label: "nav.reports", href: "/reports", icon: BarChart3, moduleSlug: "reports" },
];

export const bottomNavItems: NavItem[] = [
  { label: "nav.admin", href: "/admin", icon: Shield, adminOnly: true },
  { label: "nav.settings", href: "/settings", icon: Settings },
  { label: "nav.about", href: "/about", icon: Info },
];
