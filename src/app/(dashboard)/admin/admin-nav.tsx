"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Users,
  Shield,
  School,
  Boxes,
  FileText,
  Bell,
  ScrollText,
  GraduationCap,
  BookMarked,
  LayoutDashboard,
  Library,
  Ticket,
  Crown,
  Clock,
  Newspaper,
  BarChart3,
} from "lucide-react";

const adminSections = [
  { label: "admin.overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "admin.pendingUsers", href: "/admin/pending", icon: Clock },
  { label: "admin.users", href: "/admin/users", icon: Users },
  { label: "admin.roles", href: "/admin/roles", icon: Shield },
  { label: "admin.school", href: "/admin/school", icon: School },
  { label: "admin.modules", href: "/admin/modules", icon: Boxes },
  { label: "admin.classes", href: "/admin/classes", icon: GraduationCap },
  { label: "admin.graduates", href: "/admin/graduates", icon: GraduationCap },
  { label: "admin.subjects", href: "/admin/subjects", icon: BookMarked },
  { label: "admin.library", href: "/admin/library", icon: Library },
  { label: "admin.content", href: "/admin/content", icon: FileText },
  { label: "admin.notifications", href: "/admin/notifications", icon: Bell },
  { label: "admin.auditLog", href: "/admin/audit", icon: ScrollText },
  { label: "admin.landing", href: "/admin/landing", icon: Crown },
  { label: "admin.directors", href: "/admin/directors", icon: Users },
  { label: "admin.invitations", href: "/admin/invitations", icon: Ticket },
  { label: "admin.news", href: "/admin/news", icon: Newspaper },
  { label: "admin.reports", href: "/admin/reports", icon: BarChart3 },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="mb-6 flex gap-1.5 overflow-x-auto rounded-full border border-neutral-200/80 bg-white/90 p-1.5 shadow-2xs backdrop-blur-sm select-none scrollbar-none">
      {adminSections.map((section) => {
        const isActive = "exact" in section && section.exact
          ? pathname === section.href
          : pathname.startsWith(section.href);
        const Icon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale",
              isActive
                ? "bg-neutral-900 text-white shadow-xs font-bold"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-neutral-400")} />
            <span className="hidden sm:inline">{t(section.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
