import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("rounded-xl border border-line bg-surface shadow-xs", className)}>{children}</Tag>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5", className)}>{children}</div>;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, label }: { items: Crumb[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded-sm hover:text-ink hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-ink-secondary" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 sm:mb-6">
      {breadcrumb}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink sm:text-[1.625rem]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-ink-secondary sm:text-base">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

const alertTones = {
  info: { box: "border-brand-200 bg-info-50 text-brand-text-strong", Icon: Info },
  success: { box: "border-success-600/30 bg-success-50 text-success-700", Icon: CircleCheck },
  warning: { box: "border-warning-600/30 bg-warning-50 text-warning-700", Icon: TriangleAlert },
  danger: { box: "border-danger-600/30 bg-danger-50 text-danger-700", Icon: CircleAlert },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = alertTones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
        {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 text-ink-muted [&_svg]:size-8" aria-hidden>{icon}</div> : null}
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-sunken", className)} aria-hidden />;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function DescriptionList({ items, className }: { items: Array<{ term: ReactNode; description: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((item, i) => (
        <div key={i} className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm text-ink-muted">{item.term}</dt>
          <dd className="text-sm text-ink sm:col-span-2">{item.description ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Compact metric for operational dashboards (not a hero card). */
export function Metric({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "attention" }) {
  const content = (
    <>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold tabular text-ink", tone === "attention" && "text-warning-700")}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-sm text-ink-muted">{hint}</dd> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
      <dl>{content}</dl>
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <dl>{content}</dl>
    </div>
  );
}
