export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<S extends string> {
  page: number;
  pageSize: number;
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
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
  const pageRaw = Number.parseInt(firstValue(params.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1;
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

  return { page, pageSize, offset: (page - 1) * pageSize, query, sort, filters };
}

/** Escapes a user search term for PostgREST ilike filters. */
export function ilikePattern(query: string): string {
  return `%${query.replace(/[\\%_,()]/g, (c) => `\\${c}`)}%`;
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
