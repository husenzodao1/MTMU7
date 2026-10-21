import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { StudentContext } from "@/features/academic/student-context";
import { cn } from "@/lib/utils/cn";

/** Accessible switcher between a guardian's own children (links, no client state). */
export async function ChildSwitcher({ context, pathname }: { context: StudentContext; pathname: string }) {
  if (context.viewer !== "guardian" || context.children.length < 2) return null;
  const t = await getTranslations("portal.children");
  return (
    <nav aria-label={t("switcher")} className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {context.children.map((child) => {
          const active = child.id === context.studentId;
          return (
            <li key={child.id}>
              <Link
                href={`${pathname}?child=${child.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm",
                  active ? "border-brand-600 bg-brand-50 font-semibold text-brand-text-strong" : "border-line bg-surface text-ink-secondary hover:bg-surface-muted"
                )}
              >
                {child.firstName} {child.lastName}
                {child.className ? <span className="text-ink-muted">· {child.className}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The school years the pupil was in a class, as small chips: this year first
 * by default, last year's marks one press away. Shown only when there is more
 * than one year to choose from.
 */
export async function YearSwitcher({ context, pathname }: { context: StudentContext; pathname: string }) {
  if (context.years.length < 2) return null;
  const t = await getTranslations("portal.children");
  const child = context.viewer === "guardian" ? `child=${context.studentId}&` : "";
  return (
    <nav aria-label={t("years")} className="mb-4">
      <ul className="flex gap-1.5 overflow-x-auto pb-0.5">
        {context.years.map((year) => {
          const active = year.id === context.academicYearId;
          return (
            <li key={year.id} className="shrink-0">
              <Link
                href={year.current ? `${pathname}${child ? `?${child.slice(0, -1)}` : ""}` : `${pathname}?${child}year=${year.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs tabular transition-colors",
                  active ? "border-brand-600 bg-brand-50 font-semibold text-brand-text-strong" : "border-line bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {year.name}
                {year.className ? <span className={active ? "font-normal" : "text-ink-muted"}>· {year.className}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
