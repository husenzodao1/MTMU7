"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Search, Users, GraduationCap, BookOpen } from "lucide-react";
import { searchUsers, type SearchResult } from "./actions";

const ROLE_FILTERS = ["all", "student", "teacher"] as const;

export function SearchView() {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    startTransition(async () => {
      const data = await searchUsers(q, roleFilter);
      setResults(data);
      setSearched(true);
    });
  };

  const handleFilterChange = (filter: string) => {
    setRoleFilter(filter);
    if (query.length >= 2) {
      startTransition(async () => {
        const data = await searchUsers(query, filter);
        setResults(data);
        setSearched(true);
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5">
        {ROLE_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => handleFilterChange(filter)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 press-scale ${
              roleFilter === filter
                ? "bg-neutral-900 text-white shadow-sm"
                : "bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/80"
            }`}
          >
            {t(`filter_${filter}`)}
          </button>
        ))}
      </div>

      {isPending && (
        <p className="text-center text-sm text-neutral-500">{tc("loading")}</p>
      )}

      {!isPending && searched && results.length === 0 && (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title={t("noResults")}
          description={t("noResultsDesc")}
        />
      )}

      {!isPending && results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.id}`}
              className="flex items-center gap-3 rounded-[20px] border border-neutral-200/70 bg-white p-3.5 transition-all duration-150 hover:border-neutral-300 hover:shadow-sm press-scale"
            >
              <Avatar
                src={user.avatarUrl}
                fallback={`${user.firstName[0]}${user.lastName[0]}`}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-800">
                  {user.lastName} {user.firstName}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {user.roleSlug === "student" && <GraduationCap className="mr-0.5 h-3 w-3" />}
                    {user.roleSlug === "teacher" && <BookOpen className="mr-0.5 h-3 w-3" />}
                    {user.roleName}
                  </Badge>
                  {user.className && (
                    <span className="text-xs text-neutral-500">{user.className}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!searched && !isPending && (
        <p className="pt-8 text-center text-sm text-neutral-400">{t("searchHint")}</p>
      )}
    </div>
  );
}
