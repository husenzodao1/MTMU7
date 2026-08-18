"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { GraduationCap, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Graduate {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  avatarUrl: string | null;
  graduationYear: number | null;
  yearsInSchool: number | null;
  lastClass: string | null;
  publicId: string;
}

export function GraduatesList({ graduates }: { graduates: Graduate[] }) {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const years = [...new Set(graduates.map((g) => g.graduationYear).filter(Boolean))] as number[];
  years.sort((a, b) => b - a);

  const filtered = graduates.filter((g) => {
    if (yearFilter !== "all" && g.graduationYear !== Number(yearFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.firstName.toLowerCase().includes(q) ||
      g.lastName.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder={t("search" as never) ?? "Search..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("graduationYear")}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-12 w-12" />}
          title={t("noGraduates")}
          description={t("noGraduatesDesc")}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userDetails")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("graduationYear")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("requestedClass")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("yearsInSchool")}</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-600" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                        {g.avatarUrl ? (
                          <img src={g.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary-700">
                            {g.firstName[0]}{g.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-800">
                          {g.firstName} {g.lastName} {g.middleName ?? ""}
                        </p>
                        <p className="text-xs text-neutral-500">{g.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{g.graduationYear ?? "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{g.lastClass ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{g.yearsInSchool ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/users/${g.id}`}>
                      <Button variant="ghost" size="sm">
                        {t("enrollmentHistory")}
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
