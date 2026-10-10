export type SearchParams = Record<string, string | string[] | undefined>;

/** How many pages a list grows to by scrolling, at most. */
export const MAX_PAGES = 20;

export interface ListParams<S extends string> {
  /** How many pages are shown: lists grow as they are scrolled (ui/pagination.tsx). */
  page: number;
  /** Rows to fetch: every page so far. */
  pageSize: number;
  /** Rows per page. */
  perPage: number;
  /** Always 0: the list starts at the top and grows. */
  offset: number;
  query: string;
  sort: S;
  filters: Record<string, string>;
}

export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalizes list URL parameters: page numbers are clamped, sort keys and
 * filter values are restricted to allow-lists so they can safely reach queries.
 */
export function parseListParams<S extends string>(
  params: SearchParams,
  options: {
    sorts: readonly S[];
    defaultSort: S;
    filters?: Record<string, readonly string[] | "uuid" | "date" | "any">;
    pageSize?: number;
  }
): ListParams<S> {
  const perPage = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
  const pageRaw = Number.parseInt(firstValue(params.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, MAX_PAGES) : 1;
  const query = (firstValue(params.q) ?? "").trim().slice(0, 100);
  const sortRaw = firstValue(params.sort);
  const sort = options.sorts.includes(sortRaw as S) ? (sortRaw as S) : options.defaultSort;

  const filters: Record<string, string> = {};
  for (const [name, rule] of Object.entries(options.filters ?? {})) {
    const value = firstValue(params[name]);
    if (!value) continue;
    if (rule === "uuid" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) filters[name] = value;
    else if (rule === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) filters[name] = value;
    else if (rule === "any") filters[name] = value.slice(0, 100);
    else if (Array.isArray(rule) && rule.includes(value)) filters[name] = value;
  }

  return { page, pageSize: page * perPage, perPage, offset: 0, query, sort, filters };
}

/** Escapes a user search term for PostgREST ilike filters. */
export function ilikePattern(query: string): string {
  return `%${query.replace(/[\\%_,()]/g, (c) => `\\${c}`)}%`;
}

/**
 * Builds a multi-column PostgREST `or` ilike filter. Characters that carry
 * meaning in the `or` grammar or in LIKE patterns are removed from the term,
 * so user input can never add conditions.
 */
export function ilikeAny(columns: readonly string[], query: string): string | null {
  const term = query.replace(/[\\%_,()"'*:.]/g, " ").replace(/\s+/g, " ").trim();
  if (!term) return null;
  return columns.map((column) => `${column}.ilike.%${term}%`).join(",");
}

export function buildQueryString(base: SearchParams, patch: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    const v = firstValue(value);
    if (v !== undefined && v !== "") params.set(key, v);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
