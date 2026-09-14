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
                  active ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-line bg-surface text-ink-secondary hover:bg-surface-muted"
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
