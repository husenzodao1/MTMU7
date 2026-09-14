"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";

export interface FilterDefinition {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * Server-backed search and filter toolbar. State lives in the URL so results
 * are shareable, paginated on the server and work with the back button.
 */
export function FilterBar({ searchLabel, filters = [], searchPlaceholder }: { searchLabel?: string; filters?: FilterDefinition[]; searchPlaceholder?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  const navigate = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate({ q: query.trim() || null });
  };

  const active = Boolean(params.get("q")) || filters.some((f) => params.get(f.name));

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end" aria-busy={pending}>
      {searchLabel !== undefined ? (
        <form role="search" onSubmit={onSubmit} className="flex min-w-0 flex-1 gap-2 sm:min-w-64 sm:max-w-md">
          <label htmlFor="filter-q" className="sr-only">
            {searchLabel}
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input id="filter-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder ?? searchLabel} className="pl-9" maxLength={100} />
          </div>
          <Button type="submit" variant="secondary">
            {t("search")}
          </Button>
        </form>
      ) : null}
      {filters.map((filter) => (
        <div key={filter.name} className="sm:w-48">
          <label htmlFor={`filter-${filter.name}`} className="mb-1 block text-xs font-medium text-ink-muted">
            {filter.label}
          </label>
          <Select id={`filter-${filter.name}`} value={params.get(filter.name) ?? ""} onChange={(e) => navigate({ [filter.name]: e.target.value || null })}>
            <option value="">{t("all")}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {active ? (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("");
            navigate(Object.fromEntries([["q", null], ...filters.map((f) => [f.name, null])]));
          }}
        >
          <X aria-hidden />
          {t("clearFilters")}
        </Button>
      ) : null}
    </div>
  );
}
