import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Shown as the card title on small screens. */
  primary?: boolean;
  /** Hidden in the mobile card layout. */
  hideOnMobile?: boolean;
  align?: "start" | "end" | "center";
  className?: string;
  headerClassName?: string;
}

/**
 * Server-rendered table. On screens < md the rows become stacked cards with
 * labelled fields instead of a squeezed table (spec §51, §60).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  actions,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty: ReactNode;
  actions?: (row: T) => ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <div className={cn("rounded-xl border border-line bg-surface", className)}>{empty}</div>;
  }
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);
  const alignClass = (align?: Column<T>["align"]) => (align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start");

  return (
    <div className={cn("rounded-xl border border-line bg-surface shadow-xs", className)}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-muted/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn("px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted", alignClass(column.align), column.headerClassName)}
                >
                  {column.header}
                </th>
              ))}
              {actions ? <th scope="col" className="px-4 py-2.5"><span className="sr-only">—</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-middle hover:bg-surface-muted/50">
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3 text-ink", alignClass(column.align), column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
                {actions ? <td className="px-4 py-3 text-end whitespace-nowrap">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 font-medium text-ink">{primary.cell(row)}</div>
              {actions ? <div className="shrink-0">{actions(row)}</div> : null}
            </div>
            {secondary.length > 0 ? (
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 min-[420px]:grid-cols-2">
                {secondary.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs text-ink-muted">{column.header}</dt>
                    <dd className="text-sm text-ink">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
