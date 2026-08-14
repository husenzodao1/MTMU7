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
} from "lucide-react";

const adminSections = [
  { label: "admin.overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "admin.users", href: "/admin/users", icon: Users },
  { label: "admin.roles", href: "/admin/roles", icon: Shield },
  { label: "admin.school", href: "/admin/school", icon: School },
  { label: "admin.modules", href: "/admin/modules", icon: Boxes },
  { label: "admin.classes", href: "/admin/classes", icon: GraduationCap },
  { label: "admin.subjects", href: "/admin/subjects", icon: BookMarked },
  { label: "admin.library", href: "/admin/library", icon: Library },
  { label: "admin.content", href: "/admin/content", icon: FileText },
  { label: "admin.notifications", href: "/admin/notifications", icon: Bell },
  { label: "admin.auditLog", href: "/admin/audit", icon: ScrollText },
  { label: "admin.landing", href: "/admin/landing", icon: Crown },
  { label: "admin.directors", href: "/admin/directors", icon: Users },
  { label: "admin.invitations", href: "/admin/invitations", icon: Ticket },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm">
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
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
              isActive
                ? "bg-primary-50 text-primary-700"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(section.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
