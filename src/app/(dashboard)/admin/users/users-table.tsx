"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Users, Eye, Search } from "lucide-react";

interface UserRow {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  isActive: boolean;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  roles: Array<{ name: string; slug: string }>;
  className: string | null;
}

const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  active: "default",
  blocked: "destructive",
  graduated: "secondary",
  rejected: "destructive",
};

const FILTERS = [
  "all", "pending", "active", "students", "teachers",
  "directors", "vicePrincipals", "admins", "graduates", "blocked", "rejected",
] as const;

type Filter = typeof FILTERS[number];

const ROLE_FILTERS: Record<string, string> = {
  students: "student",
  teachers: "teacher",
  directors: "director",
  vicePrincipals: "vice_principal",
  admins: "admin",
};

export function UsersTable({
  users,
  currentFilter,
  searchQuery,
}: {
  users: UserRow[];
  currentFilter: string;
  searchQuery: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [filter, setFilter] = useState<Filter>((currentFilter as Filter) || "all");
  const [search, setSearch] = useState(searchQuery);

  const filtered = users.filter((user) => {
    if (filter === "pending") return user.status === "pending";
    if (filter === "active") return user.status === "active";
    if (filter === "blocked") return user.status === "blocked";
    if (filter === "graduates") return user.status === "graduated";
    if (filter === "rejected") return user.status === "rejected";
    const roleSlug = ROLE_FILTERS[filter];
    if (roleSlug) return user.roles.some((r) => r.slug === roleSlug);
    return true;
  }).filter((user) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      user.firstName.toLowerCase().includes(q) ||
      user.lastName.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.publicId.toLowerCase().includes(q)
    );
  });

  const filterLabels: Record<Filter, string> = {
    all: t("allUsers"),
    pending: t("pendingFilter"),
    active: t("activeFilter"),
    students: t("studentsFilter"),
    teachers: t("teachersFilter"),
    directors: t("directorsFilter"),
    vicePrincipals: t("vicePrincipalsFilter"),
    admins: t("adminsFilter"),
    graduates: t("graduatesFilter"),
    blocked: t("blockedFilter"),
    rejected: t("rejectedFilter"),
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          placeholder={tc("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary-100 text-primary-700"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title={tc("noData")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userDetails")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("roles")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("requestedClass")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userStatus")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("registrationDate")}</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-600" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary-700">
                            {user.firstName[0]}{user.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-800">
                          {user.lastName} {user.firstName} {user.middleName ?? ""}
                        </p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role.slug} variant="secondary">{role.name}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{user.className ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[user.status] ?? "default"}>
                      {t(`userStatus_${user.status}` as never)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/users/${user.id}`}>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
