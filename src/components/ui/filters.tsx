"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { SearchingPanel, useSearchSweep } from "@/components/ui/searching";

export interface FilterDefinition {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Label of the empty choice (defaults to "All"). */
  emptyLabel?: string;
}

/** The URL's search and filters, and a way to change them. */
function useFilterState(filters: FilterDefinition[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  // A search typed and sent shows the magnifying glass; a filter changed does not.
  const [bySearch, setBySearch] = useState(false);
  const { searching, start: sweep, round } = useSearchSweep(pending && bySearch);

  const navigate = (patch: Record<string, string | null>, fromSearch = false) => {
    setBySearch(fromSearch);
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
    sweep();
    navigate({ q: query.trim() || null }, true);
  };

  const clear = () => {
    setQuery("");
    navigate(Object.fromEntries([["q", null], ...filters.map((f) => [f.name, null])]));
  };

  return { params, query, setQuery, pending, searching, round, navigate, onSubmit, clear };
}

/**
 * Server-backed search and filter toolbar. State lives in the URL so results
 * are shareable, paginated on the server and work with the back button.
 *
 * `folded` keeps only the search on view, with a small filter button beside
 * it; the filters open under it as rows of choices (FoldedFilterBar).
 */
export function FilterBar({
  searchLabel,
  filters = [],
  searchPlaceholder,
  folded = false,
}: {
  searchLabel?: string;
  filters?: FilterDefinition[];
  searchPlaceholder?: string;
  folded?: boolean;
}) {
  if (folded) return <FoldedFilterBar searchLabel={searchLabel ?? ""} filters={filters} searchPlaceholder={searchPlaceholder} />;
  return <OpenFilterBar searchLabel={searchLabel} filters={filters} searchPlaceholder={searchPlaceholder} />;
}

function OpenFilterBar({ searchLabel, filters, searchPlaceholder }: { searchLabel?: string; filters: FilterDefinition[]; searchPlaceholder?: string }) {
  const t = useTranslations("common");
  const { params, query, setQuery, pending, searching, round, navigate, onSubmit, clear } = useFilterState(filters);
  const active = Boolean(params.get("q")) || filters.some((f) => params.get(f.name));

  return (
    <div className="filter-bar mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end" aria-busy={pending} data-searching={searching || undefined}>
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
            <option value="">{filter.emptyLabel ?? t("all")}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {active ? (
        <Button variant="ghost" onClick={clear}>
          <X aria-hidden />
          {t("clearFilters")}
        </Button>
      ) : null}
      {searching ? <SearchingPanel key={round} label={t("searching")} /> : null}
    </div>
  );
}

/**
 * One rounded search field and, beside it, a filter button: three lines, each
 * shorter than the last. The button says how many filters are on with a small
 * number; pressed, it lifts open a panel under the field with every filter as
 * a row of choices — the one chosen filled, a tap on another applies it at
 * once. Enter, or the keyboard's search key, sends the search.
 */
function FoldedFilterBar({ searchLabel, filters: all, searchPlaceholder }: { searchLabel: string; filters: FilterDefinition[]; searchPlaceholder?: string }) {
  const t = useTranslations("common");
  // A filter with nothing to choose from (a library without categories yet) is left out.
  const filters = all.filter((filter) => filter.options.length > 0);
  const { params, query, setQuery, pending, searching, round, navigate, onSubmit, clear } = useFilterState(filters);
  const [open, setOpen] = useState(false);
  const id = useId();
  const panelId = `${id}-filters`;
  const on = filters.filter((f) => params.get(f.name)).length;

  return (
    <div className="filter-bar filter-fold mb-4 sm:max-w-2xl" aria-busy={pending} data-searching={searching || undefined}>
      <div className="flex items-center gap-2">
        <form role="search" onSubmit={onSubmit} className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-q`} className="sr-only">
            {searchLabel}
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            id={`${id}-q`}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? searchLabel}
            className="filter-fold-input h-11 rounded-full pl-10 pr-4"
            maxLength={100}
          />
        </form>
        {filters.length > 0 ? (
          <button
            type="button"
            className="filter-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            data-open={open || undefined}
            onClick={() => setOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" className="filter-glyph" aria-hidden>
              <path d="M4 7h16" />
              <path d="M7 12h10" />
              <path d="M10 17h4" />
            </svg>
            <span className="sr-only">{on ? `${t("filter")} (${on})` : t("filter")}</span>
            {on ? (
              <span className="filter-count" aria-hidden>
                {on}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {filters.length > 0 ? (
        <div id={panelId} className="filter-panel" data-open={open || undefined} inert={!open}>
          <div className="filter-panel-clip">
            <div className="filter-panel-body">
              {filters.map((filter) => {
                const current = params.get(filter.name) ?? "";
                const labelId = `${id}-${filter.name}`;
                return (
                  <div key={filter.name} role="group" aria-labelledby={labelId} className="filter-group">
                    <p id={labelId} className="filter-group-label">
                      {filter.label}
                    </p>
                    <div className="filter-chips">
                      {[{ value: "", label: filter.emptyLabel ?? t("all") }, ...filter.options].map((option) => (
                        <button
                          key={option.value || "all"}
                          type="button"
                          className="filter-chip"
                          aria-pressed={current === option.value}
                          onClick={() => navigate({ [filter.name]: option.value || null })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {on || params.get("q") ? (
                <button type="button" className="filter-clear" onClick={clear}>
                  <X aria-hidden />
                  {t("clearFilters")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {searching ? <SearchingPanel key={round} label={t("searching")} /> : null}
    </div>
  );
}
